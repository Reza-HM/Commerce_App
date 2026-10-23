const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const packageOwners = {
  '@commerce/api': 'apps/api',
  '@commerce/web': 'apps/web',
  '@commerce/database': 'packages/database'
};

function owner(filename) {
  const relative = path.relative(root, filename).replaceAll('\\', '/');
  return relative.match(/^(apps|packages)\/[^/]+(?=\/|$)/)?.[0];
}

function destination(filename, specifier) {
  if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    let target = path.resolve(path.dirname(filename), specifier);
    if (fs.existsSync(target)) target = fs.realpathSync(target);
    return owner(target);
  }
  return Object.entries(packageOwners).find(([name]) => specifier === name || specifier.startsWith(`${name}/`))?.[1];
}

module.exports = {
  rules: {
    'import-boundaries': {
      meta: {
        type: 'problem',
        schema: [],
        messages: {forbidden: '{{from}} cannot import {{to}}; use the documented workspace boundary.'}
      },
      create(context) {
        const from = owner(context.filename);
        function check(node) {
          if (!node || !from) return;
          const specifier = node.value ?? (node.type === 'TemplateLiteral' && node.expressions.length === 0 ? node.quasis[0]?.value.cooked : undefined);
          if (typeof specifier !== 'string') return;
          const to = destination(context.filename, specifier);
          if (!to) return;
          const forbidden = (from === 'apps/web' && to === 'packages/database')
            || (from.startsWith('apps/') && to.startsWith('apps/') && from !== to)
            || (from.startsWith('packages/') && to.startsWith('apps/'));
          if (forbidden) context.report({node, messageId: 'forbidden', data: {from, to}});
        }
        return {
          ImportDeclaration: node => check(node.source),
          ExportNamedDeclaration: node => check(node.source),
          ExportAllDeclaration: node => check(node.source),
          ImportExpression: node => check(node.source),
          TSImportEqualsDeclaration: node => check(node.moduleReference.expression),
          TSImportType: node => check(node.source),
          CallExpression(node) {
            if (node.callee.type === 'Identifier' && node.callee.name === 'require') check(node.arguments[0]);
          }
        };
      }
    }
  }
};
