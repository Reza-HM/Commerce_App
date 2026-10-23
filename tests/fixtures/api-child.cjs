// This harness is outside the production entry point and exposes no test route.
const {readApiConfiguration}=require('../../apps/api/dist/configuration');
const {createRuntime}=require('../../apps/api/dist/runtime');
(async()=>{
  const config=readApiConfiguration(process.env);
  const runtime=await createRuntime(config,{
    ready:()=>{process.send({event:'probe_started'});return new Promise(()=>undefined);},
    close:async()=>undefined
  });
  await runtime.listen(0);
  process.send({port:runtime.server.address().port});
  process.on('message',message=>{
    if(message==='close') void runtime.close().then(code=>process.exit(code));
  });
})().catch(()=>process.exit(1));
