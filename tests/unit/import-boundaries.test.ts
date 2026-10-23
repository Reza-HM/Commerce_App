import {resolve} from 'node:path';
import {ESLint} from 'eslint';

const lint = new ESLint({cwd: process.cwd()});

test.each([
  ['apps/web', "import '@commerce/database';"],
  ['apps/web', "import '../../packages/database/src/index';"],
  ['apps/web', "import '../api/src/configuration';"],
  ['apps/api', "import '../web/next-env';"],
  ['packages/database', "import '../../apps/api/src/configuration';"],
  ['apps/web', "export * from '@commerce/database';"],
  ['apps/web', "void import('@commerce/database');"],
  ['apps/web', "require('@commerce/database');"],
  ['apps/web', "type Probe = import('@commerce/database').DatabaseConfiguration;"],
  ['apps/web', "import db = require('@commerce/database'); void db;"]
])('rejects forbidden dependencies in %s: %s', async (directory, source) => {
  const [result] = await lint.lintText(source, {filePath: resolve(directory, 'boundary-test.ts')});
  expect(result?.messages.some(message => message.ruleId === 'architecture/import-boundaries')).toBe(true);
});

test.each([
  ['apps/api', "import '@commerce/database';"],
  ['apps/web', "import 'react';"],
  ['packages/database', "import 'pg';"]
])('permits documented dependencies in %s: %s', async (directory, source) => {
  const [result] = await lint.lintText(source, {filePath: resolve(directory, 'boundary-test.ts')});
  expect(result?.messages.filter(message => message.ruleId === 'architecture/import-boundaries')).toEqual([]);
});
