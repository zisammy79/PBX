import { Module } from '@nestjs/common';
import { PstnController } from './pstn.controller.js';
import { PstnService } from './pstn.service.js';

@Module({
  controllers: [PstnController],
  providers: [PstnService],
  exports: [PstnService],
})
export class PstnModule {}
