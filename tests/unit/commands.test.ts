import {spawnSync} from 'node:child_process';

function run(script:string,values:Record<string,string|undefined>) {
  return spawnSync(process.execPath,[script],{encoding:'utf8',env:{...process.env,NODE_ENV:'test',MIGRATION_DATABASE_URL:undefined,TEST_DATABASE_URL:undefined,...values}});
}
test('live integration preflight fails instead of skipping or falling back',()=>{
  const result=run('scripts/integration.cjs',{});
  expect(result.status).toBe(1);expect(result.stderr).toContain('TEST_DATABASE_URL');
});
test('migration validates explicit connection and empty history does not connect',()=>{
  const missing=run('scripts/migrate.cjs',{});expect(missing.status).toBe(1);
  expect(missing.stderr).toContain('MIGRATION_DATABASE_URL');
  const empty=run('scripts/migrate.cjs',{MIGRATION_DATABASE_URL:'postgres://fixture:secret@127.0.0.1:1/unavailable'});
  expect(empty.status).toBe(0);expect(empty.stdout).toContain('No pending migrations');
  const invalid=run('scripts/migrate.cjs',{MIGRATION_DATABASE_URL:'invalid SECRET_VALUE'});
  expect(invalid.status).toBe(1);expect(invalid.stderr).not.toContain('SECRET_VALUE');
});
