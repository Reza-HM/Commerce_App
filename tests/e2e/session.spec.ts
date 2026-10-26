import {test, expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import type {SessionRepository} from '../../packages/database/src/sessions';

const load = createRequire(resolve('package.json'));
const {createRuntime} = load('./apps/api/dist/runtime.js') as typeof import('../../apps/api/src/runtime');
const {readApiConfiguration} = load('./apps/api/dist/configuration.js') as typeof import('../../apps/api/src/configuration');
const {RegistrationService} = load('./apps/api/dist/accounts/service.js') as typeof import('../../apps/api/src/accounts/service');
const {SessionService} = load('./apps/api/dist/accounts/sessions.js') as typeof import('../../apps/api/src/accounts/sessions');
const {hashPassword} = load('./apps/api/dist/accounts/password-hasher.js') as typeof import('../../apps/api/src/accounts/password-hasher');

test('secure loopback cookie supports browser session lifecycle', async ({page}) => {
  const password = 'Synthetic browser passphrase';
  const hash = await hashPassword(password);
  const id = randomUUID();
  const records = new Map<string, string>();
  const repository: SessionRepository = {
    credential: async email => email === 'browser@example.test' ? {accountId:id, passwordHash:hash} : undefined,
    create: async (_sessionId, accountId, digest) => { records.set(digest, accountId); return new Date(Date.now() + 12 * 3600000); },
    renew: async digest => records.get(digest),
    revoke: async digest => { records.delete(digest); }
  };
  const registration = new RegistrationService({create: async () => ({kind:'existing'})});
  const config = readApiConfiguration({NODE_ENV:'development', DATABASE_URL:'postgres://fixture:synthetic@127.0.0.1/test', WEB_ORIGINS:'http://127.0.0.1:4173'});
  const runtime = await createRuntime(config, {ready:async()=>true,close:async()=>{}}, () => {}, registration, new SessionService(repository,registration));
  await runtime.listen(0);
  try {
    const base = `http://127.0.0.1:${(runtime.server.address() as {port:number}).port}/accounts/sessions`;
    await page.goto('/');
    const result = await page.evaluate(async ({url, secret}) => {
      const headers = {'Content-Type':'application/json','X-Commerce-Request':'1'};
      const login = await fetch(url,{method:'POST',headers,credentials:'include',body:JSON.stringify({email:'browser@example.test',password:secret})});
      const current = await fetch(url+'/current',{headers,credentials:'include'});
      const logout = await fetch(url+'/current',{method:'DELETE',headers,credentials:'include'});
      const after = await fetch(url+'/current',{headers,credentials:'include'});
      return [login.status,current.status,logout.status,after.status];
    }, {url:base,secret:password});
    expect(result).toEqual([201,200,204,401]);
  } finally { expect(await runtime.close()).toBe(0); }
});
