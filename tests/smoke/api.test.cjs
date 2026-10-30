const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, fork } = require('node:child_process');
const { createServer } = require('node:net');
const { once } = require('node:events');
const { resolve } = require('node:path');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  rmdirSync,
} = require('node:fs');
const { spawnSync } = require('node:child_process');

async function unusedPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const runtimeEnv = (port) => ({
  ...process.env,
  NODE_ENV: 'production',
  MAIL_PROVIDER: 'capture',
  MAIL_SMTP_HOST: '127.0.0.1',
  MAIL_SMTP_PORT: '1025',
  VERIFICATION_WEB_ORIGIN: 'http://127.0.0.1:3000',
  WEB_ORIGINS: 'http://127.0.0.1:3000',
  API_PORT: String(port),
  DATABASE_URL: 'postgres://fixture:private-password@127.0.0.1:1/unavailable',
  DATABASE_TLS_MODE: undefined,
  NODE_TLS_REJECT_UNAUTHORIZED: undefined,
  DATABASE_CA_FILE: undefined,
});
async function boot(env) {
  const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const timeout = setTimeout(() => child.kill(), 10000);
  try {
    while (!output.includes('"event":"startup"')) {
      if (child.exitCode !== null || child.signalCode !== null)
        throw Error('API did not start');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return child;
  } finally {
    clearTimeout(timeout);
  }
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exit = once(child, 'exit');
  child.kill('SIGTERM');
  await exit;
}

test('production API replicas start with dependency unavailable and restart independently', async () => {
  const endpoint = createServer((socket) => socket.destroy());
  endpoint.listen(0, '127.0.0.1');
  await once(endpoint, 'listening');
  const dependency = endpoint.address().port;
  const ports = [await unusedPort(), await unusedPort()];
  const envs = ports.map((port) => ({
    ...runtimeEnv(port),
    DATABASE_URL: `postgres://fixture:private-password@127.0.0.1:${dependency}/unavailable`,
  }));
  const children = [];
  try {
    children.push(await boot(envs[0]));
    children.push(await boot(envs[1]));
    async function probes(port) {
      const live = await fetch(`http://127.0.0.1:${port}/health/live`);
      assert.equal(live.status, 200);
      assert.deepEqual(await live.json(), { status: 'ok' });
      const start = performance.now();
      const ready = await fetch(`http://127.0.0.1:${port}/health/ready`);
      assert.equal(ready.status, 503);
      assert.ok(performance.now() - start < 2500);
    }
    await probes(ports[0]);
    await probes(ports[1]);
    await stop(children[0]);
    await probes(ports[1]);
    children[0] = await boot(envs[0]);
    await probes(ports[0]);
    await probes(ports[1]);
  } finally {
    for (const child of children) await stop(child);
    await new Promise((resolve) => endpoint.close(resolve));
  }
});

test('blocked captured-email work reaches the hard shutdown deadline after HTTP acknowledgment', async () => {
  const child = fork(resolve('tests/fixtures/api-child.cjs'), ['verification'], {
    env: { ...runtimeEnv(3001), API_SHUTDOWN_TIMEOUT_MS: '200' },
    silent: true,
  });
  try {
    const [{ port }] = await once(child, 'message');
    const entered = once(child, 'message');
    const response = fetch(
      `http://127.0.0.1:${port}/accounts/email-verification/request`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Commerce-Request': '1' },
        body: JSON.stringify({ email: 'synthetic@example.test' }),
      },
    );
    const [event] = await entered;
    assert.equal(event.event, 'verification_started');
    assert.equal((await response).status, 202);
    const exited = once(child, 'exit'),
      started = performance.now();
    child.send('close');
    const [code] = await exited;
    assert.equal(code, 1);
    assert.ok(performance.now() - started < 2000);
  } finally {
    await stop(child);
  }
});

test('invalid production configuration exits nonzero before listening without secret output', async () => {
  const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: { ...runtimeEnv(3001), DATABASE_URL: 'bad PRIVATE_URL_SECRET' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  const [code] = await once(child, 'exit');
  assert.notEqual(code, 0);
  assert.match(output, /DATABASE_URL/);
  assert.doesNotMatch(output, /PRIVATE_URL_SECRET|"event":"startup"/);
});

test('test-only blocked request forces nonzero child termination by shutdown deadline', async () => {
  const child = fork(resolve('tests/fixtures/api-child.cjs'), [], {
    env: { ...runtimeEnv(3001), API_SHUTDOWN_TIMEOUT_MS: '200' },
    silent: true,
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  try {
    const [{ port }] = await once(child, 'message');
    const entered = once(child, 'message');
    const request = fetch(`http://127.0.0.1:${port}/health/ready`).catch(() => undefined);
    const [event] = await entered;
    assert.equal(event.event, 'probe_started');
    const exit = once(child, 'exit');
    const start = performance.now();
    child.send('close');
    const [code] = await exit;
    assert.equal(code, 1, stderr);
    assert.ok(performance.now() - start < 1000);
    await request;
  } finally {
    if (child.exitCode === null) child.kill();
  }
});

test('blocked registration after disconnect reaches the hard shutdown deadline', async () => {
  const child = fork(resolve('tests/fixtures/api-child.cjs'), ['registration'], {
    env: { ...runtimeEnv(3001), API_SHUTDOWN_TIMEOUT_MS: '200' },
    silent: true,
  });
  try {
    const [{ port }] = await once(child, 'message');
    const started = once(child, 'message');
    const controller = new AbortController();
    const request = fetch(`http://127.0.0.1:${port}/accounts/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'fixture@example.invalid',
        password: 'Synthetic blocked passphrase',
      }),
      signal: controller.signal,
    }).catch(() => undefined);
    const [event] = await started;
    assert.equal(event.event, 'registration_started');
    controller.abort();
    await request;
    const exit = once(child, 'exit'),
      beginning = performance.now();
    child.send('close');
    const [code] = await exit;
    assert.equal(code, 1);
    assert.ok(performance.now() - beginning < 1000);
  } finally {
    if (child.exitCode === null) child.kill();
  }
});

test('compiled registration construction fails safely for missing and corrupt policy assets', () => {
  const folder = mkdtempSync(join(tmpdir(), 'commerce-policy-smoke-'));
  const files = [
    'service.js',
    'admission.js',
    'validation.js',
    'password-hasher.js',
    'password-policy.js',
  ];
  const asset = join(folder, 'assets', '10k-most-common.txt');
  try {
    for (const name of files)
      copyFileSync(resolve('apps/api/dist/accounts', name), join(folder, name));
    mkdirSync(join(folder, 'assets'));
    const run = () =>
      spawnSync(
        process.execPath,
        [
          '-e',
          'try { const {RegistrationService}=require(process.argv[1]); new RegistrationService({create:async()=>{throw Error("unexpected persistence");}}); } catch(error) { console.error(error.message); process.exitCode=1; }',
          join(folder, 'service.js'),
        ],
        { env: runtimeEnv(3001), encoding: 'utf8', timeout: 10000 },
      );
    const missing = run();
    assert.equal(missing.status, 1);
    assert.equal(missing.stderr.trim(), 'Account password policy unavailable');
    writeFileSync(asset, 'PUBLIC_CORRUPT_POLICY_TEST_DATA');
    const corrupt = run();
    assert.equal(corrupt.status, 1);
    assert.equal(corrupt.stderr.trim(), 'Account password policy unavailable');
  } finally {
    for (const name of files) unlinkSync(join(folder, name));
    unlinkSync(asset);
    rmdirSync(join(folder, 'assets'));
    rmdirSync(folder);
  }
});
