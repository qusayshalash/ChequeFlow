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

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Login is the most attacked endpoint: keep its own tight limit.
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body(zodBody(loginSchema)) body: LoginInput, @Req() request: Request) {
    return this.auth.login(body, metaFrom(request));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ auth: { limit: 30, ttl: 60_000 } })
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
