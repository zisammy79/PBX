import { Inject, Injectable } from '@nestjs/common';
import { notFound, tenantAccessDenied, validationError } from '@pbx/contracts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { and, eq } from 'drizzle-orm';
import { auditEvents, extensions, sipDevices, withTenantContext } from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';

const execFileAsync = promisify(execFile);

@Injectable()
export class PeersService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async unregisterPeer(actor: AuthenticatedUser, tenantId: string, endpointId: string) {
    await this.assertTenantAccess(actor, tenantId);
    if (!this.config.telephonyEnabled) {
      throw validationError({ telephony: 'Telephony is not enabled' });
    }

    const owned = await withTenantContext(this.database.db, tenantId, async (db) => {
      const [extension] = await db
        .select({ id: extensions.id, extensionNumber: extensions.extensionNumber })
        .from(extensions)
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.asteriskEndpointId, endpointId)))
        .limit(1);
      if (extension) {
        return { extensionId: extension.id, extensionNumber: extension.extensionNumber };
      }

      const [device] = await db
        .select({ id: sipDevices.id, extensionId: sipDevices.extensionId })
        .from(sipDevices)
        .where(and(eq(sipDevices.tenantId, tenantId), eq(sipDevices.asteriskEndpointId, endpointId)))
        .limit(1);
      if (device) {
        const [ext] = await db
          .select({ id: extensions.id, extensionNumber: extensions.extensionNumber })
          .from(extensions)
          .where(and(eq(extensions.tenantId, tenantId), eq(extensions.id, device.extensionId)))
          .limit(1);
        if (ext) {
          return { extensionId: ext.id, extensionNumber: ext.extensionNumber };
        }
      }

      return null;
    });

    if (!owned) {
      throw notFound('Peer endpoint');
    }

    const command = await this.sendPjsipUnregister(endpointId);

    await withTenantContext(this.database.db, tenantId, async (db) => {
      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'peer.unregister',
        resourceType: 'sip_endpoint',
        resourceId: owned.extensionId,
        metadata: {
          endpointId,
          extensionNumber: owned.extensionNumber,
          command,
        },
      });
    });

    return {
      endpointId,
      extensionId: owned.extensionId,
      extensionNumber: owned.extensionNumber,
      unregistered: true,
      command,
    };
  }

  private async sendPjsipUnregister(endpointId: string): Promise<string> {
    if (!/^[a-zA-Z0-9_-]+$/.test(endpointId)) {
      throw validationError({ endpointId: 'Invalid endpoint identifier' });
    }

    const cliCommand = `pjsip send unregister ${endpointId}`;

    try {
      const { stdout, stderr } = await execFileAsync(
        'docker',
        ['exec', this.config.asteriskContainer, 'asterisk', '-rx', cliCommand],
        { timeout: 15_000 },
      );
      const output = `${stdout}${stderr}`.trim();
      if (/Unable to find|No such|Invalid|error/i.test(output)) {
        throw validationError({ asterisk: output || 'Unregister failed' });
      }
      return cliCommand;
    } catch (err) {
      if (err && typeof err === 'object' && 'details' in err) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Unregister failed';
      throw validationError({ asterisk: message });
    }
  }

  private async assertTenantAccess(actor: AuthenticatedUser, tenantId: string) {
    const isMember = actor.tenantMemberships.some((m) => m.tenantId === tenantId);
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    const isSupport = actor.supportSession?.tenantId === tenantId;
    if (!isMember && !isPlatform && !isSupport) {
      throw tenantAccessDenied();
    }
  }
}
