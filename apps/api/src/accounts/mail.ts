import { createConnection, isIP, type Socket } from 'node:net';
import { createTransport } from 'nodemailer';
import type { SMTPTransportOptions } from 'nodemailer/lib/smtp-transport';
import { ConfigurationError, type Environment } from '@commerce/database';
import type { VerificationSender } from './verification';

export interface MailConfiguration {
  readonly host: string;
  readonly port: number;
  readonly webOrigin: string;
}
export function readMailConfiguration(
  env: Environment,
  webOrigins: readonly string[],
): MailConfiguration {
  const development = env.NODE_ENV === 'development';
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
  const webOrigin =
    env.VERIFICATION_WEB_ORIGIN ?? (development ? 'http://127.0.0.1:3000' : undefined);
  try {
    if (!webOrigin) throw new Error();
    const url = new URL(webOrigin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== webOrigin ||
      !webOrigins.includes(webOrigin) ||
      !(
        url.hostname === 'localhost' ||
        url.hostname === '[::1]' ||
        (isIP(url.hostname) === 4 && /^127\./.test(url.hostname))
      )
    )
      throw new Error();
  } catch {
    throw new ConfigurationError('VERIFICATION_WEB_ORIGIN');
  }
  return Object.freeze({ host, port, webOrigin: webOrigin! });
}

export class LocalVerificationSender implements VerificationSender {
  constructor(private readonly config: MailConfiguration) {}
  async send(email: string, token: string): Promise<void> {
    let socket: Socket | undefined;
    let expired = false;
    const options: SMTPTransportOptions = {
      host: this.config.host,
      port: this.config.port,
      secure: false,
      ignoreTLS: true,
      logger: false,
      debug: false,
      pool: false,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
      disableFileAccess: true,
      disableUrlAccess: true,
      getSocket: (_options, done) => {
        socket = createConnection({ host: this.config.host, port: this.config.port });
        let handedOff = false;
        socket.once('error', (error) => {
          if (!handedOff) {
            handedOff = true;
            done(error, false);
          }
        });
        socket.once('connect', () => {
          if (handedOff) return;
          handedOff = true;
          done(null, { connection: socket });
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
      await transporter.sendMail({
        from: 'Commerce <no-reply@commerce.test>',
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
    } finally {
      clearTimeout(timer);
      socket?.destroy();
      transporter.close();
    }
  }
}
