import {EventEmitter} from 'node:events';
import {Pool} from 'pg';
import type {PoolConfig} from 'pg';
import {Database, guardedTestConfiguration, poolOptions, readDatabaseConfiguration} from '../../packages/database/src';

const env = {NODE_ENV: 'test', DATABASE_URL: 'postgres://user:secret@localhost/db', DATABASE_TLS_MODE: 'local'};
const config = () => readDatabaseConfiguration(env);
function fixture() {
  const client = {query: jest.fn().mockResolvedValue({rows: [{value: 1}]}), release: jest.fn()};
  const pool = Object.assign(new EventEmitter(), {connect: jest.fn().mockResolvedValue(client), end: jest.fn().mockResolvedValue(undefined)});
  const events: string[] = [];
  const database = new Database(config(), event => events.push(event), pool as unknown as Pool);
  return {client, pool, database, events};
}

test('guard requires a verified dedicated target and compares decoded normalized targets', () => {
  expect(() => guardedTestConfiguration({NODE_ENV:'test'})).toThrow('TEST_DATABASE_URL');
  expect(() => guardedTestConfiguration({...env, TEST_DATABASE_URL:env.DATABASE_URL, TEST_DATABASE_TLS_MODE:'local'})).toThrow('TEST_DATABASE_TLS_MODE');
  expect(() => guardedTestConfiguration({...env, TEST_DATABASE_URL:'postgresql://other:other@LOCALHOST:5432/%64b'})).toThrow('dedicated target');
  expect(() => guardedTestConfiguration({...env, TEST_DATABASE_URL:'postgres://other:other@[::1]/db'})).toThrow('dedicated target');
  expect(() => guardedTestConfiguration({...env, MIGRATION_DATABASE_URL:'postgres://migrate:other@db.example:5432/%74est',TEST_DATABASE_URL:'postgres://user:secret@DB.EXAMPLE/test'})).toThrow('dedicated target');
  expect(guardedTestConfiguration({...env, TEST_DATABASE_URL:'postgres://user:secret@localhost/test'}).connection.ssl).toEqual({rejectUnauthorized:true});
});

test.each([undefined, 'development', 'production', 'invalid'])('test guard rejects NODE_ENV=%s', mode => {
  expect(() => guardedTestConfiguration({NODE_ENV:mode,TEST_DATABASE_URL:'postgres://user:secret@db.example/test'}))
    .toThrow('NODE_ENV');
});

test.each([
  ['postgresql://other:other@DB.EXAMPLE.:5432/%74est', 'postgres://user:secret@db.example/test'],
  ['postgres://other:other@127.0.0.1/test', 'postgres://user:secret@localhost:5432/test'],
  ['postgres://other:other@[::1]:5432/test', 'postgres://user:secret@LOCALHOST./%74est']
])('test guard rejects equivalent identities for both comparison targets', (comparison, target) => {
  for (const prefix of ['DATABASE', 'MIGRATION_DATABASE']) {
    expect(() => guardedTestConfiguration({NODE_ENV:'test',TEST_DATABASE_URL:target,[`${prefix}_URL`]:comparison}))
      .toThrow('dedicated target');
  }
});

test.each([
  {TEST_DATABASE_TLS_MODE:'local'},
  {NODE_TLS_REJECT_UNAUTHORIZED:'0'},
  {TEST_DATABASE_URL:'postgres://user:secret@localhost/test?sslmode=disable'},
  {TEST_DATABASE_URL:'postgres://user:secret@localhost/test?sslrootcert=PRIVATE_VALUE'},
  {TEST_DATABASE_CA_FILE:'PRIVATE_VALUE/not-present.pem'}
])('test guard retains TLS/configuration failures without leaking values', values => {
  try {
    guardedTestConfiguration({NODE_ENV:'test',TEST_DATABASE_URL:'postgres://user:secret@localhost/test',...values});
    throw Error('Expected preflight failure');
  } catch (error) {
    expect((error as Error).message).toMatch(/^Invalid or missing configuration:/);
    expect((error as Error).message).not.toMatch(/secret|postgres:\/\/|PRIVATE_VALUE/);
  }
});

test('effective pool options bound resources without a connection string override', () => {
  const options = poolOptions(config());
  expect(options).toMatchObject({max:5, connectionTimeoutMillis:1000, statement_timeout:5000, query_timeout:5000});
  expect(options).not.toHaveProperty('connectionString');
  const secure = readDatabaseConfiguration({NODE_ENV:'production', DATABASE_URL:env.DATABASE_URL});
  expect(poolOptions(secure).ssl).toEqual({rejectUnauthorized:true});
});

test('lazy pool, coalesced probes, fresh recovery and safe background events', async () => {
  const {database, pool, client, events} = fixture();
  expect(pool.connect).not.toHaveBeenCalled();
  const a=database.ready(), b=database.ready();
  expect(a).toBe(b);
  expect(await a).toBe(true);
  expect(client.query).toHaveBeenCalledWith('SELECT 1');
  expect(client.release).toHaveBeenCalledTimes(1);
  pool.emit('error',new Error('password=SECRET'));
  pool.connect.mockRejectedValueOnce(new Error('secret database URL'));
  expect(await database.ready()).toBe(false);
  expect(await database.ready()).toBe(true);
  expect(events).toEqual(['database_connection_failure','database_probe_failure']);
  await Promise.all([database.close(),database.close()]);
  expect(pool.end).toHaveBeenCalledTimes(1);
  expect(await database.ready()).toBe(false);
});

test('stalled probes dispose the client by two seconds and allow a fresh probe', async () => {
  jest.useFakeTimers();
  try {
    const {database,client,pool}=fixture();
    client.query.mockImplementationOnce(() => new Promise(() => undefined));
    const pending=database.ready();
    await jest.advanceTimersByTimeAsync(2000);
    expect(await pending).toBe(false);
    expect(client.release).toHaveBeenCalledWith(true);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(await database.ready()).toBe(true);
  } finally { jest.useRealTimers(); }
});

test('late acquisition is discarded and never executes a query', async () => {
  jest.useFakeTimers();
  try {
    const {database,client,pool}=fixture();
    let deliver!: (value: typeof client) => void;
    pool.connect.mockImplementationOnce(() => new Promise(resolve=>{deliver=resolve;}));
    const pending=database.ready();
    await jest.advanceTimersByTimeAsync(2000);
    expect(await pending).toBe(false);
    deliver(client); await Promise.resolve(); await Promise.resolve();
    expect(client.release).toHaveBeenCalledWith(true);
    expect(client.query).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});

test('transaction commits, rolls back failures, releases and discards a broken rollback', async () => {
  const {database,client}=fixture();
  expect(await database.transaction(async c=>{await c.query('SELECT 42');return 42;})).toBe(42);
  expect(client.query.mock.calls.map(call=>call[0])).toEqual(['BEGIN','SELECT 42','COMMIT']);
  client.query.mockClear();
  await expect(database.transaction(async()=>{throw Error('failure');})).rejects.toThrow('failure');
  expect(client.query.mock.calls.map(call=>call[0])).toEqual(['BEGIN','ROLLBACK']);
  client.query.mockImplementation(async (sql: string)=>{if(sql==='ROLLBACK')throw Error('offline');return {rows:[]};});
  await expect(database.transaction(async()=>{throw Error('original');})).rejects.toThrow('original');
  expect(client.release).toHaveBeenLastCalledWith(true);
});

test('real pg pool bookkeeping bounds burst acquisitions and recovers from idle-client errors with a fake transport', async()=>{
  class DriverClient extends EventEmitter {
    _queryable=true;
    _ending=false;
    connect(callback:(error?:Error)=>void) {queueMicrotask(()=>callback());}
    async query() {return {rows:[{value:1}]};}
    end(callback?:()=>void) {this._ending=true;queueMicrotask(()=>{this.emit('end');callback?.();});}
  }
  const settings={...config(),poolMaximum:1,acquisitionTimeoutMs:30};
  const pool=new Pool({...poolOptions(settings),Client:DriverClient} as unknown as PoolConfig);
  const events:string[]=[];
  const database=new Database(settings,event=>events.push(event),pool);
  try {
    const held=await pool.connect();
    const beginning=performance.now();
    const burst=Array.from({length:30},()=>database.ready());
    expect(pool.totalCount).toBe(1);expect(pool.waitingCount).toBe(1);
    expect(await Promise.all(burst)).toEqual(Array(30).fill(false));
    expect(performance.now()-beginning).toBeLessThan(530);
    expect(pool.waitingCount).toBe(0);held.release();
    expect(await database.ready()).toBe(true);
    const idle=await pool.connect();idle.release();
    idle.emit('error',Error('PRIVATE_CONNECTION_VALUE'));
    await new Promise(resolve=>setImmediate(resolve));
    expect(pool.totalCount).toBe(0);
    expect(await database.ready()).toBe(true);
    expect(pool.totalCount).toBe(1);expect(pool.waitingCount).toBe(0);
    expect(events).toContain('database_connection_failure');
    expect(events.join()).not.toContain('PRIVATE_CONNECTION_VALUE');
  } finally {await database.close();}
});
