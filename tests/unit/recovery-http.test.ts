import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { createRuntime } from '../../apps/api/src/runtime';
import { readApiConfiguration } from '../../apps/api/src/configuration';
import { RegistrationService } from '../../apps/api/src/accounts/service';
import { RecoveryService } from '../../apps/api/src/accounts/recovery';

const contract = JSON.parse(readFileSync('docs/api/openapi.json', 'utf8'));
const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
const requestPath = '/accounts/password-recovery/request';
const confirmPath = '/accounts/password-recovery/confirm';
const token = randomBytes(32).toString('base64url');
const password = 'Synthetic HTTP recovery passphrase';
async function harness() {
  const logs: string[] = [];
  const repository = {
    issue: jest.fn(async (email: string) => email !== 'unknown@example.test'),
    lookup: jest.fn().mockResolvedValue({
      accountId: 'account',
      emailNormalized: 'owner@example.test',
      passwordHash: 'old',
    }),
    confirm: jest.fn().mockResolvedValue(true),
  };
  const registration = new RegistrationService({
    create: async () => ({ kind: 'existing' }),
  });
  const runtime = await createRuntime(
    readApiConfiguration({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://synthetic:synthetic@127.0.0.1/unused',
      WEB_ORIGINS: 'http://localhost:3000',
      HTTP_BODY_LIMIT_BYTES: '2048',
    }),
    { ready: async () => true, close: async () => {} },
    (event) => logs.push(JSON.stringify(event)),
    registration,
    undefined,
    undefined,
    new RecoveryService(
      repository,
      registration,
      { sendRecovery: async () => {}, notifyReset: async () => {} },
      () => {},
      undefined,
      async () => 'fresh-hash',
    ),
  );
  await runtime.listen(0);
  const base = `http://127.0.0.1:${(runtime.server.address() as { port: number }).port}`;
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Commerce-Request': '1',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  async function check(path: string, response: Response, status: number) {
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('set-cookie')).toBeNull();
    const body: unknown = await response.json();
    let schema = contract.paths[path].post.responses[status];
    if (schema.$ref)
      schema = contract.components.responses[schema.$ref.split('/').at(-1)];
    expect(
      ajv.validate(
        { ...schema.content['application/json'].schema, components: contract.components },
        body,
      ),
    ).toBe(true);
    if (body && typeof body === 'object' && 'requestId' in body)
      expect(body.requestId).toBe(response.headers.get('x-request-id'));
    return body;
  }
  return { logs, repository, runtime, post, check, base };
}

test('recovery HTTP accepts all address states generically, protects Origin/header and logs no secrets', async () => {
  const h = await harness();
  try {
    await h.check(
      requestPath,
      await h.post(
        requestPath,
        { email: 'owner@example.test' },
        { Origin: 'https://untrusted.invalid' },
      ),
      403,
    );
    await h.check(
      requestPath,
      await h.post(
        requestPath,
        { email: 'owner@example.test' },
        { 'X-Commerce-Request': '' },
      ),
      403,
    );
    expect(h.repository.issue).not.toHaveBeenCalled();
    for (const email of [
      'owner@example.test',
      'unknown@example.test',
      'unverified@example.test',
    ]) {
      const response = await h.post(
        requestPath,
        { email },
        { Origin: 'http://localhost:3000', Cookie: 'PRIVATE_COOKIE' },
      );
      expect(response.headers.get('access-control-allow-origin')).toBe(
        'http://localhost:3000',
      );
      expect(response.headers.get('access-control-allow-credentials')).toBeNull();
      expect(await h.check(requestPath, response, 202)).toEqual({
        status: 'accepted',
        message: 'Password recovery request processed.',
      });
    }
    await h.check(
      requestPath,
      await h.post(requestPath, { email: 'bad', extra: token }),
      400,
    );
    await h.check(
      requestPath,
      await h.post(requestPath, { email: 'owner@example.test' }),
      202,
    );
    const limited = await h.post(requestPath, { email: 'owner@example.test' });
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    await h.check(requestPath, limited, 429);
    expect(h.logs.join(' ')).not.toMatch(
      /owner@example|unknown@example|unverified@example|PRIVATE_COOKIE/,
    );
    expect(h.logs.join(' ')).not.toContain(token);
    const preflight = await fetch(h.base + requestPath, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-headers')).toContain(
      'X-Commerce-Request',
    );
  } finally {
    expect(await h.runtime.close()).toBe(0);
  }
});

test('confirmation HTTP enforces exact shapes, policy, single-use failures and explicit reset success', async () => {
  const h = await harness();
  try {
    await h.check(confirmPath, await h.post(confirmPath, { password }), 400);
    const weak = await h.check(
      confirmPath,
      await h.post(confirmPath, { token, password: 'short' }),
      400,
    );
    expect(weak).toMatchObject({
      error: 'invalid_recovery',
      message: 'Invalid password',
      field: 'password',
      code: 'password_length',
    });
    await h.check(
      confirmPath,
      await h.post(confirmPath, { token, password: 'owner@example.test' }),
      400,
    );
    await h.check(confirmPath, await h.post(confirmPath, { token, password }), 200);
    expect(h.repository.confirm).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ passwordHash: 'old' }),
      'fresh-hash',
    );
    h.repository.lookup.mockResolvedValue(undefined);
    expect(
      await h.check(confirmPath, await h.post(confirmPath, { token, password }), 401),
    ).toMatchObject({ error: 'invalid_recovery', message: 'Request rejected' });
    expect(h.logs.join(' ')).not.toContain(token);
    expect(h.logs.join(' ')).not.toContain(password);
    const get = await fetch(h.base + confirmPath + '?token=' + token);
    expect(get.status).toBe(403);
    expect(h.repository.confirm).toHaveBeenCalledTimes(1);
  } finally {
    expect(await h.runtime.close()).toBe(0);
  }
});

test('required database outages and unexpected failures never become recovery acceptance', async () => {
  const h = await harness();
  try {
    for (const [code, status] of [
      ['42P01', 503],
      ['ECONNREFUSED', 503],
      ['unrecognized', 500],
    ] as const) {
      h.repository.issue.mockRejectedValueOnce(
        Object.assign(new Error('PRIVATE_DATABASE_VALUE'), { code }),
      );
      await h.check(
        requestPath,
        await h.post(requestPath, { email: 'unknown@example.test' }),
        status,
      );
    }
    h.repository.confirm.mockResolvedValue(false);
    await h.check(confirmPath, await h.post(confirmPath, { token, password }), 401);
    expect(h.logs.join(' ')).not.toContain('PRIVATE_DATABASE_VALUE');
  } finally {
    expect(await h.runtime.close()).toBe(0);
  }
});
