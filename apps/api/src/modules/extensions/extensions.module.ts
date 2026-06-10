import { Module } from '@nestjs/common';
import { ExtensionsController } from './extensions.controller.js';
import { ExtensionsService } from './extensions.service.js';

@Module({
  controllers: [ExtensionsController],
  providers: [ExtensionsService],
  exports: [ExtensionsService],
})
export class ExtensionsModule {}
