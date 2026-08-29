import { ApiProperty } from '@nestjs/swagger';

/**
 * Swagger-only DTOs. Runtime validation is done by the shared Zod schemas;
 * these classes exist purely so the OpenAPI document documents real shapes.
 */
export class AuthTokensDto {
  @ApiProperty({ description: 'Short lived JWT access token' })
  accessToken!: string;

  @ApiProperty({ description: 'Opaque rotating refresh token' })
  refreshToken!: string;

  @ApiProperty({ description: 'Access token lifetime in seconds', example: 900 })
  expiresIn!: number;

  @ApiProperty({ enum: ['Bearer'] })
  tokenType!: 'Bearer';
}

export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  organizationId!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  branchId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({ type: [String], example: ['cheque.view', 'cheque.create'] })
  permissions!: string[];
}

export class LoginBodyDto {
  @ApiProperty({ example: 'owner@chequeflow.local' })
  email!: string;

  @ApiProperty({ example: 'ChangeMe!Local1', format: 'password' })
  password!: string;
}

export class RefreshBodyDto {
  @ApiProperty()
  refreshToken!: string;
}
