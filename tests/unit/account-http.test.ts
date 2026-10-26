import {request as httpRequest} from 'node:http';
import type {AccountCreation, NewAccount} from '@commerce/database';
import {readApiConfiguration} from '../../apps/api/src/configuration';
import {createRuntime} from '../../apps/api/src/runtime';
import type {OperationalEvent} from '../../apps/api/src/runtime';
import {RegistrationService, isRegistrationDependencyUnavailable} from '../../apps/api/src/accounts/service';
import type {RegistrationOptions} from '../../apps/api/src/accounts/service';

const body={email:'Person+shop@Example.COM',password:'Synthetic HTTP passphrase'};
async function harness(options: RegistrationOptions = {}, settings: Record<string,string> = {}) {
  let time=0;
  const resources={ready:jest.fn(async()=>true),close:jest.fn(async()=>undefined)};
  const identities=new Set<string>();
  const create=jest.fn(async (input:NewAccount):Promise<AccountCreation>=>{
    if(identities.has(input.emailNormalized))return {kind:'existing'};
    identities.add(input.emailNormalized);return {kind:'created',id:input.id};
  });
  const hash=jest.fn(async()=> 'synthetic-http-credential');
  const registration=new RegistrationService({create},{commonPasswords:new Set(),hash,now:()=>time,...options});
  const logs:OperationalEvent[]=[];
  const config=readApiConfiguration({NODE_ENV:'test',TEST_DATABASE_URL:'postgres://test:test@localhost/http_registration_test',WEB_ORIGINS:'https://shop.example',...settings});
  const runtime=await createRuntime(config,resources,event=>logs.push(event),registration);
  await runtime.listen(0);
  const url=`http://127.0.0.1:${(runtime.server.address() as {port:number}).port}`;
  const post=(value:unknown=body,headers:Record<string,string>={})=>fetch(url+'/accounts/register?private=QUERY_PRIVATE',{
    method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(value)
  });
  return {runtime,resources,registration,create,hash,logs,url,post,tick:()=>{time+=60000;}};
}

test('new/duplicate/concurrent canonical addresses share exact acceptance without credential or privilege output',async()=>{
  const h=await harness();
  try {
    const responses=await Promise.all([h.post(),h.post({...body,email:' person+shop@example.com ',password:'Another synthetic HTTP passphrase'})]);
    for(const response of responses) {
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({status:'accepted',message:'Registration request processed.'});
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
      for(const header of ['set-cookie','location'])expect(response.headers.get(header)).toBeNull();
    }
    expect(h.hash).toHaveBeenCalledTimes(2);expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.create.mock.calls.every(([input])=>input.emailNormalized==='person+shop@example.com')).toBe(true);
    expect((await Promise.all(h.create.mock.results.map(result=>result.value))).map(value=>value.kind).sort()).toEqual(['created','existing']);
    expect(h.logs.some(event=>event.path==='/accounts/register'&&event.status===202)).toBe(true);
    expect(JSON.stringify(h.logs)).not.toMatch(/Person|example.com|passphrase|synthetic-http-credential|QUERY_PRIVATE/);
    const alias=await fetch(h.url+'/ACCOUNTS/register/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    expect(alias.status).toBe(202);expect(alias.headers.get('cache-control')).toBe('no-store');
    expect(await alias.json()).toEqual({status:'accepted',message:'Registration request processed.'});
    expect(h.logs.at(-1)).toMatchObject({path:'/accounts/register',status:202});
    h.tick();expect((await h.post({...body,isAdmin:true})).status).toBe(400);
    expect(h.hash).toHaveBeenCalledTimes(3);
  } finally {await h.runtime.close();}
});

test('policy errors are fixed, deterministic, correlated and independent of repository existence',async()=>{
  const h=await harness({commonPasswords:new Set(['longblockedpassword'])});
  try {
    for(const value of [{...body,email:'invalid',password:2},{...body,password:'LongBlockedPassword'},{...body,PRIVATE_FIELD:true}]) {
      h.tick();const response=await h.post(value);expect(response.status).toBe(400);
      const error=await response.json() as Record<string,string>;
      expect(error.requestId).toBe(response.headers.get('x-request-id'));
      expect(error).toMatchObject({error:'invalid_registration',message:'Invalid registration request'});
      expect(['email','password','body']).toContain(error.field);
      expect(JSON.stringify(error)).not.toMatch(/PRIVATE_FIELD|LongBlockedPassword|Person/);
    }
    expect(h.hash).not.toHaveBeenCalled();expect(h.create).not.toHaveBeenCalled();
  } finally {await h.runtime.close();}
});

test('safe 503/500 preserve status and redact all request and driver values',async()=>{
  const h=await harness();
  try {
    for(const code of ['ECONNREFUSED','42P01','57014','23505','PROGRAMMING_BUG']) {
      h.tick();h.create.mockRejectedValueOnce(Object.assign(Error('DRIVER_PRIVATE'),{code}));
      const response=await h.post(body,{authorization:'Bearer AUTH_PRIVATE',cookie:'COOKIE_PRIVATE','x-request-id':'CALLER_PRIVATE',forwarded:'FORWARDED_PRIVATE'});
      const status=['23505','PROGRAMMING_BUG'].includes(code)?500:503;
      expect(response.status).toBe(status);
      const error=await response.json() as Record<string,string>;
      expect(error.requestId).toBe(response.headers.get('x-request-id'));
      expect(response.headers.get('cache-control')).toBe('no-store');
      if(status===503)expect(response.headers.get('retry-after')).toBe('1');
      expect(JSON.stringify({error,logs:h.logs})).not.toMatch(/DRIVER_PRIVATE|AUTH_PRIVATE|COOKIE_PRIVATE|CALLER_PRIVATE|FORWARDED_PRIVATE|QUERY_PRIVATE|passphrase|Person/);
    }
  } finally {await h.runtime.close();}
});

test('registration retains exact-origin CORS and parser status behavior without counting parser failures',async()=>{
  const h=await harness({}, {API_BODY_LIMIT_BYTES:'160'});
  try {
    for(const origin of ['https://shop.example','https://shop.example.evil','null']) {
      const response=await fetch(h.url+'/accounts/register',{method:'OPTIONS',headers:{origin,'access-control-request-method':'POST'}});
      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin==='https://shop.example'?origin:null);
      if(origin==='https://shop.example')expect(response.headers.get('access-control-allow-methods')).toContain('POST');
      expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    }
    for(let index=0;index<6;index++) {
      const response=await fetch(h.url+'/accounts/register',{method:'POST',headers:{'content-type':'application/json'},body:'{'});
      expect(response.status).toBe(400);
    }
    expect((await fetch(h.url+'/accounts/register',{method:'POST',headers:{'content-type':'text/plain'},body:'{}'})).status).toBe(415);
    expect((await h.post({...body,password:'x'.repeat(200)})).status).toBe(413);
    expect((await h.post()).status).toBe(202);
  } finally {await h.runtime.close();}
});

test('sixth parsed request gets 429 despite varied emails or forwarded identity; health and expiry remain usable',async()=>{
  const h=await harness();
  try {
    for(let index=0;index<5;index++)expect((await h.post({email:index},{'x-forwarded-for':`192.0.2.${index}`})).status).toBe(400);
    const limited=await h.post(body,{'x-forwarded-for':'198.51.100.1'});
    expect(limited.status).toBe(429);expect(limited.headers.get('retry-after')).toBe('60');
    expect(h.hash).not.toHaveBeenCalled();expect(h.create).not.toHaveBeenCalled();
    expect((await fetch(h.url+'/health/live')).status).toBe(200);
    expect((await fetch(h.url+'/health/ready')).status).toBe(200);
    h.tick();expect((await h.post()).status).toBe(202);
  } finally {await h.runtime.close();}
});

test('two in-flight operations reject more work, retain slots after disconnect, then release on completion',async()=>{
  const releases:Array<()=>void>=[];
  let entered!:()=>void;
  const bothEntered=new Promise<void>(resolve=>{entered=resolve;});
  let passThrough=false;
  const hash=jest.fn(async()=>{
    if(passThrough)return 'synthetic';
    return new Promise<string>(resolve=>{releases.push(()=>resolve('synthetic'));if(releases.length===2)entered();});
  });
  const h=await harness({hash});
  const client=httpRequest(h.url+'/accounts/register',{method:'POST',headers:{'content-type':'application/json'}});
  client.on('error',()=>undefined);
  const disconnected=new Promise<void>(resolve=>client.once('close',()=>resolve()));
  client.end(JSON.stringify(body));
  const second=h.post({...body,email:'second@example.com'});
  try {
    await bothEntered;
    expect((await h.post()).status).toBe(503);expect(hash).toHaveBeenCalledTimes(2);expect(h.create).not.toHaveBeenCalled();
    client.destroy();await disconnected;
    expect((await h.post()).status).toBe(503);expect(hash).toHaveBeenCalledTimes(2);
    expect((await fetch(h.url+'/health/live')).status).toBe(200);
    releases.forEach(release=>release());expect((await second).status).toBe(202);
    await h.registration.drain();expect(h.create).toHaveBeenCalledTimes(2);
    passThrough=true;h.tick();expect((await h.post()).status).toBe(202);
  } finally {releases.forEach(release=>release());await h.runtime.close();}
},15000);

test('graceful shutdown drains disconnected registration work before closing the pool',async()=>{
  let finish!:()=>void,entered!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const h=await harness({hash:()=>new Promise<string>(resolve=>{finish=()=>resolve('synthetic');entered();})});
  const client=httpRequest(h.url+'/accounts/register',{method:'POST',headers:{'content-type':'application/json'}});
  client.on('error',()=>undefined);client.end(JSON.stringify(body));
  await started;client.destroy();
  const closed=h.runtime.close();
  await new Promise(resolve=>setImmediate(resolve));expect(h.resources.close).not.toHaveBeenCalled();
  finish();expect(await closed).toBe(0);expect(h.create).toHaveBeenCalledTimes(1);expect(h.resources.close).toHaveBeenCalledTimes(1);
});

test('dependency classifications are narrow and inspect bounded causes',()=>{
  for(const error of [Error('Query read timeout'),Error('timeout exceeded when trying to connect'),{cause:{code:'08006'}},{code:'ETIMEDOUT'}])expect(isRegistrationDependencyUnavailable(error)).toBe(true);
  for(const error of [Error('arbitrary secret'),{code:'23505'},{code:'42703'},null])expect(isRegistrationDependencyUnavailable(error)).toBe(false);
});
