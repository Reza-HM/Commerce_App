import {ConsoleLogger} from '@nestjs/common';

const logger=new ConsoleLogger('Operations',{
  json:true,
  colors:false,
  logLevels:['log','warn','error'],
  flattenParams:true,
  redact:['password','authorization','cookie','connectionString','databaseUrl']
});

// Callers supply fixed operational fields, never raw request/exception objects.
export function logEvent(event: Readonly<Record<string,string|number>>): void {
  logger.log('operation',event);
}

export function logStartupFailure(message:string): void {
  logger.error({event:'startup_failed',message});
}
