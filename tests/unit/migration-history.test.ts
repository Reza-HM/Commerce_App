import {createRequire} from 'node:module';
import {existsSync, mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import type {DatabaseConfiguration, Environment} from '@commerce/database';

type History = {folder:string; count:number};
type ScriptDatabase = {orm:object; close:()=>Promise<void>};
type Migrator = (orm:object, options:{migrationsFolder:string; migrationsSchema?:string})=>Promise<void>;
const loadScript=createRequire(resolve('package.json'));
const {readMigrationHistory,applyMigrationHistory}=loadScript('./scripts/migration-history.cjs') as {
  readMigrationHistory(folder:string):History;
  applyMigrationHistory(history:History,getDatabase:()=>ScriptDatabase,options?:object,migrator?:Migrator):Promise<{empty:boolean;count:number}>;
};
const {runMigrations}=loadScript('./scripts/migrate.cjs') as {
  runMigrations(env:Environment,options:{folder:string;createDatabase:(config:DatabaseConfiguration)=>ScriptDatabase;migrator:Migrator;report:(message:string)=>void}):Promise<{empty:boolean;count:number}>;
};

function fixture() {
  const folder=mkdtempSync(join(tmpdir(),'commerce-history-unit-'));
  mkdirSync(join(folder,'meta'));
  const write=(contents:string)=>writeFileSync(join(folder,'meta/_journal.json'),contents);
  // Remove only the exact fixture file/directories. Unknown contents fail closed.
  const close=()=>{
    const journal=join(folder,'meta/_journal.json');
    if (existsSync(journal)) unlinkSync(journal);
    rmdirSync(join(folder,'meta'));
    rmdirSync(folder);
  };
  return {folder,write,close};
}

test('repository empty history never creates a client or invokes migration DDL',async()=>{
  const history=readMigrationHistory(resolve('packages/database/migrations'));
  expect(history.count).toBe(0);
  const factory=jest.fn(), migrator=jest.fn();
  expect(await applyMigrationHistory(history,factory,{},migrator)).toEqual({empty:true,count:0});
  expect(await applyMigrationHistory(history,factory,{},migrator)).toEqual({empty:true,count:0});
  expect(factory).not.toHaveBeenCalled();
  expect(migrator).not.toHaveBeenCalled();
});

test('missing history retains the existing no-op; malformed history fails',()=>{
  const f=fixture();
  try {
    expect(readMigrationHistory(f.folder)).toEqual({folder:f.folder,count:0});
    for (const invalid of ['not JSON','{"entries":null}','{"entries":{}}']) {
      f.write(invalid);
      expect(()=>readMigrationHistory(f.folder)).toThrow();
    }
  } finally {f.close();}
});

test('nonempty technical history uses the supplied database and preserves folder ownership',async()=>{
  const f=fixture();
  try {
    f.write(JSON.stringify({entries:[{tag:'0000_technical'}]}));
    const history=readMigrationHistory(f.folder);
    const database={orm:{marker:'test-only'},close:jest.fn()};
    const factory=jest.fn(()=>database), migrator=jest.fn().mockResolvedValue(undefined);
    expect(await applyMigrationHistory(history,factory,{migrationsSchema:'owned_schema',migrationsFolder:'not-authoritative'},migrator))
      .toEqual({empty:false,count:1});
    expect(factory).toHaveBeenCalledTimes(1);
    expect(migrator).toHaveBeenCalledWith(database.orm,{migrationsFolder:f.folder,migrationsSchema:'owned_schema'});
    expect(database.close).not.toHaveBeenCalled(); // Lifecycle belongs to caller.
    const failure=Error('PRIVATE_VALUE');
    migrator.mockRejectedValueOnce(failure);
    await expect(applyMigrationHistory(history,factory,{},migrator)).rejects.toBe(failure);
  } finally {f.close();}
});

test('operator validates only its explicit target and closes clients after failure',async()=>{
  const f=fixture();
  try {
    const database={orm:{},close:jest.fn().mockResolvedValue(undefined)};
    const createDatabase=jest.fn((config:DatabaseConfiguration)=>({...database,config})), migrator=jest.fn().mockResolvedValue(undefined), report=jest.fn();
    const options={folder:f.folder,createDatabase,migrator,report};
    const testOnly={NODE_ENV:'test',TEST_DATABASE_URL:'postgres://fixture:PRIVATE_VALUE@localhost/test'};
    await expect(runMigrations(testOnly,options)).rejects.toThrow('MIGRATION_DATABASE_URL');
    expect(createDatabase).not.toHaveBeenCalled();
    const env={...testOnly,MIGRATION_DATABASE_URL:'postgres://operator:secret@operator.example/operator_db'};
    f.write('{"entries":[]}');
    await expect(runMigrations(env,options)).resolves.toEqual({empty:true,count:0});
    expect(report).toHaveBeenCalledWith('No pending migrations.');
    expect(createDatabase).not.toHaveBeenCalled();
    f.write(JSON.stringify({entries:[{tag:'0000_technical'}]}));
    const failure=Error('PRIVATE_VALUE');
    migrator.mockRejectedValueOnce(failure);
    await expect(runMigrations(env,options)).rejects.toBe(failure);
    expect(createDatabase.mock.calls[0]?.[0]).toMatchObject({connection:{host:'operator.example',database:'operator_db',user:'operator'}});
    expect(database.close).toHaveBeenCalledTimes(1);
    expect(report.mock.calls.flat().join()).not.toContain('PRIVATE_VALUE');
  } finally {f.close();}
});
