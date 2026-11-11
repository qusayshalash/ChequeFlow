import { Module } from '@nestjs/common';

import { ContactsModule } from '../contacts/contacts.module';
import { PublicStatementController } from './public-statement.controller';
import { StatementLinksController } from './statement-links.controller';
import { StatementLinksService } from './statement-links.service';

@Module({
  imports: [ContactsModule],
  controllers: [StatementLinksController, PublicStatementController],
  providers: [StatementLinksService],
})
export class StatementLinksModule {}
