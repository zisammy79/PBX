import { Module } from '@nestjs/common';
import { LocalRecordingStorageService } from '../../common/local-recording-storage.service.js';
import { ObjectStorageService } from '../../common/object-storage.service.js';
import { TenantTelephonySettingsService } from '../telephony/tenant-telephony-settings.service.js';
import { RecordingsController } from './recordings.controller.js';
import { RecordingsService } from './recordings.service.js';

@Module({
  controllers: [RecordingsController],
  providers: [
    RecordingsService,
    ObjectStorageService,
    LocalRecordingStorageService,
    TenantTelephonySettingsService,
  ],
  exports: [RecordingsService, LocalRecordingStorageService, TenantTelephonySettingsService],
})
export class RecordingsModule {}
