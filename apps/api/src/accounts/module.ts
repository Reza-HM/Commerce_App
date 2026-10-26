import {Body, Controller, Inject, Module, Post, Req, Res} from '@nestjs/common';
import type {DynamicModule} from '@nestjs/common';
import type {Request, Response} from 'express';
import type {RegistrationService} from './service';

const REGISTRATION = Symbol('registration');

@Controller('accounts')
class AccountsController {
  constructor(@Inject(REGISTRATION) private readonly registration: RegistrationService) {}

  @Post('register')
  async register(@Body() body: unknown, @Req() request: Request, @Res() response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    await this.registration.register(body, request.socket.remoteAddress ?? '[unknown]');
    if (!response.destroyed && !response.writableEnded) {
      response.status(202).json({status: 'accepted', message: 'Registration request processed.'});
    }
  }
}

@Module({})
export class AccountsModule {
  static register(service: RegistrationService): DynamicModule {
    return {module: AccountsModule, controllers: [AccountsController], providers: [{provide: REGISTRATION, useValue: service}]};
  }
}
