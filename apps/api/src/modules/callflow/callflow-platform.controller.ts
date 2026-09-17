import { Body, Controller, Get, Inject, Post, Put, Req } from '@nestjs/common';
import {
  CreatePlatformHolidayTemplateSchema,
  Permission,
  PutPlatformLocalePacksSchema,
} from '@pbx/contracts';
import type { RequestWithUser } from '../../common/guards/auth.guard.js';
import { RequirePermissions } from '../../common/guards/auth.guard.js';
import { CallflowService } from './callflow.service.js';

@Controller('platform/catalogs')
export class CallflowPlatformController {
  constructor(@Inject(CallflowService) private readonly callflowService: CallflowService) {}

  @Get('locale-packs')
  @RequirePermissions(Permission.PLATFORM_CATALOG_MANAGE)
  listLocalePacks(@Req() req: RequestWithUser) {
    return this.callflowService.listPlatformLocalePacks(req.user!);
  }

  @Put('locale-packs')
  @RequirePermissions(Permission.PLATFORM_CATALOG_MANAGE)
  putLocalePacks(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = PutPlatformLocalePacksSchema.parse(body);
    return this.callflowService.putPlatformLocalePacks(req.user!, parsed.items);
  }

  @Get('holiday-templates')
  @RequirePermissions(Permission.PLATFORM_CATALOG_MANAGE)
  listHolidayTemplates(@Req() req: RequestWithUser) {
    return this.callflowService.listPlatformHolidayTemplates(req.user!);
  }

  @Post('holiday-templates')
  @RequirePermissions(Permission.PLATFORM_CATALOG_MANAGE)
  createHolidayTemplate(@Req() req: RequestWithUser, @Body() body: unknown) {
    return this.callflowService.createPlatformHolidayTemplate(
      req.user!,
      CreatePlatformHolidayTemplateSchema.parse(body),
    );
  }
}
