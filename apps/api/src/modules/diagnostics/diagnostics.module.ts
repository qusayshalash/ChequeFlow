import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module';
import { DiagnosticsController } from './diagnostics.controller';
import { DiagnosticsService } from './diagnostics.service';

@Module({
  imports: [StorageModule],
  controllers: [DiagnosticsController],
  providers: [DiagnosticsService],
})
export class DiagnosticsModule {}
