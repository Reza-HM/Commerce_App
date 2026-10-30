import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { createRuntime } from '../../apps/api/src/runtime';
import { readApiConfiguration } from '../../apps/api/src/configuration';
import { VerificationService } from '../../apps/api/src/accounts/verification';
import { RegistrationService } from '../../apps/api/src/accounts/service';
import { SessionService } from '../../apps/api/src/accounts/sessions';

const c = JSON.parse(readFileSync('docs/api/openapi.json', 'utf8'));
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
function contract(path: string, status: number, body: unknown) {
  const response = c.paths[path].post.responses[status];
  const resolved = response.$ref
    ? c.components.responses[response.$ref.split('/').at(-1)]
    : response;
  expect(
    ajv.validate(
      { ...resolved.content['application/json'].schema, components: c.components },
      body,
    ),
  ).toBe(true);
}

test('verification HTTP contracts protect origin, identity, logs and explicit confirmation', async () => {
  const token = randomBytes(32).toString('base64url');
  const repository = {
    issue: jest.fn(async (email: string) => email === 'owner@example.test'),
    lookup: jest.fn(async () => ({ accountId: 'account', passwordHash: 'hash' })),
    confirm: jest.fn(async () => true),
  };
  const registration = new RegistrationService({
    create: async () => ({ kind: 'existing' }),
  });
  const logs: string[] = [];
  const service = new VerificationService(
    repository,
    registration,
    { send: async () => {} },
    () => {},
    async (password) => password === 'synthetic',
  );
  const runtime = await createRuntime(
    readApiConfiguration({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://synthetic:synthetic@127.0.0.1/unused',
      WEB_ORIGINS: 'http://localhost:3000',
    }),
    { ready: async () => true, close: async () => {} },
    (entry) => logs.push(JSON.stringify(entry)),
    registration,
    undefined,
    service,
  );
  await runtime.listen(0);
  const root = `http://127.0.0.1:${(runtime.server.address() as { port: number }).port}`;
  const post = (path: string, body: unknown, extra: Record<string, string> = {}) =>
    fetch(root + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Commerce-Request': '1',
        ...extra,
      },
      body: JSON.stringify(body),
    });
  const request = '/accounts/email-verification/request',
    confirm = '/accounts/email-verification/confirm';
  try {
    const denied = await post(
      request,
      { email: 'owner@example.test' },
      { Origin: 'https://untrusted.invalid' },
    );
    expect(denied.status).toBe(403);
    contract(request, 403, await denied.json());
    expect(repository.issue).not.toHaveBeenCalled();
    const missingHeader = await post(
      request,
      { email: 'owner@example.test' },
      { 'X-Commerce-Request': '' },
    );
    expect(missingHeader.status).toBe(403);
    const alias = await post(
      '/ACCOUNTS/EMAIL-VERIFICATION/REQUEST/',
      { email: 'owner@example.test' },
      { Origin: 'https://untrusted.invalid' },
    );
    expect(alias.status).toBe(403);
    expect(repository.issue).not.toHaveBeenCalled();
    const preview = await fetch(root + confirm + '?token=' + token, {
      headers: { 'X-Commerce-Request': '1' },
    });
    expect(preview.status).toBe(404);
    expect(repository.lookup).not.toHaveBeenCalled();
    expect(repository.confirm).not.toHaveBeenCalled();
    const emptyOrigin = await post(
      request,
      { email: 'owner@example.test' },
      { Origin: '' },
    );
    expect(emptyOrigin.status).toBe(403);
    expect(repository.issue).not.toHaveBeenCalled();
    const a = await post(request, { email: 'owner@example.test' });
    const b = await post(request, { email: 'unknown@example.test' });
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    const body = await a.json();
    expect(await b.json()).toEqual(body);
    contract(request, 202, body);
    expect(a.headers.get('set-cookie')).toBeNull();
    expect(a.headers.get('cache-control')).toBe('no-store');
    repository.issue.mockRejectedValueOnce({ code: '42P01' });
    const unavailable = await post(request, { email: 'owner@example.test' });
    expect(unavailable.status).toBe(503);
    contract(request, 503, await unavailable.json());
    const bad = await post(confirm, { token, password: 'wrong' });
    expect(bad.status).toBe(401);
    contract(confirm, 401, await bad.json());
    expect(repository.confirm).not.toHaveBeenCalled();
    const good = await post(confirm, { token, password: 'synthetic' });
    expect(good.status).toBe(200);
    contract(confirm, 200, await good.json());
    expect(good.headers.get('set-cookie')).toBeNull();
    const malformed = await post(confirm, {
      token: 'bad',
      password: 'synthetic',
      role: 'admin',
    });
    expect(malformed.status).toBe(400);
    contract(confirm, 400, await malformed.json());
    const options = await fetch(root + request, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(options.headers.get('access-control-allow-headers')).toContain(
      'X-Commerce-Request',
    );
    expect(options.headers.get('access-control-allow-credentials')).toBeNull();
    expect(logs.join(' ').includes(token)).toBe(false);
    expect(logs.join(' ')).not.toContain('owner@example.test');
  } finally {
    expect(await runtime.close()).toBe(0);
  }
});

test('correct-password unverified sign-in uses the exact 403 contract and wrong-password stays generic', async () => {
  const registration = new RegistrationService({
    create: async () => ({ kind: 'existing' }),
  });
  const service = new SessionService(
    {
      credential: async () => ({
        accountId: 'account',
        passwordHash: 'hash',
        emailVerified: false,
      }),
      create: async () => undefined,
      renew: async () => undefined,
      revoke: async () => {},
    },
    registration,
    async (password) => password === 'synthetic',
  );
  const runtime = await createRuntime(
    readApiConfiguration({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://synthetic:synthetic@127.0.0.1/unused',
    }),
    { ready: async () => true, close: async () => {} },
    () => {},
    registration,
    service,
  );
  await runtime.listen(0);
  try {
    for (const [password, status] of [
      ['wrong', 401],
      ['synthetic', 403],
    ] as const) {
      const response = await fetch(
        `http://127.0.0.1:${(runtime.server.address() as { port: number }).port}/accounts/sessions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Commerce-Request': '1' },
          body: JSON.stringify({ email: 'owner@example.test', password }),
        },
      );
      expect(response.status).toBe(status);
      contract('/accounts/sessions', status, await response.json());
      expect(response.headers.get('set-cookie')).toBeNull();
    }
  } finally {
    expect(await runtime.close()).toBe(0);
  }
});
