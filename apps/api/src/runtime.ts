import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createServer, Server } from 'node:http';
import type { Socket } from 'node:net';
import { Catch, Controller, Get, Inject, Module, Res } from '@nestjs/common';
import type {
  ArgumentsHost,
  ExceptionFilter,
  NestApplicationOptions,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { ApiConfiguration } from './configuration';
import { logEvent } from './logging';
import { AccountsModule } from './accounts/module';
import type { RegistrationService } from './accounts/service';
import { RegistrationValidationError } from './accounts/validation';
import { RegistrationRejection } from './accounts/admission';
import { SessionError } from './accounts/sessions';
import type { SessionService } from './accounts/sessions';

export interface Resources {
  ready(): Promise<boolean>;
  close(): Promise<void>;
}
export type OperationalEvent = Readonly<Record<string, string | number>>;
export type Log = (event: OperationalEvent) => void;
const RESOURCE = Symbol('database');
const STATE = Symbol('lifecycle');

@Controller('health')
class HealthController {
  constructor(
    @Inject(RESOURCE) private readonly database: Resources,
    @Inject(STATE) private readonly state: { closing: boolean },
  ) {}
  @Get('live') live(@Res() response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    response.json({ status: 'ok' });
  }
  @Get('ready') async ready(@Res() response: Response) {
    const ready =
      !this.state.closing && (await this.database.ready()) && !this.state.closing;
    response.setHeader('Cache-Control', 'no-store');
    response.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable' });
  }
}

function safeError(response: Response, status: number) {
  response.setHeader('Cache-Control', 'no-store');
  if (status === 503) response.setHeader('Retry-After', '1');
  response.status(status).json({
    error: status === 500 ? 'internal_error' : `http_${status}`,
    message: status === 500 ? 'Internal server error' : 'Request rejected',
    requestId: response.getHeader('X-Request-Id'),
  });
}

@Catch()
class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof RegistrationValidationError) {
      response.setHeader('Cache-Control', 'no-store');
      response.status(400).json({
        error: 'invalid_registration',
        message: 'Invalid registration request',
        field: error.field,
        code: error.code,
        requestId: response.getHeader('X-Request-Id'),
      });
      return;
    }
    if (error instanceof RegistrationRejection) {
      response.setHeader('Retry-After', String(error.retryAfter));
      safeError(response, error.status);
      return;
    }
    if (error instanceof SessionError) {
      if (error.status === 401) {
        response.setHeader('Cache-Control', 'no-store');
        response.status(401).json({
          error: 'invalid_credentials',
          message: 'Request rejected',
          requestId: response.getHeader('X-Request-Id'),
        });
      } else safeError(response, error.status);
      return;
    }
    const status =
      error &&
      typeof error === 'object' &&
      'getStatus' in error &&
      typeof error.getStatus === 'function'
        ? (error.getStatus() as number)
        : 500;
    safeError(response, [400, 404, 413, 415].includes(status) ? status : 500);
  }
}

class LimitedAdapter extends ExpressAdapter {
  constructor(private readonly config: ApiConfiguration) {
    super(express());
  }
  override initHttpServer(_options: NestApplicationOptions) {
    void _options;
    this.setHttpServer(
      createServer(
        {
          maxHeaderSize: this.config.headerLimitBytes,
          headersTimeout: this.config.headerTimeoutMs,
          requestTimeout: this.config.requestTimeoutMs,
          // Node checks receive deadlines periodically, rather than per chunk.
          connectionsCheckingInterval: Math.min(100, this.config.headerTimeoutMs),
        },
        this.getInstance(),
      ),
    );
  }
}

export async function createRuntime(
  config: ApiConfiguration,
  database: Resources,
  log: Log = logEvent,
  registration?: RegistrationService,
  sessions?: SessionService,
) {
  const state = { closing: false };
  @Module({
    imports: registration ? [AccountsModule.register(registration, sessions)] : [],
    controllers: [HealthController],
    providers: [
      { provide: RESOURCE, useValue: database },
      { provide: STATE, useValue: state },
    ],
  })
  class RuntimeModule {}
  const adapter = new LimitedAdapter(config);
  const app = await NestFactory.create(RuntimeModule, adapter, {
    logger: false,
    bodyParser: false,
    abortOnError: false,
  });
  const instance = adapter.getInstance() as ReturnType<typeof express>;
  instance.disable('x-powered-by');
  instance.set('trust proxy', false);
  app.use((request: Request, response: Response, next: NextFunction) => {
    const id = randomUUID(),
      started = performance.now();
    response.setHeader('X-Request-Id', id);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // Log static route names only, including Express's case/trailing-slash aliases.
    const isRegistration = /^\/accounts\/register\/?$/i.test(request.path);
    const isSession = /^\/accounts\/sessions(?:\/current)?\/?$/i.test(request.path);
    const path = isRegistration
      ? '/accounts/register'
      : isSession
        ? '/accounts/sessions'
        : ['/health/live', '/health/ready'].includes(request.path)
          ? request.path
          : '[unmatched]';
    if (isRegistration || isSession) response.setHeader('Cache-Control', 'no-store');
    response.once('finish', () =>
      log({
        event: 'request_complete',
        requestId: id,
        method: request.method,
        path,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - started),
      }),
    );
    if (
      state.closing &&
      request.path !== '/health/live' &&
      request.path !== '/health/ready'
    ) {
      safeError(response, 503);
      return;
    }
    const origin = request.headers.origin;
    if (origin && config.webOrigins.includes(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Vary', 'Origin');
      response.setHeader(
        'Access-Control-Allow-Methods',
        isSession ? 'GET,POST,DELETE,OPTIONS' : 'GET,POST,OPTIONS',
      );
      response.setHeader(
        'Access-Control-Allow-Headers',
        isSession ? 'Content-Type,X-Commerce-Request' : 'Content-Type',
      );
      if (isSession) response.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (
      isSession &&
      request.method !== 'OPTIONS' &&
      ((origin && !config.webOrigins.includes(origin)) ||
        request.headers['x-commerce-request'] !== '1')
    ) {
      safeError(response, 403);
      return;
    }
    const hasBody =
      Boolean(request.headers['transfer-encoding']) ||
      Number(request.headers['content-length'] ?? 0) > 0;
    if (
      hasBody &&
      request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !==
        'application/json'
    ) {
      safeError(response, 415);
      return;
    }
    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: config.bodyLimitBytes, inflate: false }));
  app.use(
    (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      void _next;
      const status =
        error && typeof error === 'object' && 'status' in error ? error.status : 400;
      safeError(response, status === 413 ? 413 : status === 415 ? 415 : 400);
    },
  );
  app.useGlobalFilters(new SafeExceptionFilter());
  await app.init();
  const server = app.getHttpServer() as Server;
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  let shutdown: Promise<number> | undefined;
  let resourcesClosed: Promise<void> | undefined;
  const closeResources = () => (resourcesClosed ??= database.close());
  return {
    server,
    async listen(port = config.port) {
      await app.listen(port, '127.0.0.1');
      log({ event: 'startup', port: (server.address() as { port: number }).port });
    },
    close(): Promise<number> {
      if (shutdown) return shutdown;
      state.closing = true;
      log({ event: 'shutdown_started' });
      registration?.stop();
      shutdown = new Promise<number>((resolve) => {
        let done = false;
        const finish = (code: number) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          log({ event: 'shutdown_complete', code });
          resolve(code);
        };
        const timer = setTimeout(() => {
          for (const socket of sockets) socket.destroy();
          void closeResources().catch(() => undefined);
          finish(1);
        }, config.shutdownTimeoutMs);
        // Close ingress, drain established work, then close pool exactly once.
        server.close(() => {
          void (registration?.drain() ?? Promise.resolve())
            .then(() => app.close())
            .then(() => closeResources())
            .then(
              () => finish(0),
              () => finish(1),
            );
        });
        server.closeIdleConnections();
      });
      return shutdown;
    },
  };
}
