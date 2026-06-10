import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { ChangePasswordRequestSchema, LoginRequestSchema } from '@pbx/contracts';
import { Public, type RequestWithUser } from '../../common/guards/auth.guard.js';
import { AuthService } from './auth.service.js';
import { RateLimitService } from '../../common/services/rate-limit.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(RateLimitService) private readonly rateLimits: RateLimitService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() body: unknown) {
    const parsed = LoginRequestSchema.parse(body);
    await this.rateLimits.enforce(`auth:login:${parsed.email.toLowerCase()}`, 10, 300);
    const result = await this.authService.login(parsed.email, parsed.password);
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        platformRoles: result.user.platformRoles,
        tenantMemberships: result.user.tenantMemberships,
      },
      mustChangePassword: result.mustChangePassword,
      ...result.tokens,
    };
  }

  @Post('change-password')
  async changePassword(@Req() req: RequestWithUser, @Body() body: unknown) {
    const parsed = ChangePasswordRequestSchema.parse(body);
    await this.authService.changePassword(
      req.user!.id,
      parsed.currentPassword,
      parsed.newPassword,
    );
    return { success: true };
  }

  @Get('me')
  async me(@Req() req: RequestWithUser) {
    const user = req.user!;
    return {
      id: user.id,
      email: user.email,
      platformRoles: user.platformRoles,
      tenantMemberships: user.tenantMemberships,
      supportSession: user.supportSession ?? null,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
