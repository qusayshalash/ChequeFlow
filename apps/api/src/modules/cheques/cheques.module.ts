import { Module, forwardRef } from '@nestjs/common';

import { ChequeImagesModule } from '../cheque-images/cheque-images.module';
import { RemindersModule } from '../reminders/reminders.module';
import { OcrModule } from '../ocr/ocr.module';
import { ChequeActionsService } from './cheque-actions.service';
import { ChequeController } from './cheque.controller';
import { ChequeService } from './cheque.service';
import { DuplicateDetectorService } from './duplicate-detector.service';

@Module({
  imports: [RemindersModule, ChequeImagesModule, forwardRef(() => OcrModule)],
  controllers: [ChequeController],
  providers: [ChequeService, ChequeActionsService, DuplicateDetectorService],
  exports: [ChequeService, ChequeActionsService, DuplicateDetectorService],
})
export class ChequesModule {}
