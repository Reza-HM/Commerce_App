import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import type {AccountCreation, NewAccount} from '@commerce/database';

const load=createRequire(resolve('package.json'));
type QueryDatabase={orm:{execute:jest.Mock<Promise<{rows:Array<{id:string}>}>,[unknown]>}};
type Owner={records:Map<string,string>;create(input:NewAccount):Promise<AccountCreation>;cleanup():Promise<void>};
const {OwnedAccounts}=load('./scripts/integration-accounts.cjs') as {
  OwnedAccounts:new(database:QueryDatabase,repository:{create(input:NewAccount):Promise<AccountCreation>})=>Owner;
};
const input={id:'11111111-1111-4111-8111-111111111111',emailNormalized:'fixture@example.invalid',passwordHash:'synthetic-test-credential'};

function fixture(create:()=>Promise<AccountCreation>) {
  const database={orm:{execute:jest.fn<Promise<{rows:Array<{id:string}>}>,[unknown]>().mockResolvedValue({rows:[]})}};
  return {database,owner:new OwnedAccounts(database,{create})};
}

test('duplicate confirmation requires candidate absence and authorizes no deletes',async()=>{
  const {owner,database}=fixture(async()=>({kind:'existing'}));
  await owner.create(input);expect(owner.records.size).toBe(0);
  const reads=database.orm.execute.mock.calls.length;await owner.cleanup();
  expect(database.orm.execute).toHaveBeenCalledTimes(reads);
});
test('uncertain commit remains pending and cleanup refuses without any query',async()=>{
  const error=Object.assign(Error('transport failure'),{code:'ECONNRESET'});
  const {owner,database}=fixture(async()=>{throw error;});
  await expect(owner.create(input)).rejects.toBe(error);
  expect(owner.records.get(input.id)).toBe('pending');
  await expect(owner.cleanup()).rejects.toThrow('Fixture cleanup failed');
  expect(database.orm.execute).not.toHaveBeenCalled();
});
test('duplicate with a present candidate fails closed rather than owning another row',async()=>{
  const {owner,database}=fixture(async()=>({kind:'existing'}));
  database.orm.execute.mockResolvedValue({rows:[{id:input.id}]});
  await expect(owner.create(input)).rejects.toThrow('Candidate unexpectedly exists');
  expect(owner.records.get(input.id)).toBe('pending');
  const reads=database.orm.execute.mock.calls.length;
  await expect(owner.cleanup()).rejects.toThrow('Fixture cleanup failed');
  expect(database.orm.execute).toHaveBeenCalledTimes(reads);
});
test('confirmed ownership permits only dependent-key then account-key cleanup, and errors remain errors',async()=>{
  const {owner,database}=fixture(async()=>({kind:'created',id:input.id}));
  await owner.create(input);expect(owner.records.get(input.id)).toBe('confirmed');
  database.orm.execute.mockRejectedValueOnce(Error('cleanup failure'));
  await expect(owner.cleanup()).rejects.toThrow('Fixture cleanup failed');
  expect(owner.records.get(input.id)).toBe('confirmed');
  database.orm.execute.mockResolvedValueOnce({rows:[]}).mockResolvedValueOnce({rows:[{id:input.id}]});
  await owner.cleanup();expect(owner.records.size).toBe(0);
});
