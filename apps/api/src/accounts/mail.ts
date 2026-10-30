import { createConnection, isIP, type Socket } from 'node:net';
import { connect as connectTls, type ConnectionOptions } from 'node:tls';
import { createTransport } from 'nodemailer';
import type { SMTPTransportOptions } from 'nodemailer/lib/smtp-transport';
import { ConfigurationError, type Environment } from '@commerce/database';
import type { VerificationSender } from './verification';

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
export class SmtpVerificationSender implements VerificationSender {
  constructor(
    private readonly config: MailConfiguration,
    private readonly tlsConnect: TlsConnector = connectTls,
  ) {}
  async send(email: string, token: string): Promise<void> {
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
    const url = `${this.config.webOrigin}/verify-email#token=${token}`;
    const text = `Confirm your Commerce email\n\nOpen this link and confirm with your registered Commerce password:\n${url}\n\nThis link expires in 30 minutes. It does not sign you in or change your password. If you did not request it, ignore this email.`;
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
        subject: 'Confirm your Commerce email',
        text,
        // Mail clients cannot load the application's Tailwind bundle. Keep email
        // presentation self-contained, with no external fonts, images or tracking.
        html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><style>
          @media(prefers-color-scheme:dark){.mail-body{background:#171e2e!important}.mail-card{background:#202a3d!important;border-color:#354159!important}.mail-text{color:#f1f4ff!important}.mail-muted{color:#b8c7e9!important}.mail-brand{color:#a9baff!important}}
          </style></head><body class="mail-body" style="margin:0;background:#f2f5fc;font-family:Arial,Helvetica,sans-serif;padding:32px 16px;color:#172033">
          <table role="presentation" style="width:100%;max-width:560px;margin:0 auto"><tr><td class="mail-brand" style="padding:8px 8px 24px;font-size:23px;font-weight:700;letter-spacing:-1px;color:#3555e8">commerce.</td></tr><tr><td class="mail-card" style="padding:32px 24px;background:#fff;border:1px solid #dce2ef;border-radius:20px">
          <p class="mail-brand" style="margin:0 0 20px;font-size:11px;font-weight:700;letter-spacing:2px;color:#3555e8">YOUR COMMERCE ACCOUNT</p>
          <h1 class="mail-text" style="margin:0 0 20px;font-size:30px;line-height:1.2;letter-spacing:-1px;color:#172033">Confirm your email.</h1>
          <p class="mail-muted" style="margin:0 0 28px;font-size:15px;line-height:1.8;color:#52617c">One last step. Open the link below and confirm with your registered Commerce password.</p>
          <p style="margin:0 0 28px"><a href="${url}" style="display:inline-block;padding:16px 22px;background:#3555e8;border-radius:12px;color:#fff;font-size:14px;font-weight:700;text-decoration:none">Confirm email address</a></p>
          <p class="mail-muted" style="margin:0;font-size:13px;line-height:1.8;color:#52617c">This link expires in 30 minutes. It does not change your password or sign you in.</p>
          </td></tr><tr><td class="mail-muted" style="padding:20px 8px;font-size:12px;line-height:1.8;color:#52617c">If you did not request this email, you can ignore it.<br>Commerce. Thoughtfully built.</td></tr></table></body></html>`,
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

export class LocalVerificationSender extends SmtpVerificationSender {
  constructor(config: Omit<CaptureMailConfiguration, 'provider'>) {
    super({ ...config, provider: 'capture' });
  }
}
