import {
  AccountRepository,
  ConfigurationError,
  Database,
  PostgresSessionRepository,
  PostgresVerificationRepository,
  PostgresRecoveryRepository,
} from '@commerce/database';
import { readApiConfiguration } from './configuration';
import { createRuntime } from './runtime';
import { logEvent, logStartupFailure } from './logging';
import { RegistrationService } from './accounts/service';
import { SessionService } from './accounts/sessions';
import { VerificationService } from './accounts/verification';
import { SmtpVerificationSender, readMailConfiguration } from './accounts/mail';
import { RecoveryService } from './accounts/recovery';
import { RegistrationAdmission } from './accounts/admission';

async function main() {
  const config = readApiConfiguration(process.env);
  const mail = readMailConfiguration(process.env, config.webOrigins);
  const database = new Database(config.database, (event) => logEvent({ event }));
  const registration = new RegistrationService(new AccountRepository(database));
  const delivery = new RegistrationAdmission();
  const sender = new SmtpVerificationSender(mail);
  const sessions = new SessionService(
    new PostgresSessionRepository(database),
    registration,
  );
  const verification = new VerificationService(
    new PostgresVerificationRepository(database),
    registration,
    sender,
    (event) => logEvent({ event }),
    undefined,
    delivery,
  );
  const recovery = new RecoveryService(
    new PostgresRecoveryRepository(database),
    registration,
    sender,
    (event) => logEvent({ event }),
    delivery,
  );
  registration.setVerification(verification);
  const runtime = await createRuntime(
    config,
    database,
    logEvent,
    registration,
    sessions,
    verification,
    recovery,
  );
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
