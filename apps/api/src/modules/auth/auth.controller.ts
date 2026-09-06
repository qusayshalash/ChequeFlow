import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import {
  loginSchema,
  logoutSchema,
  refreshSchema,
  type LoginInput,
  type LogoutInput,
  type RefreshInput,
} from '@cheque-flow/validation';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { AuthService, type RequestMeta } from './auth.service';
import { AuthTokensDto, MeResponseDto } from './auth.dto';

function metaFrom(request: Request): RequestMeta {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.header('user-agent')?.slice(0, 255) ?? null,
  };
}

/**
 * The two sign-in limits, read from the environment.
 *
 * Read here rather than through `AppConfigService` because a decorator is
 * evaluated when the module is imported, long before anything is injected.
 * They were literals — `10` and `30` — which silently overrode the `auth`
 * throttler the module builds from `RATE_LIMIT_AUTH_PER_MINUTE`, so raising
 * that variable in production did nothing at all and nobody could see why.
 *
 * The defaults are the previous literals, so nothing changes for a deployment
 * that sets neither.
 */
const perMinute = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const LOGIN_PER_MINUTE = perMinute('RATE_LIMIT_AUTH_PER_MINUTE', 10);
const REFRESH_PER_MINUTE = perMinute('RATE_LIMIT_REFRESH_PER_MINUTE', 30);

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Login is the most attacked endpoint: keep its own tight limit.
  @Throttle({ auth: { limit: LOGIN_PER_MINUTE, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body(zodBody(loginSchema)) body: LoginInput, @Req() request: Request) {
    return this.auth.login(body, metaFrom(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  // Higher than sign-in on purpose: several tabs can rotate a token at once,
  // and that is a signed-in user, not an attacker guessing passwords.
  @Throttle({ auth: { limit: REFRESH_PER_MINUTE, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rotate a refresh token' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  refresh(@Body(zodBody(refreshSchema)) body: RefreshInput, @Req() request: Request) {
    return this.auth.refresh(body.refreshToken, metaFrom(request));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session, or every session' })
  async logout(
    @Body(zodBody(logoutSchema)) body: LogoutInput,
    @CurrentUser() user: RequestUser,
    @Req() request: Request,
  ): Promise<void> {
    await this.auth.logout(
      user,
      {
        ...(body.refreshToken ? { refreshToken: body.refreshToken } : {}),
        allDevices: body.allDevices,
      },
      metaFrom(request),
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user with their live permissions' })
  @ApiResponse({ status: 200, type: MeResponseDto })
  me(@CurrentUser() user: RequestUser): RequestUser {
    return this.auth.me(user);
  }
}
