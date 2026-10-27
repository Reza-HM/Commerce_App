import {test as base, expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import type {NewAccount} from '../../packages/database/src/accounts';
import type {SessionRepository} from '../../packages/database/src/sessions';

const load=createRequire(resolve('package.json'));
const {createRuntime}=load('./apps/api/dist/runtime.js') as typeof import('../../apps/api/src/runtime');
const {readApiConfiguration}=load('./apps/api/dist/configuration.js') as typeof import('../../apps/api/src/configuration');
const {RegistrationService}=load('./apps/api/dist/accounts/service.js') as typeof import('../../apps/api/src/accounts/service');
const {SessionService}=load('./apps/api/dist/accounts/sessions.js') as typeof import('../../apps/api/src/accounts/sessions');

type Fixture = {expire: () => void; failRevocation: (fail: boolean) => void; logs: string[]; counts: {current: number; signOut: number}};
export const test=base.extend<{api: Fixture}>({
  api: [async ({page},use) => {
    void page;
    const accounts=new Map<string, NewAccount>();const sessions=new Map<string,string>();
    const logs:string[]=[];const counts={current:0,signOut:0};let revocationFails=false;
    const registration=new RegistrationService({create:async account => {
      if (accounts.has(account.emailNormalized)) return {kind:'existing'};
      accounts.set(account.emailNormalized,account);return {kind:'created',id:account.id};
    }});
    const repository:SessionRepository={
      credential:async email => {const account=accounts.get(email);return account ? {accountId:account.id,passwordHash:account.passwordHash} : undefined;},
      create:async (_id,accountId,digest) => {sessions.set(digest,accountId);return new Date(Date.now()+12*3600000);},
      renew:async digest => {counts.current++;return sessions.get(digest);},
      revoke:async digest => {counts.signOut++;if (revocationFails) throw Object.assign(new Error('fixture unavailable'),{code:'ECONNREFUSED'});sessions.delete(digest);}
    };
    const config=readApiConfiguration({NODE_ENV:'development',DATABASE_URL:'postgres://fixture:synthetic@127.0.0.1/test',WEB_ORIGINS:'http://127.0.0.1:4173'});
    const runtime=await createRuntime(config,{ready:async()=>true,close:async()=>{}},event=>logs.push(JSON.stringify(event)),registration,new SessionService(repository,registration));
    try {
      // Bind explicitly; a collision fails rather than reusing an unknown process.
      await runtime.listen(4174);
      await use({expire:()=>sessions.clear(),failRevocation:fail=>{revocationFails=fail;},logs,counts});
    } finally {expect(await runtime.close()).toBe(0);}
  },{auto:true}]
});
export {expect} from '@playwright/test';
