const {copyFileSync, mkdirSync} = require('node:fs');
const {join} = require('node:path');

const source = join(__dirname, '../apps/api/src/accounts/assets');
const destination = join(__dirname, '../apps/api/dist/accounts/assets');
mkdirSync(destination, {recursive: true});
for (const name of ['10k-most-common.txt', 'LICENSE', 'PROVENANCE.md']) {
  copyFileSync(join(source, name), join(destination, name));
}
