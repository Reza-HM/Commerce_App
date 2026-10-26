import {mkdtempSync, writeFileSync, unlinkSync, rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadCommonPasswords} from '../../apps/api/src/accounts/password-policy';
import {validateRegistration} from '../../apps/api/src/accounts/validation';

test('pinned public corpus loads and rejects an actual accepted-length entry without substring filtering',()=>{
  const corpus=loadCommonPasswords();
  expect(corpus.size).toBe(10001);
  const listed=[...corpus].find(value=>Array.from(value).length>=15)!;
  expect(listed).toBeDefined();
  expect(()=>validateRegistration({email:'policy@example.invalid',password:listed},corpus)).toThrow('Invalid registration request');
  expect(()=>validateRegistration({email:'policy@example.invalid',password:listed.toUpperCase()},corpus)).toThrow('Invalid registration request');
  expect(validateRegistration({email:'policy@example.invalid',password:`prefix ${listed} suffix`},corpus).passwordNormalized).toBe(`prefix ${listed} suffix`);
});

test('missing or changed policy data fails closed without exposing paths or data',()=>{
  const folder=mkdtempSync(join(tmpdir(),'commerce-policy-'));
  const filename=join(folder,'policy.txt');
  try {
    expect(()=>loadCommonPasswords(filename)).toThrow(/^Account password policy unavailable$/);
    writeFileSync(filename,'PUBLIC_CORRUPT_POLICY_TEST_DATA');
    expect(()=>loadCommonPasswords(filename)).toThrow(/^Account password policy unavailable$/);
  } finally {unlinkSync(filename);rmdirSync(folder);}
});
