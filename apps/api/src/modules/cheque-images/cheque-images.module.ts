import { Module } from '@nestjs/common';

import { DuplicateDetectorService } from '../cheques/duplicate-detector.service';
import { ChequeImagesService } from './cheque-images.service';

@Module({
  providers: [ChequeImagesService, DuplicateDetectorService],
  exports: [ChequeImagesService],
})
export class ChequeImagesModule {}
