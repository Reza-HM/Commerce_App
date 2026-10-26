import {spawnSync} from 'node:child_process';

function run(script:string,values:Record<string,string|undefined>) {
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(?:DATABASE_|MIGRATION_DATABASE_|TEST_DATABASE_|NODE_TLS_REJECT_UNAUTHORIZED$)/.test(key)));
  return spawnSync(process.execPath,[script],{encoding:'utf8',timeout:10000,env:{...environment,NODE_ENV:'test',...values}});
}
test('live integration preflight fails instead of skipping or falling back',()=>{
  const result=run('scripts/integration.cjs',{});
  expect(result.status).toBe(1);expect(result.stderr).toContain('TEST_DATABASE_URL');
});

test.each([
  {NODE_ENV:'development',TEST_DATABASE_URL:'postgres://user:PRIVATE_VALUE@localhost/test'},
  {TEST_DATABASE_URL:'postgres://user:PRIVATE_VALUE@localhost/test',TEST_DATABASE_TLS_MODE:'local'},
  {TEST_DATABASE_URL:'postgres://user:PRIVATE_VALUE@localhost/test?sslmode=require'},
  {TEST_DATABASE_URL:'postgres://user:PRIVATE_VALUE@localhost/test',NODE_TLS_REJECT_UNAUTHORIZED:'0'},
  {TEST_DATABASE_URL:'postgres://user:PRIVATE_VALUE@localhost/test',DATABASE_URL:'postgres://other:other@127.0.0.1:5432/%74est'},
  {TEST_DATABASE_URL:'postgres://user:PRIVATE_VALUE@LOCALHOST./test',MIGRATION_DATABASE_URL:'postgres://other:other@localhost:5432/%74est'}
])('live command refuses unsafe configuration without fallback or values', values => {
  const result=run('scripts/integration.cjs',values);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Invalid or missing configuration');
  expect(result.stderr + result.stdout).not.toMatch(/PRIVATE_VALUE|postgres:\/\/|postgresql:\/\//);
});
test('migration validates its explicit target and nonempty application history needs a connection',()=>{
  const missing=run('scripts/migrate.cjs',{});expect(missing.status).toBe(1);
  expect(missing.stderr).toContain('TEST_DATABASE_URL');
  const unavailable=run('scripts/migrate.cjs',{TEST_DATABASE_URL:'postgres://fixture:secret@127.0.0.1:1/unavailable'});
  expect(unavailable.status).toBe(1);expect(unavailable.stderr).toContain('Migration failed.');
  expect(unavailable.stderr+unavailable.stdout).not.toMatch(/secret|postgres:\/\//);
  const invalid=run('scripts/migrate.cjs',{TEST_DATABASE_URL:'invalid SECRET_VALUE'});
  expect(invalid.status).toBe(1);expect(invalid.stderr).not.toContain('SECRET_VALUE');
});
