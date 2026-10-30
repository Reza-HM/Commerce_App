import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Module,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RegistrationService } from './service';
import { sessionToken } from './sessions';
import type { SessionService } from './sessions';
import type { VerificationService } from './verification';

const REGISTRATION = Symbol('registration');
const SESSIONS = Symbol('sessions');
const VERIFICATION = Symbol('verification');

@Controller('accounts/email-verification')
class VerificationController {
  constructor(@Inject(VERIFICATION) private readonly verification: VerificationService) {}
  @Post('request')
  async request(
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.verification.request(body, request.socket.remoteAddress ?? '[unknown]');
    if (!response.destroyed && !response.writableEnded)
      response
        .status(202)
        .json({ status: 'accepted', message: 'Verification request processed.' });
  }
  @Post('confirm')
  async confirm(
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    await this.verification.confirm(body, request.socket.remoteAddress ?? '[unknown]');
    if (!response.destroyed && !response.writableEnded)
      response.status(200).json({ status: 'verified' });
  }
}

@Controller('accounts')
class AccountsController {
  constructor(@Inject(REGISTRATION) private readonly registration: RegistrationService) {}

  @Post('register')
  async register(
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    await this.registration.register(body, request.socket.remoteAddress ?? '[unknown]');
    if (!response.destroyed && !response.writableEnded) {
      response
        .status(202)
        .json({ status: 'accepted', message: 'Registration request processed.' });
    }
  }
}

@Controller('accounts/sessions')
class SessionsController {
  constructor(@Inject(SESSIONS) private readonly sessions: SessionService) {}
  @Post()
  async signIn(
    @Body() body: unknown,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const { token, expires } = await this.sessions.signIn(
      body,
      request.socket.remoteAddress ?? '[unknown]',
    );
    if (!response.destroyed && !response.writableEnded) {
      response.cookie('__Host-commerce_session', token, {
        secure: true,
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        expires,
      });
      response.status(201).json({ status: 'signed_in' });
    }
  }
  @Get('current')
  async current(@Req() request: Request, @Res() response: Response) {
    const accountId = await this.sessions.current(sessionToken(request.headers.cookie));
    response.json({ status: 'signed_in', accountId });
  }
  @Delete('current')
  async signOut(@Req() request: Request, @Res() response: Response) {
    response.clearCookie('__Host-commerce_session', {
      secure: true,
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
    });
    await this.sessions.signOut(sessionToken(request.headers.cookie));
    response.status(204).end();
  }
}

@Module({})
export class AccountsModule {
  static register(
    service: RegistrationService,
    sessions?: SessionService,
    verification?: VerificationService,
  ): DynamicModule {
    return {
      module: AccountsModule,
      controllers: [
        AccountsController,
        ...(sessions ? [SessionsController] : []),
        ...(verification ? [VerificationController] : []),
      ],
      providers: [
        { provide: REGISTRATION, useValue: service },
        ...(sessions ? [{ provide: SESSIONS, useValue: sessions }] : []),
        ...(verification ? [{ provide: VERIFICATION, useValue: verification }] : []),
      ],
    };
  }
}
