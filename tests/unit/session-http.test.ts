import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { createRuntime } from '../../apps/api/src/runtime';
import { readApiConfiguration } from '../../apps/api/src/configuration';
import { RegistrationService } from '../../apps/api/src/accounts/service';
import { SessionService } from '../../apps/api/src/accounts/sessions';
import { hashPassword } from '../../apps/api/src/accounts/password-hasher';
import type { SessionRepository } from '../../packages/database/src/sessions';

const api = JSON.parse(readFileSync('docs/api/openapi.json', 'utf8')) as {
  paths: Record<
    string,
    Record<
      string,
      { responses: Record<string, { content?: Record<string, { schema: object }> }> }
    >
  >;
  components: object;
};
const validator = new Ajv2020({ strict: false });
addFormats(validator);
function matchesContract(path: string, method: string, status: number, body: unknown) {
  const schema =
    api.paths[path]![method]!.responses[String(status)]!.content!['application/json']!
      .schema;
  expect(validator.validate({ ...schema, components: api.components }, body)).toBe(true);
}

test('sign-in, current session and sign-out enforce cookies and origin guards', async () => {
  const password = 'Synthetic session passphrase';
  const hash = await hashPassword(password);
  const accountId = randomUUID();
  const sessions = new Map<string, string>();
  let unavailable = false;
  const repository: SessionRepository = {
    credential: async (email) =>
      email === 'reader@example.com' ? { accountId, passwordHash: hash } : undefined,
    create: async (_id, account, digest) => {
      sessions.set(digest, account);
      return new Date(Date.now() + 12 * 3600000);
    },
    renew: async (digest) => sessions.get(digest),
    revoke: async (digest) => {
      if (unavailable)
        throw Object.assign(new Error('synthetic'), { code: 'ECONNREFUSED' });
      sessions.delete(digest);
    },
  };
  const registration = new RegistrationService({
    create: async () => ({ kind: 'existing' }),
  });
  const service = new SessionService(repository, registration);
  const config = readApiConfiguration({
    NODE_ENV: 'development',
    DATABASE_URL: 'postgres://fixture:synthetic@127.0.0.1/test',
    WEB_ORIGINS: 'http://localhost:3000',
  });
  const logs: unknown[] = [];
  const runtime = await createRuntime(
    config,
    { ready: async () => true, close: async () => {} },
    (event) => logs.push(event),
    registration,
    service,
  );
  await runtime.listen(0);
  try {
    const base = `http://127.0.0.1:${(runtime.server.address() as { port: number }).port}/accounts/sessions`;
    const headers = {
      'content-type': 'application/json',
      'x-commerce-request': '1',
      origin: 'http://localhost:3000',
    };
    const denied = await fetch(base, {
      method: 'POST',
      headers: { ...headers, origin: 'http://evil.example' },
      body: JSON.stringify({ email: 'reader@example.com', password }),
    });
    expect(denied.status).toBe(403);
    expect((await fetch(base + '/current')).status).toBe(403);
    const preflight = await fetch(base, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'POST',
      },
    });
    expect(preflight.headers.get('access-control-allow-credentials')).toBe('true');
    const response = await fetch(base, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'reader@example.com', password }),
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-credentials')).toBe('true');
    const signedIn = await response.json();
    expect(signedIn).toEqual({ status: 'signed_in' });
    matchesContract('/accounts/sessions', 'post', 201, signedIn);
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    const current = await fetch(base + '/current', {
      headers: { 'x-commerce-request': '1', cookie },
    });
    const currentBody = await current.json();
    expect(currentBody).toEqual({ status: 'signed_in', accountId });
    matchesContract('/accounts/sessions/current', 'get', 200, currentBody);
    const logout = await fetch(base + '/current', {
      method: 'DELETE',
      headers: { 'x-commerce-request': '1', cookie },
    });
    expect(logout.status).toBe(204);
    expect(logout.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970');
    expect(
      (await fetch(base + '/current', { headers: { 'x-commerce-request': '1', cookie } }))
        .status,
    ).toBe(401);
    const bad = async (email: string) =>
      fetch(base, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, password: 'synthetic wrong password' }),
      });
    const missing = await bad('missing@example.com');
    const wrong = await bad('reader@example.com');
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    const missingBody = (await missing.json()) as { error: string; message: string };
    const wrongBody = (await wrong.json()) as { error: string; message: string };
    matchesContract('/accounts/sessions', 'post', 401, wrongBody);
    expect([missingBody.error, missingBody.message]).toEqual([
      wrongBody.error,
      wrongBody.message,
    ]);
    const renewed = await fetch(base, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email: 'reader@example.com', password }),
    });
    const activeCookie = renewed.headers.get('set-cookie')!;
    unavailable = true;
    const failedLogout = await fetch(base + '/current', {
      method: 'DELETE',
      headers: { 'x-commerce-request': '1', cookie: activeCookie },
    });
    expect(failedLogout.status).toBe(503);
    expect(failedLogout.headers.get('set-cookie')).toContain('Expires=Thu, 01 Jan 1970');
    unavailable = false;
    expect(
      (
        await fetch(base + '/current', {
          headers: { 'x-commerce-request': '1', cookie: activeCookie },
        })
      ).status,
    ).toBe(200);
    expect(JSON.stringify(logs)).not.toContain(password);
    expect(JSON.stringify(logs)).not.toContain(cookie.split(';')[0]);
  } finally {
    expect(await runtime.close()).toBe(0);
  }
}, 20000);

test('disconnected sign-in retains password work until verification settles', async () => {
  let finish!: (result: boolean) => void;
  let started!: () => void;
  const waiting = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const registration = new RegistrationService({
    create: async () => ({ kind: 'existing' }),
  });
  const service = new SessionService(
    {
      credential: async () => ({ accountId: randomUUID(), passwordHash: 'fixture' }),
      create: async () => new Date(),
      renew: async () => undefined,
      revoke: async () => {},
    },
    registration,
    async () => {
      started();
      return waiting;
    },
  );
  const config = readApiConfiguration({
    NODE_ENV: 'development',
    DATABASE_URL: 'postgres://fixture:synthetic@127.0.0.1/test',
  });
  const runtime = await createRuntime(
    config,
    { ready: async () => true, close: async () => {} },
    () => {},
    registration,
    service,
  );
  await runtime.listen(0);
  try {
    const client = httpRequest({
      host: '127.0.0.1',
      port: (runtime.server.address() as { port: number }).port,
      path: '/accounts/sessions',
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-commerce-request': '1' },
    });
    client.on('error', () => {});
    client.end(JSON.stringify({ email: 'reader@example.test', password: 'synthetic' }));
    await began;
    client.destroy();
    registration.stop();
    let drained = false;
    const drain = registration.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    finish(false);
    await drain;
    expect(drained).toBe(true);
  } finally {
    finish(false);
    expect(await runtime.close()).toBe(0);
  }
}, 15000);
