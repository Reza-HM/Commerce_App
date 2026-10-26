import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

export const PASSWORD_CORPUS_SHA256 = '68782d6a4a19a4768d5f15dd66bd534e7a33055cc755411e33f16d18c50fdcce';

export function loadCommonPasswords(filename = join(__dirname, 'assets', '10k-most-common.txt')): ReadonlySet<string> {
  try {
    const bytes = readFileSync(filename);
    if (createHash('sha256').update(bytes).digest('hex') !== PASSWORD_CORPUS_SHA256) throw Error('checksum');
    const entries = bytes.toString('utf8').trimEnd().split(/\r?\n/);
    if (entries.length !== 10001 || entries.some(value => !value)) throw Error('entries');
    return new Set(entries.map(value => value.normalize('NFC').toLowerCase()));
  } catch {
    throw new Error('Account password policy unavailable');
  }
}
