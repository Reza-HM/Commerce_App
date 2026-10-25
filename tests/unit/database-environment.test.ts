import {createRequire} from 'node:module';
import {mkdtempSync, writeFileSync, unlinkSync, rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import type {Environment} from '@commerce/database';
const load=createRequire(resolve('package.json'));
const {databaseEnvironment,commandEnvironment}=load('./scripts/database-environment.cjs') as {
  databaseEnvironment(env:Environment,mode:string,filename:string):Record<string,string|undefined>;
  commandEnvironment(command:string,env:Environment,filename:string):Environment;
};

test('private database loading selects only database keys and preserves process values',()=>{
  const folder=mkdtempSync(join(tmpdir(),'commerce-env-unit-')),file=join(folder,'private.env');
  try {
    writeFileSync(file,'DATABASE_URL=local-dev\nTEST_DATABASE_URL=local-test\nNODE_OPTIONS=untrusted\nNODE_ENV=production\nPRIVATE_OTHER=untrusted\n');
    expect(databaseEnvironment({DATABASE_URL:'process-dev',TEST_DATABASE_URL:''},'test',file)).toEqual({DATABASE_URL:'process-dev',TEST_DATABASE_URL:'',NODE_ENV:'test'});
    expect(databaseEnvironment({},'test',file)).toEqual({DATABASE_URL:'local-dev',TEST_DATABASE_URL:'local-test',NODE_ENV:'test'});
    expect(commandEnvironment('db:migrate',{},file)).toMatchObject({NODE_ENV:'development'});
    expect(commandEnvironment('test:integration',{NODE_ENV:'production'},file)).toMatchObject({NODE_ENV:'test'});
    expect(databaseEnvironment({},'test',join(folder,'missing'))).toEqual({NODE_ENV:'test'});
    expect(()=>databaseEnvironment({},'test',folder)).toThrow('Invalid local database environment');
    for(const command of ['test','build','typecheck','test:e2e','test:smoke']){
      const env={PRIVATE:'process-only'};
      expect(commandEnvironment(command,env,folder)).toBe(env); // Reading directory would fail.
    }
  } finally {unlinkSync(file);rmdirSync(folder);}
});
