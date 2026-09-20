import { Body, Controller, Delete, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  forgetDeviceSchema,
  registerDeviceSchema,
  type ForgetDeviceInput,
  type RegisterDeviceInput,
} from '@cheque-flow/validation';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { RequestUser } from '../../common/types/request-user';
import { DevicesService } from './devices.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Register this phone for reminder notifications' })
  async register(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(registerDeviceSchema)) body: RegisterDeviceInput,
  ): Promise<void> {
    await this.devices.register(user, body.token, body.platform);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Stop sending reminders to this phone' })
  async forget(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(forgetDeviceSchema)) body: ForgetDeviceInput,
  ): Promise<void> {
    // A token that was never registered, or belongs to someone else, is not an
    // error: signing out must succeed either way.
    await this.devices.forget(user, body.token);
  }
}
