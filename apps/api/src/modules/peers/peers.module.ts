import { Module } from '@nestjs/common';
import { PeersController } from './peers.controller.js';
import { PeersService } from './peers.service.js';

@Module({
  controllers: [PeersController],
  providers: [PeersService],
  exports: [PeersService],
})
export class PeersModule {}
