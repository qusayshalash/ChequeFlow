import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Permission } from '@cheque-flow/shared-types';

import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { DiagnosticsService, type Diagnostics } from './diagnostics.service';

@ApiTags('diagnostics')
@ApiBearerAuth()
@Controller('diagnostics')
export class DiagnosticsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  @Get()
  // Behind a permission rather than public: it names which configuration is
  // missing, which is more than a stranger should learn about the deployment.
  @RequirePermissions(Permission.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Whether OCR, the database and storage are actually working' })
  collect(): Promise<Diagnostics> {
    return this.diagnostics.collect();
  }
}
