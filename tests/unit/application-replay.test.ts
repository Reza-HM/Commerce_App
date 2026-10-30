import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const load = createRequire(resolve('package.json'));
type Database = {
  orm: { execute: (query: SQL | string) => Promise<{ rows: object[] }> };
  takeQueries: () => string[];
};
const { validateApplicationHistory } = load('./scripts/integration-migrations.cjs') as {
  validateApplicationHistory(
    db: Database,
    folder: string,
    options: {
      apply: (history: { count: number }, factory: () => Database) => Promise<void>;
    },
  ): Promise<{ count: number; empty: boolean }>;
};
const { readMigrationFiles } = load('drizzle-orm/migrator') as {
  readMigrationFiles(options: {
    migrationsFolder: string;
  }): Array<{ hash: string; folderMillis: number; sql: string[] }>;
};

test.each(['valid', 'repeated-sql', 'changed-schema', 'changed-journal', 'empty'])(
  'application replay verifies %s without a database',
  async (behavior) => {
    const folder = mkdtempSync(join(tmpdir(), 'commerce-replay-unit-')),
      dialect = new PgDialect();
    mkdirSync(join(folder, 'meta'));
    const journal = join(folder, 'meta/_journal.json'),
      source = join(folder, '0000_fixture.sql');
    try {
      const entries =
        behavior === 'empty'
          ? []
          : [{ idx: 0, version: '7', when: 1, tag: '0000_fixture', breakpoints: true }];
      writeFileSync(
        journal,
        JSON.stringify({ version: '7', dialect: 'postgresql', entries }),
      );
      writeFileSync(source, 'SELECT 42;');
      const files = readMigrationFiles({ migrationsFolder: folder });
      let calls = 0,
        trace: string[] = [];
      const db: Database = {
        orm: {
          execute: async (query) => {
            const text =
              typeof query === 'string' ? query : dialect.sqlToQuery(query).sql;
            if (text.includes('to_regclass'))
              return { rows: [{ present: calls > 0 && behavior !== 'empty' }] };
            if (text.startsWith('SELECT id,hash'))
              return {
                rows: files.map((file) => ({
                  id: 1,
                  hash:
                    behavior === 'changed-journal' && calls === 2 ? 'changed' : file.hash,
                  created_at: String(file.folderMillis),
                })),
              };
            return {
              rows:
                behavior === 'empty'
                  ? []
                  : [
                      {
                        name:
                          behavior === 'changed-schema' && calls === 2
                            ? 'changed'
                            : 'stable',
                      },
                    ],
            };
          },
        },
        takeQueries: () => {
          const result = trace;
          trace = [];
          return result;
        },
      };
      const apply = jest.fn(
        async (_history: { count: number }, factory: () => Database) => {
          expect(factory()).toBe(db);
          calls++;
          if (behavior === 'repeated-sql' && calls === 2) trace.push('SELECT 42;');
        },
      );
      const operation = validateApplicationHistory(db, folder, { apply });
      if (['valid', 'empty'].includes(behavior))
        await expect(operation).resolves.toEqual({
          count: entries.length,
          empty: entries.length === 0,
        });
      else await expect(operation).rejects.toThrow();
      expect(apply).toHaveBeenCalledTimes(2);
    } finally {
      unlinkSync(source);
      unlinkSync(journal);
      rmdirSync(join(folder, 'meta'));
      rmdirSync(folder);
    }
  },
);
