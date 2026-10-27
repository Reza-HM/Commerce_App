import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
const command = process.argv[2];
const {commandEnvironment} = createRequire(import.meta.url)('./database-environment.cjs');
const databaseBuild = ['run', 'build', '--workspace', '@commerce/database'];
const commands = {
  typecheck: [databaseBuild, ['exec', '--workspace', '@commerce/web', '--', 'next', 'typegen'], ['run', 'typecheck', '--workspaces'], ['exec', '--', 'tsc', '--project', 'tsconfig.test.json', '--noEmit']],
  test: [databaseBuild],
  'test:integration': [databaseBuild, ['run', 'build', '--workspace', '@commerce/api']],
  'test:smoke': [databaseBuild, ['run', 'build', '--workspace', '@commerce/api']],
  'test:e2e': [databaseBuild, ['run', 'build', '--workspace', '@commerce/api'], ['run', 'build', '--workspace', '@commerce/web']],
  'db:migrate': [databaseBuild],
  build: [databaseBuild, ['run', 'build', '--workspace', '@commerce/api'], ['run', 'build', '--workspace', '@commerce/web']],
  'dev:api': [databaseBuild, ['run', 'build', '--workspace', '@commerce/api'], ['run', 'dev', '--workspace', '@commerce/api']]
};

if (!npmCli || !Object.hasOwn(commands, command)) {
  console.error('Run a documented workspace command through npm.');
  process.exit(1);
}

let childEnvironment = process.env;
try { childEnvironment = commandEnvironment(command); }
catch { console.error('Invalid local database environment'); process.exit(1); }

function run(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: {...childEnvironment, NEXT_TELEMETRY_DISABLED: '1', ...(command === 'test:e2e' ? {DATABASE_URL: 'web-build-private-sentinel', PRIVATE_SENTINEL: 'web-build-private-sentinel', NEXT_PUBLIC_API_ORIGIN: 'http://127.0.0.1:4174'} : {})}
  });
  if (result.error || result.status !== 0) {
    console.error(`Workspace step failed: ${label}`);
    process.exit(result.status || 1);
  }
}

for (const args of commands[command]) run([npmCli, ...args], args.join(' '));
if (command === 'test') {
  run(['--experimental-vm-modules', fileURLToPath(new URL('../node_modules/jest/bin/jest.js', import.meta.url)), '--runInBand'], 'unit tests');
}
if (command === 'test:integration') run(['scripts/integration.cjs'], 'live integration');
if (command === 'db:migrate') run(['scripts/migrate.cjs'], 'migration');
if (command === 'test:smoke') run(['--test', 'tests/smoke/api.test.cjs'], 'API process smoke');
if (command === 'test:e2e') run(['node_modules/@playwright/test/cli.js', 'test'], 'browser smoke');
