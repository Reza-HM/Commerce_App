const { spawn, spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { gmailEnvironment } = require('./gmail-prompt.cjs');
const { commandEnvironment } = require('./database-environment.cjs');

(async () => {
  if (!process.env.npm_execpath) throw new Error('Run through npm run dev:api:gmail');
  // Finish compiler/tooling processes before requesting the private credential.
  for (const workspace of ['@commerce/database', '@commerce/api']) {
    const result = spawnSync(
      process.execPath,
      [process.env.npm_execpath, 'run', 'build', '--workspace', workspace],
      { stdio: 'inherit', windowsHide: true },
    );
    if (result.error || result.status !== 0) throw new Error('API build failed');
  }
  const environment = commandEnvironment('dev:api', await gmailEnvironment());
  const onInterrupt = () => {}; // The foreground child receives the console signal too.
  process.on('SIGINT', onInterrupt);
  try {
    const child = spawn(
      process.execPath,
      ['--watch', '--enable-source-maps', 'dist/main.js'],
      {
        cwd: resolve(__dirname, '../apps/api'),
        env: environment,
        stdio: 'inherit',
        windowsHide: true,
      },
    );
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
    });
  } finally {
    delete environment.GMAIL_SMTP_APP_PASSWORD;
    process.removeListener('SIGINT', onInterrupt);
  }
})().catch(() => {
  console.error('Gmail API startup failed or was cancelled. No credentials were saved.');
  process.exitCode = 1;
});
