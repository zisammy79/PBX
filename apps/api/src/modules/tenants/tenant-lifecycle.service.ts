import { Injectable } from '@nestjs/common';
import {
  ALLOWED_LIFECYCLE_TRANSITIONS,
  type TenantLifecycleStatus,
  validationError,
} from '@pbx/contracts';

@Injectable()
export class TenantLifecycleService {
  assertTransition(from: TenantLifecycleStatus, to: TenantLifecycleStatus): void {
    if (from === to) {
      return;
    }
    const allowed = ALLOWED_LIFECYCLE_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw validationError({
        status: `Invalid lifecycle transition from ${from} to ${to}`,
        allowed: allowed.join(', ') || 'none',
      });
    }
  }
}
