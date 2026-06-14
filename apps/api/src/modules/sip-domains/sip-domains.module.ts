import { Module } from '@nestjs/common';
import { SipDomainsController } from './sip-domains.controller.js';
import { SipDomainsService } from './sip-domains.service.js';

@Module({
  controllers: [SipDomainsController],
  providers: [SipDomainsService],
  exports: [SipDomainsService],
})
export class SipDomainsModule {}
