import { createConnection, isIP, type Socket } from 'node:net';
import { connect as connectTls, type ConnectionOptions } from 'node:tls';
import { createTransport } from 'nodemailer';
import type { SMTPTransportOptions } from 'nodemailer/lib/smtp-transport';
import { ConfigurationError, type Environment } from '@commerce/database';
import type { VerificationSender } from './verification';
import { accountMail } from './mail-content';
import type { RecoverySender } from './recovery';

interface WebLinkConfiguration {
  readonly webOrigin: string;
}
export interface CaptureMailConfiguration extends WebLinkConfiguration {
  readonly provider: 'capture';
  readonly host: string;
  readonly port: number;
}
export interface GmailMailConfiguration extends WebLinkConfiguration {
  readonly provider: 'gmail';
  readonly user: string;
  readonly appPassword: string;
}
export type MailConfiguration = CaptureMailConfiguration | GmailMailConfiguration;
export function readMailConfiguration(
  env: Environment,
  webOrigins: readonly string[],
): MailConfiguration {
  const development = env.NODE_ENV === 'development';
  const provider = env.MAIL_PROVIDER ?? 'gmail';
  if (provider !== 'gmail' && provider !== 'capture')
    throw new ConfigurationError('MAIL_PROVIDER');
  const webOrigin =
    env.VERIFICATION_WEB_ORIGIN ?? (development ? 'http://127.0.0.1:3000' : undefined);
  try {
    if (!webOrigin) throw new Error();
    const url = new URL(webOrigin);
    const loopback =
      url.hostname === 'localhost' ||
      url.hostname === '[::1]' ||
      (isIP(url.hostname) === 4 && /^127\./.test(url.hostname));
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== webOrigin ||
      !webOrigins.includes(webOrigin) ||
      (provider === 'capture' ? !loopback : !loopback && url.protocol !== 'https:')
    )
      throw new Error();
  } catch {
    throw new ConfigurationError('VERIFICATION_WEB_ORIGIN');
  }
  if (provider === 'gmail') {
    const user = env.GMAIL_SMTP_USER?.trim().toLowerCase();
    if (
      !user ||
      !/^[a-z0-9]+(?:\.?[a-z0-9]+)*@gmail\.com$/.test(user) ||
      user.length > 254
    )
      throw new ConfigurationError('GMAIL_SMTP_USER');
    const appPassword = env.GMAIL_SMTP_APP_PASSWORD?.replace(/ /g, '');
    if (!appPassword || !/^[a-z]{16}$/.test(appPassword))
      throw new ConfigurationError('GMAIL_SMTP_APP_PASSWORD');
    return Object.freeze({ provider, user, appPassword, webOrigin: webOrigin! });
  }
  const host = env.MAIL_SMTP_HOST ?? (development ? '127.0.0.1' : undefined);
  if (!host || !isIP(host) || !(host === '::1' || /^127\./.test(host)))
    throw new ConfigurationError('MAIL_SMTP_HOST');
  const rawPort = env.MAIL_SMTP_PORT ?? (development ? '1025' : undefined);
  const port = Number(rawPort);
  if (
    !rawPort ||
    !/^\d+$/.test(rawPort) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new ConfigurationError('MAIL_SMTP_PORT');
  return Object.freeze({ provider, host, port, webOrigin: webOrigin! });
}

// This seam lets owned TLS fixtures exercise the real SMTP protocol without
// changing the production endpoint, trust roots or environment configuration.
type TlsConnector = (options: ConnectionOptions) => Socket;
export class SmtpAccountSender implements VerificationSender, RecoverySender {
  constructor(
    private readonly config: MailConfiguration,
    private readonly tlsConnect: TlsConnector = connectTls,
  ) {}
  send(email: string, token: string): Promise<void> {
    return this.deliver(email, accountMail('verification', this.config.webOrigin, token));
  }
  sendRecovery(email: string, token: string): Promise<void> {
    return this.deliver(email, accountMail('recovery', this.config.webOrigin, token));
  }
  notifyReset(email: string): Promise<void> {
    return this.deliver(email, accountMail('notification', this.config.webOrigin));
  }
  private async deliver(
    email: string,
    message: ReturnType<typeof accountMail>,
  ): Promise<void> {
    let socket: Socket | undefined;
    let expired = false;
    const gmail = this.config.provider === 'gmail';
    const host = this.config.provider === 'capture' ? this.config.host : 'smtp.gmail.com';
    const port = this.config.provider === 'capture' ? this.config.port : 465;
    const tls: ConnectionOptions = {
      host,
      port,
      servername: 'smtp.gmail.com',
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
    };
    const options: SMTPTransportOptions = {
      host,
      port,
      secure: gmail,
      ignoreTLS: !gmail,
      opportunisticTLS: false,
      ...(this.config.provider === 'gmail'
        ? { auth: { user: this.config.user, pass: this.config.appPassword }, tls }
        : {}),
      logger: false,
      debug: false,
      pool: false,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      disableFileAccess: true,
      disableUrlAccess: true,
      maxRecipients: 1,
      name: 'commerce.local',
      getSocket: (_options, done) => {
        socket = gmail ? this.tlsConnect(tls) : createConnection({ host, port });
        let handedOff = false;
        socket.once('error', (error) => {
          if (!handedOff) {
            handedOff = true;
            done(error, false);
          }
        });
        socket.once(gmail ? 'secureConnect' : 'connect', () => {
          if (handedOff) return;
          handedOff = true;
          done(null, { connection: socket, secured: gmail });
        });
        if (expired) socket.destroy(new Error('Mail deadline exceeded'));
      },
    };
    const transporter = createTransport(options);
    const timer = setTimeout(() => {
      expired = true;
      socket?.destroy(new Error('Mail deadline exceeded'));
    }, 5000);
    try {
      const info = await transporter.sendMail({
        from: {
          name: 'Commerce',
          address:
            this.config.provider === 'gmail'
              ? this.config.user
              : 'no-reply@commerce.test',
        },
        to: email,
        ...message,
      });
      if (info.accepted.length !== 1 || info.rejected.length !== 0)
        throw new Error('Mail delivery failed');
    } catch {
      // Provider diagnostics can echo credentials, recipients or message details.
      throw new Error('Mail delivery failed');
    } finally {
      clearTimeout(timer);
      socket?.destroy();
      transporter.close();
    }
  }
}

export class SmtpVerificationSender extends SmtpAccountSender {}

export class LocalVerificationSender extends SmtpVerificationSender {
  constructor(config: Omit<CaptureMailConfiguration, 'provider'>) {
    super({ ...config, provider: 'capture' });
  }
}
