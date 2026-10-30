import { createRequire } from 'node:module';
import { mkdtempSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readApiConfiguration } from '../../apps/api/src/configuration';
import { createRuntime } from '../../apps/api/src/runtime';
import type { Environment } from '@commerce/database';

const load = createRequire(resolve('package.json'));
const { commandEnvironment } = load('./scripts/database-environment.cjs') as {
  commandEnvironment(command: string, env: Environment, filename: string): Environment;
};

test('normal development grants registration/session preflight only to the two local web origins', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'commerce-local-origin-'));
  const environment = commandEnvironment(
    'dev:api',
    { DATABASE_URL: 'postgres://fixture:synthetic@127.0.0.1/local_origin_test' },
    join(folder, 'absent.env'),
  );
  const config = readApiConfiguration(environment);
  const runtime = await createRuntime(
    config,
    { ready: async () => false, close: async () => {} },
    () => {},
  );
  try {
    await runtime.listen(0);
    const port = (runtime.server.address() as { port: number }).port;
    for (const path of [
      '/accounts/register',
      '/accounts/sessions',
      '/accounts/sessions/current',
    ]) {
      for (const origin of [
        'http://127.0.0.1:3000',
        'http://localhost:3000',
        'https://untrusted.example',
      ]) {
        const response = await fetch('http://127.0.0.1:' + port + path, {
          method: 'OPTIONS',
          headers: {
            origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type',
          },
        });
        expect(response.status).toBe(204);
        expect(response.headers.get('access-control-allow-origin')).toBe(
          origin !== 'https://untrusted.example' ? origin : null,
        );
        expect(response.headers.get('access-control-allow-credentials')).toBe(
          origin !== 'https://untrusted.example' && path !== '/accounts/register'
            ? 'true'
            : null,
        );
      }
    }
    expect(
      readApiConfiguration({
        ...environment,
        NODE_ENV: 'production',
        WEB_ORIGINS: undefined,
      }).webOrigins,
    ).toEqual([]);
  } finally {
    expect(await runtime.close()).toBe(0);
    rmdirSync(folder);
  }
});
