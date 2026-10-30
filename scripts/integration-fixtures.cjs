const { randomUUID } = require('node:crypto');
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  realpathSync,
  lstatSync,
  unlinkSync,
  rmdirSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, dirname } = require('node:path');
const { sql } = require('drizzle-orm');

function identifier(value) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value))
    throw new Error('Unsafe fixture identifier');
  return '"' + value + '"';
}

class OwnedSchema {
  constructor(database, label) {
    if (!/^[a-z]{1,12}$/.test(label)) throw new Error('Unsafe fixture label');
    this.database = database;
    this.schema = `validation_${label}_${randomUUID().replaceAll('-', '')}`;
    this.tables = new Set();
    this.records = [];
    this.created = false;
  }
  async create() {
    await this.database.orm.execute(`CREATE SCHEMA ${identifier(this.schema)}`);
    this.created = true;
  }
  table(name) {
    identifier(name);
    this.tables.add(name); // Intent registered before DDL, including rollback cases.
    return `${identifier(this.schema)}.${identifier(name)}`;
  }
  trackRecord(schema, table, column, value) {
    for (const name of [schema, table, column]) identifier(name);
    if (
      !['string', 'number'].includes(typeof value) ||
      (typeof value === 'number' && !Number.isSafeInteger(value))
    ) {
      throw new Error('Unsafe fixture key');
    }
    this.records.push({ schema, table, column, value, confirmed: false });
  }
  confirmRecord(schema, table, column, value) {
    const record = this.records.find(
      (row) =>
        row.schema === schema &&
        row.table === table &&
        row.column === column &&
        row.value === value,
    );
    if (!record) throw new Error('Unowned fixture record');
    record.confirmed = true; // Call only after a successful creation, never a conflict.
  }
  async deleteRecord(schema, table, column, value) {
    const index = this.records.findIndex(
      (row) =>
        row.schema === schema &&
        row.table === table &&
        row.column === column &&
        row.value === value,
    );
    if (index < 0 || !this.records[index].confirmed)
      throw new Error('Unconfirmed fixture ownership');
    await this.database.orm.execute(
      sql`DELETE FROM ${sql.identifier(schema)}.${sql.identifier(table)} WHERE ${sql.identifier(column)} = ${value}`,
    );
    this.records.splice(index, 1);
  }
  async cleanup() {
    for (const row of [...this.records].reverse())
      await this.deleteRecord(row.schema, row.table, row.column, row.value);
    if (!this.created) return;
    for (const table of [...this.tables].reverse()) {
      await this.database.orm.execute(
        `DROP TABLE IF EXISTS ${identifier(this.schema)}.${identifier(table)} RESTRICT`,
      );
    }
    // Unknown contents and outside dependencies fail rather than expanding scope.
    await this.database.orm.execute(`DROP SCHEMA ${identifier(this.schema)} RESTRICT`);
    this.created = false;
  }
}

class OwnedDirectory {
  constructor() {
    this.parent = realpathSync(tmpdir());
    this.folder = mkdtempSync(join(this.parent, 'commerce-migration-'));
    this.files = new Set();
    mkdirSync(join(this.folder, 'meta'));
  }
  validate() {
    if (
      dirname(this.folder) !== this.parent ||
      realpathSync(this.folder) !== this.folder ||
      realpathSync(join(this.folder, 'meta')) !== join(this.folder, 'meta')
    )
      throw new Error('Unsafe fixture path');
  }
  write(name, contents) {
    if (!/^(meta\/_journal\.json|\d{4}_[a-z_]+\.sql)$/.test(name))
      throw new Error('Unsafe fixture filename');
    this.validate();
    const target = join(this.folder, name);
    if (
      existsSync(target) &&
      (lstatSync(target).isSymbolicLink() || !this.files.has(name))
    )
      throw new Error('Unowned fixture file');
    this.files.add(name);
    writeFileSync(target, contents);
  }
  cleanup() {
    this.validate();
    for (const name of this.files) {
      const target = join(this.folder, name);
      if (existsSync(target)) unlinkSync(target);
    }
    rmdirSync(join(this.folder, 'meta'));
    rmdirSync(this.folder); // No recursive deletion; unknown files fail closed.
  }
}

async function schemaSnapshot(database, schema) {
  const result = await database.orm.execute(sql`
    SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind,
      ARRAY(SELECT a.attname || ':' || format_type(a.atttypid,a.atttypmod) || ':' || a.attnotnull || ':' ||
        coalesce(pg_get_expr(d.adbin,d.adrelid),'')
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) AS columns,
      ARRAY(SELECT conname || ':' || pg_get_constraintdef(oid) FROM pg_constraint
        WHERE conrelid=c.oid ORDER BY conname) AS constraints,
      ARRAY(SELECT pg_get_indexdef(indexrelid) FROM pg_index WHERE indrelid=c.oid ORDER BY pg_get_indexdef(indexrelid)) AS indexes,
      CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid) ELSE NULL END AS view
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r','p','v','m','S') AND (${schema ?? null}::text IS NULL OR n.nspname=${schema ?? null})
    ORDER BY n.nspname,c.relname`);
  return result.rows;
}

async function relationExists(database, schema, table) {
  const result = await database.orm.execute(
    sql`SELECT to_regclass(${`${identifier(schema)}.${identifier(table)}`}) IS NOT NULL AS present`,
  );
  return result.rows[0].present;
}

async function journalSnapshot(database, schema = 'drizzle') {
  if (!(await relationExists(database, schema, '__drizzle_migrations'))) return [];
  const result = await database.orm.execute(
    `SELECT id,hash,created_at FROM ${identifier(schema)}."__drizzle_migrations" ORDER BY id`,
  );
  return result.rows;
}

module.exports = {
  identifier,
  OwnedSchema,
  OwnedDirectory,
  schemaSnapshot,
  relationExists,
  journalSnapshot,
};
