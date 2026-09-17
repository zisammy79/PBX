import { Module } from '@nestjs/common';
import { LocalMediaStorageService } from '../../common/local-media-storage.service.js';
import { LocalRecordingStorageService } from '../../common/local-recording-storage.service.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { CallflowController } from './callflow.controller.js';
import { CallflowPlatformController } from './callflow-platform.controller.js';
import { CallflowService } from './callflow.service.js';
import { CampaignDialerService } from './campaign-dialer.service.js';
import { CampaignOriginateService } from './campaign-originate.service.js';

@Module({
  imports: [TenantsModule],
  controllers: [CallflowController, CallflowPlatformController],
  providers: [
    CallflowService,
    CampaignDialerService,
    CampaignOriginateService,
    LocalMediaStorageService,
    LocalRecordingStorageService,
  ],
  exports: [CallflowService],
})
export class CallflowModule {}
