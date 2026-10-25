const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const {mkdtempSync, mkdirSync, writeFileSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join, resolve, sep} = require('node:path');
const {ConfigurationError} = require('@commerce/database');
const {createGuardedDatabase} = require('./integration-support.cjs');
const {readMigrationHistory, applyMigrationHistory} = require('./migration-history.cjs');

async function main() {
  // Guard before constructing clients or creating fixtures. No fallback target.
  const database = createGuardedDatabase(process.env);
  const schema = 'foundation_' + randomUUID().replaceAll('-', '');
  const quoted = '"' + schema + '"';
  const folder = mkdtempSync(join(tmpdir(),'commerce-migration-'));
  let created = false;
  try {
    assert.equal(await database.ready(), true, 'Verified TLS connection unavailable');
    await database.orm.execute(`CREATE SCHEMA ${quoted}`); created = true;
    await database.orm.execute(`CREATE TABLE ${quoted}.fixture (value integer)`);
    await assert.rejects(database.transaction(async client => {
      await client.query(`INSERT INTO ${quoted}.fixture VALUES (1)`);
      throw Error('rollback fixture');
    }));
    const result = await database.orm.execute(`SELECT count(*)::int AS count FROM ${quoted}.fixture`);
    assert.equal(result.rows[0].count,0);
    mkdirSync(join(folder,'meta'));
    writeFileSync(join(folder,'meta/_journal.json'),JSON.stringify({version:'7',dialect:'postgresql',entries:[{idx:0,version:'7',when:1,tag:'0000_fixture',breakpoints:true}]}));
    writeFileSync(join(folder,'0000_fixture.sql'),`INSERT INTO ${quoted}.fixture VALUES (42);`);
    const options={migrationsSchema:schema};
    const history=readMigrationHistory(folder);
    await applyMigrationHistory(history,()=>database,options);
    await applyMigrationHistory(history,()=>database,options);
    const replay=await database.orm.execute(`SELECT count(*)::int AS count FROM ${quoted}.fixture`);
    assert.equal(replay.rows[0].count,1);
    writeFileSync(join(folder,'meta/_journal.json'),JSON.stringify({version:'7',dialect:'postgresql',entries:[
      {idx:0,version:'7',when:1,tag:'0000_fixture',breakpoints:true},
      {idx:1,version:'7',when:2,tag:'0001_invalid',breakpoints:true}
    ]}));
    writeFileSync(join(folder,'0001_invalid.sql'),'THIS IS NOT SQL;');
    await assert.rejects(applyMigrationHistory(readMigrationHistory(folder),()=>database,options));
    console.log('Live TLS connectivity, rollback and migration replay passed.');
  } finally {
    try { if(created) await database.orm.execute(`DROP SCHEMA ${quoted} CASCADE`); }
    finally {
      await database.close();
      if(!resolve(folder).startsWith(resolve(tmpdir())+sep) || !folder.includes('commerce-migration-')) throw Error('Unsafe fixture path');
      rmSync(folder,{recursive:true,force:true});
    }
  }
}
main().catch(error=>{
  console.error(error instanceof ConfigurationError ? error.message : 'Live database integration failed.');
  process.exitCode=1;
});
