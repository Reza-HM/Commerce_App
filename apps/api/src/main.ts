import {AccountRepository, ConfigurationError, Database} from '@commerce/database';
import {readApiConfiguration} from './configuration';
import {createRuntime} from './runtime';
import {logEvent,logStartupFailure} from './logging';
import {RegistrationService} from './accounts/service';

async function main() {
  const config=readApiConfiguration(process.env);
  const database=new Database(config.database,event=>logEvent({event}));
  const registration=new RegistrationService(new AccountRepository(database));
  const runtime=await createRuntime(config,database,logEvent,registration);
  await runtime.listen();
  const stop=()=>{void runtime.close().then(code=>process.exit(code));};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  if(process.platform==='win32') process.on('SIGBREAK',stop);
}
main().catch(error=>{
  logStartupFailure(error instanceof ConfigurationError ? error.message:'API startup failed');
  process.exit(1);
});
