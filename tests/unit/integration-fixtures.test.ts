import {createRequire} from 'node:module';
import {resolve, join} from 'node:path';
import {writeFileSync, unlinkSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {PgDialect} from 'drizzle-orm/pg-core';
import type {SQL} from 'drizzle-orm';

const load=createRequire(resolve('package.json'));
type Database = {orm:{execute:(query:SQL|string)=>Promise<{rows:object[]}>}};
type Schema = {schema:string;created:boolean;create:()=>Promise<void>;table:(name:string)=>string;
  trackRecord:(schema:string,table:string,column:string,value:string|number)=>void;
  confirmRecord:(schema:string,table:string,column:string,value:string|number)=>void;
  deleteRecord:(schema:string,table:string,column:string,value:string|number)=>Promise<void>;cleanup:()=>Promise<void>};
type Directory = {folder:string;write:(name:string,contents:string)=>void;cleanup:()=>void};
const {OwnedSchema,OwnedDirectory}=load('./scripts/integration-fixtures.cjs') as {
  OwnedSchema:new(db:Database,label:string)=>Schema;OwnedDirectory:new()=>Directory;
};
const {withCleanup,cleanupAll}=load('./scripts/integration-support.cjs') as {
  withCleanup<T>(work:()=>Promise<T>,cleanup:()=>Promise<void>):Promise<T>;
  cleanupAll(operations:Array<()=>Promise<void>>):Promise<void>;
};
const {ExpectedWorkerFailure}=load('./scripts/integration.cjs') as {ExpectedWorkerFailure:new(message:string)=>Error};
const dialect=new PgDialect();
function fixture(failDrop=false) {
  const commands:Array<{sql:string;params:unknown[]}>=[];
  const db:Database={orm:{execute:async query=>{
    const command=typeof query==='string'?{sql:query,params:[]}:dialect.sqlToQuery(query);
    commands.push(command);
    if(failDrop && command.sql.startsWith('DROP SCHEMA'))throw Error('Unowned schema contents');
    return {rows:[]};
  }}};
  return {db,commands};
}

test('owned cleanup binds exact keys and restricts drops to registered objects',async()=>{
  const {db,commands}=fixture();
  const owner=new OwnedSchema(db,'worker');
  await owner.create();
  owner.table('first');owner.table('second');
  expect(()=>owner.table('bad";DROP DATABASE')).toThrow('Unsafe');
  const count=commands.length;
  await expect(owner.deleteRecord('public','users','id','unregistered')).rejects.toThrow('Unconfirmed');
  expect(commands).toHaveLength(count);
  const key="owned'; DELETE FROM public.users; --";
  owner.trackRecord('public','fixture','id',key);
  await expect(owner.deleteRecord('public','fixture','id',key)).rejects.toThrow('Unconfirmed');
  expect(commands).toHaveLength(count);
  owner.confirmRecord('public','fixture','id',key);
  await owner.cleanup();
  const deletion=commands.find(command=>command.sql.startsWith('DELETE'));
  expect(deletion?.params).toEqual([key]);
  expect(deletion?.sql).not.toContain(key);
  expect(commands.slice(-3).map(command=>command.sql)).toEqual([
    `DROP TABLE IF EXISTS "${owner.schema}"."second" RESTRICT`,
    `DROP TABLE IF EXISTS "${owner.schema}"."first" RESTRICT`,
    `DROP SCHEMA "${owner.schema}" RESTRICT`
  ]);
  expect(commands.every(command=>! /CASCADE|TRUNCATE|DROP DATABASE/.test(command.sql))).toBe(true);
});

test('an unconfirmed insert cannot authorize cleanup of an existing record',async()=>{
  const {db,commands}=fixture();
  const owner=new OwnedSchema(db,'worker');
  owner.trackRecord('public','fixture','id','preexisting-or-uncertain');
  await expect(owner.cleanup()).rejects.toThrow('Unconfirmed fixture ownership');
  expect(commands).toEqual([]);
});

test('unknown schema contents fail cleanup rather than enabling a cascade',async()=>{
  const {db,commands}=fixture(true);
  const owner=new OwnedSchema(db,'worker');await owner.create();owner.table('fixture');
  await expect(owner.cleanup()).rejects.toThrow('Unowned schema contents');
  expect(owner.created).toBe(true);
  expect(commands.some(command=>command.sql.includes('CASCADE'))).toBe(false);
});

test('cleanup failure cannot masquerade as an expected worker failure',async()=>{
  const primary=new ExpectedWorkerFailure('expected'),cleanup=Error('cleanup');
  let failure:unknown;
  try {await withCleanup(async()=>{throw primary;},async()=>{throw cleanup;});} catch(error){failure=error;}
  expect(failure).toBeInstanceOf(AggregateError);
  expect(failure).not.toBeInstanceOf(ExpectedWorkerFailure);
  expect((failure as AggregateError).errors).toEqual([primary,cleanup]);
  const final=jest.fn().mockResolvedValue(undefined);
  await expect(cleanupAll([async()=>{throw cleanup;},final])).rejects.toThrow('Fixture cleanup failed');
  expect(final).toHaveBeenCalledTimes(1);
});

test('temporary fixture cleanup refuses outside roots and leaves unknown files intact',()=>{
  const directory=new OwnedDirectory(),ownedRoot=directory.folder;
  const unknown=join(ownedRoot,'meta','unowned');
  try {
    directory.folder=tmpdir();
    expect(()=>directory.cleanup()).toThrow('Unsafe fixture path');
    directory.folder=ownedRoot;
    expect(()=>directory.write('../outside','bad')).toThrow('Unsafe fixture filename');
    directory.write('meta/_journal.json','{"entries":[]}');
    writeFileSync(unknown,'must survive');
    expect(()=>directory.cleanup()).toThrow();
    expect(existsSync(unknown)).toBe(true);
  } finally {
    directory.folder=ownedRoot;
    if(existsSync(unknown))unlinkSync(unknown);
    directory.cleanup();
  }
});
