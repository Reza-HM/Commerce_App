import {connect} from 'node:net';
import {request as httpRequest} from 'node:http';
import {readApiConfiguration} from '../../apps/api/src/configuration';
import {createRuntime} from '../../apps/api/src/runtime';
import type {OperationalEvent} from '../../apps/api/src/runtime';

const env={NODE_ENV:'test',DATABASE_URL:'postgres://user:secret@localhost/db',TEST_DATABASE_URL:'postgres://user:secret@localhost/runtime_test',WEB_ORIGINS:'https://shop.example'};
async function harness(settings: Record<string,string>={}) {
  const database={ready:jest.fn().mockResolvedValue(true),close:jest.fn().mockResolvedValue(undefined)};
  const logs:OperationalEvent[]=[];
  const runtime=await createRuntime(readApiConfiguration({...env,...settings}),database,event=>logs.push(event));
  await runtime.listen(0);
  const port=(runtime.server.address() as {port:number}).port;
  return {runtime,database,logs,port,url:`http://127.0.0.1:${port}`};
}
async function raw(port:number,payload:string):Promise<string> {
  return new Promise((resolve,reject)=>{
    const socket=connect(port,'127.0.0.1');let output='';
    socket.setTimeout(3000,()=>socket.destroy(Error('test socket deadline')));
    socket.on('connect',()=>socket.write(payload));socket.on('data',chunk=>{output+=chunk;});
    socket.on('error',reject);socket.on('close',()=>resolve(output));
  });
}

test('probes recover, stay uncached, and unexpected exceptions have safe correlated errors',async()=>{
  const h=await harness();
  try {
    for(const ok of [true,false,true]) {
      h.database.ready.mockResolvedValue(ok);
      const live=await fetch(h.url+'/health/live');expect(live.status).toBe(200);
      const ready=await fetch(h.url+'/health/ready');expect(ready.status).toBe(ok?200:503);
      expect(ready.headers.get('cache-control')).toBe('no-store');
      expect(await ready.json()).toEqual({status:ok?'ok':'unavailable'});
    }
    h.database.ready.mockRejectedValueOnce(Error('postgres://secret:password@private/database'));
    const response=await fetch(h.url+'/health/ready');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({error:'internal_error',message:'Internal server error',requestId:response.headers.get('x-request-id')});
    expect(JSON.stringify(h.logs)).not.toContain('password');
  } finally {expect(await h.runtime.close()).toBe(0);}
});

test('HTTP boundaries: exact CORS, parser statuses, server IDs, and redacted completion logs',async()=>{
  const h=await harness({API_BODY_LIMIT_BYTES:'64'});
  try {
    for(const origin of ['https://shop.example','https://shop.example.evil','null','malformed']) {
      const response=await fetch(h.url+'/health/live',{headers:{origin}});
      expect(response.headers.get('access-control-allow-origin')).toBe(origin==='https://shop.example'?origin:null);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    }
    const cases=[['{','application/json',400],['{}','text/plain',415],['"'+'x'.repeat(100)+'"','application/json',413],['{"value":"BODY_SECRET"}','application/json',404]] as const;
    for(const [body,contentType,status] of cases) {
      const response=await fetch(h.url+'/missing?token=QUERY_SECRET',{method:'POST',headers:{'content-type':contentType,authorization:'Bearer AUTH_SECRET',cookie:'COOKIE_SECRET','x-request-id':'CALLER_SECRET'},body});
      expect(response.status).toBe(status);
      const id=response.headers.get('x-request-id');expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect((await response.json() as {requestId:string}).requestId).toBe(id);
      expect(h.logs.some(event=>event.requestId===id && event.status===status)).toBe(true);
    }
    const chunked=await raw(h.port,'POST /missing HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n80\r\n'+'x'.repeat(128)+'\r\n0\r\n\r\n');
    expect(chunked).toContain('413');
    expect(JSON.stringify(h.logs)).not.toMatch(/QUERY_SECRET|AUTH_SECRET|COOKIE_SECRET|CALLER_SECRET|BODY_SECRET/);
    expect(await raw(h.port,'GET / HTTP/1.1\r\nHost: localhost\r\nX-Huge: '+'x'.repeat(17000)+'\r\n\r\n')).toContain('431');
  } finally {await h.runtime.close();}
});

test('incomplete headers and bodies are terminated within finite receive deadlines',async()=>{
  const h=await harness({API_HEADER_TIMEOUT_MS:'150',API_REQUEST_TIMEOUT_MS:'300'});
  try {
    for(const payload of ['GET / HTTP/1.1\r\nHost:', 'POST / HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 50\r\n\r\n{']) {
      const started=performance.now();
      expect(await raw(h.port,payload)).toContain('408');
      expect(performance.now()-started).toBeLessThan(1000);
    }
  } finally {await h.runtime.close();}
});

test('shutdown is idempotent and drains then closes resources once',async()=>{
  const h=await harness();
  const a=h.runtime.close(),b=h.runtime.close();expect(a).toBe(b);
  expect(await a).toBe(0);expect(h.database.close).toHaveBeenCalledTimes(1);
});

test('shutdown makes an in-flight readiness response unavailable before closing the pool',async()=>{
  const h=await harness();
  let finish!: (value:boolean)=>void;
  let started!: ()=>void;
  const entered=new Promise<void>(resolve=>{started=resolve;});
  h.database.ready.mockImplementation(()=>{started();return new Promise(resolve=>{finish=resolve;});});
  const response=fetch(h.url+'/health/ready');await entered;
  const closed=h.runtime.close();expect(h.database.close).not.toHaveBeenCalled();
  finish(true);
  expect((await response).status).toBe(503);
  expect(await closed).toBe(0);expect(h.database.close).toHaveBeenCalledTimes(1);
});

test('blocked request reaches hard shutdown deadline with failure indication',async()=>{
  const h=await harness({API_SHUTDOWN_TIMEOUT_MS:'150'});
  h.database.ready.mockImplementation(()=>new Promise(()=>undefined));
  const started=new Promise<void>(resolve=>h.database.ready.mockImplementation(()=>{resolve();return new Promise(()=>undefined);}));
  const pending=httpRequest(h.url+'/health/ready');pending.on('error',()=>undefined);pending.end();
  await started;
  const beginning=performance.now();expect(await h.runtime.close()).toBe(1);
  expect(performance.now()-beginning).toBeLessThan(650);
});
