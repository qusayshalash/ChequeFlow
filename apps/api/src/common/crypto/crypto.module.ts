import { Global, Module } from '@nestjs/common';

import { FieldEncryptionService } from './field-encryption.service';

/**
 * Field-level encryption is needed by several feature modules (cheques, OCR
 * review, bank accounts), so it is provided globally rather than re-declared
 * in each of them.
 */
@Global()
@Module({
  providers: [FieldEncryptionService],
  exports: [FieldEncryptionService],
})
export class CryptoModule {}
