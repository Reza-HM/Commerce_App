import {mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
import Ajv2020 from 'ajv/dist/2020';
import type {AnySchemaObject} from 'ajv';
import addFormats from 'ajv-formats';
import type {AccountCreation} from '@commerce/database';
import {readApiConfiguration} from '../../apps/api/src/configuration';
import {createRuntime} from '../../apps/api/src/runtime';
import {RegistrationService} from '../../apps/api/src/accounts/service';
import {validateRegistration} from '../../apps/api/src/accounts/validation';
import {loadCommonPasswords} from '../../apps/api/src/accounts/password-policy';

interface HeaderContract {$ref?: string; schema: AnySchemaObject}
interface ResponseContract {
  $ref?: string;
  headers: Record<string, HeaderContract>;
  content: Record<string, {schema: AnySchemaObject; example?: unknown}>;
}
interface Operation {
  operationId: string;
  requestBody?: {content: Record<string, {schema: AnySchemaObject; example: unknown}>};
  responses: Record<string, ResponseContract>;
}
const contract = JSON.parse(readFileSync('docs/api/openapi.json', 'utf8')) as {
  paths: Record<string, Record<string, Operation>>;
  components: Record<string, unknown>;
};
const ajv = new Ajv2020({strict: false, allErrors: true});
addFormats(ajv);

function resolve<T extends {$ref?: string}>(value: T): T {
  if (!value.$ref) return value;
  if (!value.$ref.startsWith('#/')) throw Error('Contract tests require local references');
  return value.$ref.slice(2).split('/').reduce<unknown>((node, key) =>
    (node as Record<string, unknown>)[key], contract) as T;
}

function validate(schema: AnySchemaObject, value: unknown) {
  const check = ajv.compile({...schema, components: contract.components});
  expect({valid: check(value), errors: check.errors}).toEqual({valid: true, errors: null});
}

async function checkResponse(path: string, method: string, response: Response) {
  const declared = contract.paths[path]![method]!.responses[String(response.status)];
  expect(declared).toBeDefined();
  const expected = resolve(declared!);
  const body: unknown = await response.json();
  validate(expected.content['application/json']!.schema, body);
  for (const [name, header] of Object.entries(expected.headers)) {
    const value = response.headers.get(name);
    expect(value).not.toBeNull();
    validate(resolve(header).schema, value);
  }
  if (body && typeof body === 'object' && 'requestId' in body) {
    expect(body.requestId).toBe(response.headers.get('x-request-id'));
  }
  return body;
}

test('OpenAPI passes the pinned validator and builds a usable HTML reference', () => {
  const output = mkdtempSync(join(tmpdir(), 'commerce-api-docs-'));
  const cli = 'node_modules/@redocly/cli/bin/cli.js';
  try {
    const lint = spawnSync(process.execPath, [cli, 'lint', 'commerce'], {
      encoding: 'utf8', timeout: 30000
    });
    expect({status: lint.status, stderr: lint.stderr}).toEqual({status: 0, stderr: expect.any(String)});
    expect(lint.stdout + lint.stderr).not.toMatch(/You have \d+ warnings?\./);
    const html = join(output, 'reference.html');
    const build = spawnSync(process.execPath, [cli, 'build-docs', 'commerce', '--inlineBundle', '--output', html], {
      encoding: 'utf8', timeout: 30000
    });
    expect({status: build.status, stderr: build.stderr}).toEqual({status: 0, stderr: expect.any(String)});
    const reference = readFileSync(html, 'utf8');
    for (const path of Object.keys(contract.paths)) expect(reference).toContain(path);
    expect(reference).toContain('Commerce_App HTTP API');
    expect(reference).not.toMatch(/<script\b[^>]*\bsrc=["']https?:/i);
  } finally {
    rmSync(join(output, 'reference.html'), {force: true});
    rmdirSync(output);
  }
}, 65000);

test('every statically declared Nest route has exactly one documented operation', () => {
  const methods = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete', 'Options', 'Head', 'All']);
  const actual: string[] = [];
  function scan(directory: string) {
    for (const entry of readdirSync(directory, {withFileTypes: true})) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { scan(path); continue; }
      if (!entry.name.endsWith('.ts')) continue;
      const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
      const imports = new Map<string, string>();
      for (const node of source.statements) {
        if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier) ||
          node.moduleSpecifier.text !== '@nestjs/common') continue;
        const bindings = node.importClause?.namedBindings;
        // Dynamic/namespace routing needs explicit coverage before adoption.
        if (bindings && ts.isNamespaceImport(bindings)) throw Error(`Unsupported Nest namespace import: ${path}`);
        if (bindings) for (const binding of bindings.elements) {
          imports.set(binding.name.text, binding.propertyName?.text ?? binding.name.text);
        }
      }
      function decorators(node: ts.Node) {
        return (ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : []).flatMap(decorator => {
          const call = decorator.expression;
          if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return [];
          const name = imports.get(call.expression.text);
          if (name !== 'Controller' && !methods.has(name ?? '')) return [];
          const argument = call.arguments[0];
          if (argument && !ts.isStringLiteral(argument)) throw Error(`Non-static route needs coverage: ${path}`);
          return [{name: name!, path: argument ? (argument as ts.StringLiteral).text : ''}];
        });
      }
      function visit(node: ts.Node) {
        if (ts.isClassDeclaration(node)) {
          const controller = decorators(node).find(value => value.name === 'Controller');
          if (controller) for (const member of node.members) {
            for (const route of decorators(member)) {
              if (route.name === 'All') throw Error('Document explicit HTTP methods before adopting @All');
              const url = ('/' + controller.path + '/' + route.path).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
              actual.push(`${route.name.toLowerCase()} ${url.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`);
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan('apps/api/src');
  const documented = Object.entries(contract.paths).flatMap(([path, operations]) =>
    Object.keys(operations).filter(method => methods.has(method.charAt(0).toUpperCase() + method.slice(1)))
      .map(method => `${method} ${path}`));
  expect(actual.sort()).toEqual(documented.sort());
  expect(new Set(actual).size).toBe(actual.length);
  expect(new Set(Object.values(contract.paths).flatMap(operations => Object.values(operations).map(op => op.operationId))).size)
    .toBe(actual.length);
});

test('documented examples and representative HTTP responses match the actual service', async () => {
  const path = '/accounts/register';
  const request = contract.paths[path]!.post!.requestBody!.content['application/json']!;
  const example = request.example as Record<string, string>;
  validate(request.schema, example);
  expect(() => validateRegistration(example, loadCommonPasswords())).not.toThrow();
  let clock = 0;
  const database = {ready: jest.fn(async () => true), close: jest.fn(async () => undefined)};
  const create = jest.fn(async (): Promise<AccountCreation> => ({kind: 'existing'}));
  const registration = new RegistrationService({create}, {
    hash: async () => 'synthetic-doc-test-hash', commonPasswords: new Set(), now: () => clock
  });
  const runtime = await createRuntime(readApiConfiguration({
    NODE_ENV: 'test', TEST_DATABASE_URL: 'postgres://fixture:fixture@localhost/documentation_test',
    API_BODY_LIMIT_BYTES: '256'
  }), database, () => undefined, registration);
  await runtime.listen(0);
  const base = `http://127.0.0.1:${(runtime.server.address() as {port: number}).port}`;
  const post = (body = JSON.stringify(example), contentType = 'application/json') => {
    clock += 60000;
    return fetch(base + path, {method: 'POST', headers: {'content-type': contentType}, body});
  };
  try {
    await checkResponse('/health/live', 'get', await fetch(base + '/health/live'));
    for (const ready of [true, false]) {
      database.ready.mockResolvedValue(ready);
      await checkResponse('/health/ready', 'get', await fetch(base + '/health/ready'));
    }
    database.ready.mockRejectedValueOnce(Error('synthetic dependency exception'));
    await checkResponse('/health/ready', 'get', await fetch(base + '/health/ready'));
    const accepted = await post();
    expect(accepted.status).toBe(202);
    await checkResponse(path, 'post', accepted);
    for (const name of ['set-cookie', 'location']) expect(accepted.headers.get(name)).toBeNull();
    // Both repository outcomes must produce the documented acceptance.
    create.mockResolvedValueOnce({kind: 'created', id: 'synthetic-doc-test-id'});
    await checkResponse(path, 'post', await post());
    for (const body of [{...example, password: 'short'}, {...example, isAdmin: true}]) {
      const response = await post(JSON.stringify(body));
      expect(response.status).toBe(400);
      await checkResponse(path, 'post', response);
    }
    for (const [body, media, status] of [['{', 'application/json', 400], ['{}', 'text/plain', 415],
      [JSON.stringify({value: 'x'.repeat(300)}), 'application/json', 413]] as const) {
      const response = await post(body, media);
      expect(response.status).toBe(status);
      await checkResponse(path, 'post', response);
    }
    for (const code of ['ECONNREFUSED', 'UNEXPECTED']) {
      create.mockRejectedValueOnce(Object.assign(Error('synthetic-doc-failure'), {code}));
      const response = await post();
      expect(response.status).toBe(code === 'ECONNREFUSED' ? 503 : 500);
      await checkResponse(path, 'post', response);
    }
    clock += 60000;
    for (let count = 0; count < 5; count++) {
      await fetch(base + path, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'});
    }
    const limited = await fetch(base + path, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'});
    expect(limited.status).toBe(429);
    await checkResponse(path, 'post', limited);
  } finally {
    expect(await runtime.close()).toBe(0);
  }
}, 15000);
