import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
const command = process.argv[2];
const databaseBuild = ['run', 'build', '--workspace', '@commerce/database'];
const commands = {
  typecheck: [databaseBuild, ['run', 'typecheck', '--workspaces'], ['exec', '--', 'tsc', '--project', 'tsconfig.test.json', '--noEmit']],
  test: [databaseBuild],
  build: [databaseBuild, ['run', 'build', '--workspace', '@commerce/api'], ['run', 'build', '--workspace', '@commerce/web']],
  'dev:api': [databaseBuild, ['run', 'build', '--workspace', '@commerce/api'], ['run', 'dev', '--workspace', '@commerce/api']]
};

if (!npmCli || !Object.hasOwn(commands, command)) {
  console.error('Run a documented workspace command through npm.');
  process.exit(1);
}

function run(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: {...process.env, NEXT_TELEMETRY_DISABLED: '1'}
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
