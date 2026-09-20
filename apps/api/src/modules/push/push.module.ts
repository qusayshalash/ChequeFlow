import { Module } from '@nestjs/common';

import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { ExpoPushService } from './expo-push.service';
import { ReminderDispatchService } from './reminder-dispatch.service';

/**
 * Delivering a reminder to a phone.
 *
 * Separate from the reminders module, which decides *when* someone should be
 * told. This one only knows how to reach them, which is why a phone that never
 * registers changes nothing about the feed.
 */
@Module({
  controllers: [DevicesController],
  providers: [DevicesService, ExpoPushService, ReminderDispatchService],
  exports: [DevicesService],
})
export class PushModule {}
