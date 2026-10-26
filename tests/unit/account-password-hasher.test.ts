import {scrypt} from 'node:crypto';
import {hashPassword} from '../../apps/api/src/accounts/password-hasher';

test('production-cost asynchronous scrypt uses independent salts and reproduces the NFC key',async()=>{
  const password='Synthetic e\u0301 hash passphrase';
  let eventLoopProgress=false;
  const pending=hashPassword(password);
  await new Promise<void>(resolve=>setImmediate(()=>{eventLoopProgress=true;resolve();}));
  expect(eventLoopProgress).toBe(true);
  const first=await pending,second=await hashPassword(password);
  const pattern=/^scrypt\$v1\$131072\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/;
  expect(first).toMatch(pattern);expect(second).toMatch(pattern);expect(first).not.toBe(second);
  const parts=first.split('$');
  const salt=Buffer.from(parts[5]!,'base64url');
  const key=Buffer.from(parts[6]!,'base64url');
  expect(salt.length).toBe(16);expect(key.length).toBe(64);
  const parameters={N:Number(parts[2]),r:Number(parts[3]),p:Number(parts[4]),maxmem:192*1024*1024};
  const reproduced=await new Promise<Buffer>((resolve,reject)=>scrypt(password.normalize('NFC'),salt,64,parameters,(error,value)=>error?reject(error):resolve(value)));
  expect(reproduced.equals(key)).toBe(true);
  expect(first).not.toContain(password);
},15000);
