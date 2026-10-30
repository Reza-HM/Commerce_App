import {
  AccountRepository,
  ConfigurationError,
  Database,
  PostgresSessionRepository,
} from '@commerce/database';
import { readApiConfiguration } from './configuration';
import { createRuntime } from './runtime';
import { logEvent, logStartupFailure } from './logging';
import { RegistrationService } from './accounts/service';
import { SessionService } from './accounts/sessions';

async function main() {
  const config = readApiConfiguration(process.env);
  const database = new Database(config.database, (event) => logEvent({ event }));
  const registration = new RegistrationService(new AccountRepository(database));
  const sessions = new SessionService(
    new PostgresSessionRepository(database),
    registration,
  );
  const runtime = await createRuntime(config, database, logEvent, registration, sessions);
  await runtime.listen();
  const stop = () => {
    void runtime.close().then((code) => process.exit(code));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  if (process.platform === 'win32') process.on('SIGBREAK', stop);
}
main().catch((error) => {
  logStartupFailure(
    error instanceof ConfigurationError ? error.message : 'API startup failed',
  );
  process.exit(1);
});
