import { Module, forwardRef } from '@nestjs/common';
import { RecordingsModule } from '../recordings/recordings.module.js';
import { TelephonyModule } from '../telephony/telephony.module.js';
import { ExtensionsController } from './extensions.controller.js';
import { ExtensionsService } from './extensions.service.js';

@Module({
  imports: [forwardRef(() => TelephonyModule), RecordingsModule],
  controllers: [ExtensionsController],
  providers: [ExtensionsService],
  exports: [ExtensionsService],
})
export class ExtensionsModule {}
