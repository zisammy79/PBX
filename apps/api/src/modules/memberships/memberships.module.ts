import { Module, forwardRef } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module.js';
import { InvitationsPublicController, MembershipsController } from './memberships.controller.js';
import { MembershipsService } from './memberships.service.js';

@Module({
  imports: [forwardRef(() => TenantsModule)],
  controllers: [MembershipsController, InvitationsPublicController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
