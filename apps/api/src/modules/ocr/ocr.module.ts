import { Module, forwardRef } from '@nestjs/common';

import type { OcrProvider } from '@cheque-flow/shared-types';

import { AppConfigService } from '../../config/app-config.service';
import { ChequesModule } from '../cheques/cheques.module';
import { createOcrProvider } from './ocr-provider.factory';
import { OcrService } from './ocr.service';
import { OCR_PROVIDER } from './ocr.tokens';

/**
 * The provider is chosen by configuration. Adding a real vendor means adding a
 * class that implements `OcrProvider` and one more case in the factory — no
 * application code changes.
 */
@Module({
  imports: [forwardRef(() => ChequesModule)],
  providers: [
    OcrService,
    {
      provide: OCR_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): OcrProvider =>
        createOcrProvider({
          provider: config.ocr.provider,
          isProduction: config.isProduction,
          mockLatencyMs: config.ocr.mockLatencyMs,
          mockSeed: config.ocr.mockSeed,
          anthropicApiKey: config.ocr.anthropicApiKey,
          claudeModel: config.ocr.claudeModel,
          claudeMaxTokens: config.ocr.claudeMaxTokens,
          googleKeyFile: config.ocr.googleKeyFile,
          googleApplicationCredentials: config.ocr.googleApplicationCredentials,
        }),
    },
  ],
  exports: [OcrService],
})
export class OcrModule {}
