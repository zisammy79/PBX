import { Module } from '@nestjs/common';
import { CloudStorageService } from './cloud-storage.service.js';
import { PlatformCloudStorageController } from './platform-cloud-storage.controller.js';
import { TenantCloudStorageController } from './tenant-cloud-storage.controller.js';

@Module({
  controllers: [PlatformCloudStorageController, TenantCloudStorageController],
  providers: [CloudStorageService],
  exports: [CloudStorageService],
})
export class CloudStorageModule {}
