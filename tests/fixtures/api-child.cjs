// This harness is outside the production entry point and exposes no test route.
const { readApiConfiguration } = require('../../apps/api/dist/configuration');
const { createRuntime } = require('../../apps/api/dist/runtime');
const { RegistrationService } = require('../../apps/api/dist/accounts/service');
const { VerificationService } = require('../../apps/api/dist/accounts/verification');
(async () => {
  const config = readApiConfiguration(process.env);
  let registration = process.argv.includes('registration')
    ? new RegistrationService(
        {
          create: async () => {
            throw Error('unexpected persistence');
          },
        },
        {
          hash: () => {
            process.send({ event: 'registration_started' });
            return new Promise(() => undefined);
          },
        },
      )
    : undefined;
  let verification;
  if (process.argv.includes('verification')) {
    registration = new RegistrationService({
      create: async () => ({ kind: 'existing' }),
    });
    verification = new VerificationService(
      {
        issue: async () => true,
        lookup: async () => undefined,
        confirm: async () => false,
      },
      registration,
      {
        send: () => {
          process.send({ event: 'verification_started' });
          return new Promise(() => undefined);
        },
      },
    );
  }
  const runtime = await createRuntime(
    config,
    {
      ready: () => {
        process.send({ event: 'probe_started' });
        return new Promise(() => undefined);
      },
      close: async () => undefined,
    },
    undefined,
    registration,
    undefined,
    verification,
  );
  await runtime.listen(0);
  process.send({ port: runtime.server.address().port });
  process.on('message', (message) => {
    if (message === 'close') void runtime.close().then((code) => process.exit(code));
  });
})().catch(() => process.exit(1));
