import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

@Module({
  // Secrets are passed per sign/verify call so access and refresh secrets can
  // never be confused with one another.
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TokenService, SessionService],
  // JwtModule and SessionService are re-exported because the global
  // JwtAuthGuard (registered in AppModule) depends on both.
  exports: [AuthService, TokenService, SessionService, JwtModule],
})
export class AuthModule {}
