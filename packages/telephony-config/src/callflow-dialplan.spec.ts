import { describe, expect, it } from 'vitest';
import {
  appendInboundBlacklistChecks,
  appendTenantCallflowDialplan,
  buildCallflowDestinationMaps,
  emitMusiconholdConf,
  emitQueuesConf,
  resolveCallflowDestination,
  weektimeRulesToGotoIfTime,
} from './callflow-dialplan.js';
import type { TelephonyCallflowRecords } from './callflow.types.js';
import type { TelephonyTenantRecord } from './types.js';

const tenant: TelephonyTenantRecord = {
  tenantId: '11111111-1111-1111-1111-111111111111',
  slug: 'acme',
  asteriskContext: 't_acme',
  status: 'active',
};

const emptyCallflow = (): TelephonyCallflowRecords => ({
  ivrs: [],
  schedules: [],
  queues: [],
  ringGroups: [],
  featureCodes: [],
  blacklist: [],
  mohClasses: [],
});

describe('callflow dialplan emitters', () => {
  it('converts weektime rules to GotoIfTime clauses', () => {
    const clauses = weektimeRulesToGotoIfTime(
      [{ type: 'weektime', days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }],
      'UTC',
    );
    expect(clauses).toEqual([
      { dayRange: 'mon&tue&wed&thu&fri', timeRange: '0900-1700', timezone: 'UTC' },
    ]);
  });

  it('emits IVR playback, WaitExten, and digit Goto routes', () => {
    const ivrId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const extId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const callflow: TelephonyCallflowRecords = {
      ...emptyCallflow(),
      ivrs: [
        {
          tenantId: tenant.tenantId,
          tenantSlug: tenant.slug,
          asteriskContext: tenant.asteriskContext,
          ivrId,
          name: 'Main',
          greetingAudioKey: 'welcome_acme',
          timeoutSeconds: 8,
          maxRetries: 2,
          language: 'he',
          options: [{ digit: '1', destinationType: 'extension', destinationId: extId }],
        },
      ],
    };
    const maps = buildCallflowDestinationMaps(
      callflow,
      new Map([[extId, '1001']]),
    );
    const lines: string[] = [];
    appendTenantCallflowDialplan(lines, tenant, callflow, maps);
    const dialplan = lines.join('\n');
    expect(dialplan).toContain('[pbx_acme_ivr_aaaaaaaa]');
    expect(dialplan).toContain('Playback(welcome_acme)');
    expect(dialplan).toContain('WaitExten(8)');
    expect(dialplan).toContain('exten => 1,1,NoOp(IVR route digit 1)');
    expect(dialplan).toContain('Goto(t_acme,1001,1)');
  });

  it('emits schedule GotoIfTime for simple weektime rules', () => {
    const scheduleId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const extId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const callflow: TelephonyCallflowRecords = {
      ...emptyCallflow(),
      schedules: [
        {
          tenantId: tenant.tenantId,
          tenantSlug: tenant.slug,
          asteriskContext: tenant.asteriskContext,
          scheduleId,
          name: 'Business hours',
          timezone: 'UTC',
          scheduleType: 'weektime',
          rules: [{ type: 'weektime', days: [1], start: '09:00', end: '17:00' }],
          openDestinationType: 'extension',
          openDestinationId: extId,
          closedDestinationType: null,
          closedDestinationId: null,
        },
      ],
    };
    const maps = buildCallflowDestinationMaps(callflow, new Map([[extId, '1001']]));
    const lines: string[] = [];
    appendTenantCallflowDialplan(lines, tenant, callflow, maps);
    const dialplan = lines.join('\n');
    expect(dialplan).toContain('GotoIfTime(0900-1700,mon,*,UTC?t_acme,1001,1)');
  });

  it('emits Queue() dialplan and queues.conf members', () => {
    const queueId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const callflow: TelephonyCallflowRecords = {
      ...emptyCallflow(),
      queues: [
        {
          tenantId: tenant.tenantId,
          tenantSlug: tenant.slug,
          asteriskContext: tenant.asteriskContext,
          queueId,
          name: 'Support',
          asteriskQueueName: 'q_acme_support',
          strategy: 'rrmemory',
          maxWaitSeconds: 120,
          number: '8000',
          mohClassName: null,
          members: [
            {
              extensionId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
              extensionNumber: '1001',
              asteriskEndpointId: 'acme_ext_1001',
              penalty: 0,
            },
          ],
        },
      ],
    };
    const maps = buildCallflowDestinationMaps(callflow, new Map());
    const lines: string[] = [];
    appendTenantCallflowDialplan(lines, tenant, callflow, maps);
    expect(lines.join('\n')).toContain('Queue(q_acme_support,rrmemory,,,120)');

    const queuesConf = emitQueuesConf(callflow.queues);
    expect(queuesConf).toContain('[q_acme_support]');
    expect(queuesConf).toContain('strategy=rrmemory');
    expect(queuesConf).toContain('member=PJSIP/acme_ext_1001,0');
  });

  it('emits musiconhold classes and queue musiconhold binding', () => {
    const mohClassId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const mohClassName = 'pbx_acme_moh_ffffffff';
    const callflow: TelephonyCallflowRecords = {
      ...emptyCallflow(),
      mohClasses: [
        {
          tenantId: tenant.tenantId,
          tenantSlug: tenant.slug,
          mohClassId,
          name: 'Default hold',
          asteriskClassName: mohClassName,
          randomize: true,
          tracks: [{ fileName: 'hold.wav', storageKey: `${tenant.tenantId}/file.wav` }],
        },
      ],
      queues: [
        {
          tenantId: tenant.tenantId,
          tenantSlug: tenant.slug,
          asteriskContext: tenant.asteriskContext,
          queueId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          name: 'Support',
          asteriskQueueName: 'q_acme_support',
          strategy: 'ringall',
          maxWaitSeconds: 60,
          number: '8000',
          mohClassName,
          members: [],
        },
      ],
    };

    const mohConf = emitMusiconholdConf(callflow.mohClasses);
    expect(mohConf).toContain(`[${mohClassName}]`);
    expect(mohConf).toContain('sort=random');
    expect(mohConf).toContain('hold.wav');

    const queuesConf = emitQueuesConf(callflow.queues);
    expect(queuesConf).toContain(`musiconhold=${mohClassName}`);
  });

  it('emits simultaneous and sequential ring groups', () => {
    const ringGroupId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const callflow: TelephonyCallflowRecords = {
      ...emptyCallflow(),
      ringGroups: [
        {
          tenantId: tenant.tenantId,
          tenantSlug: tenant.slug,
          asteriskContext: tenant.asteriskContext,
          ringGroupId,
          name: 'Sales',
          strategy: 'simultaneous',
          timeoutSeconds: 25,
          members: [
            {
              extensionId: '1',
              extensionNumber: '1001',
              asteriskEndpointId: 'acme_ext_1001',
              priority: 1,
            },
            {
              extensionId: '2',
              extensionNumber: '1002',
              asteriskEndpointId: 'acme_ext_1002',
              priority: 2,
            },
          ],
        },
      ],
    };
    const lines: string[] = [];
    appendTenantCallflowDialplan(
      lines,
      tenant,
      callflow,
      buildCallflowDestinationMaps(callflow, new Map()),
    );
    expect(lines.join('\n')).toContain('Dial(PJSIP/acme_ext_1001&PJSIP/acme_ext_1002,25)');

    const sequentialCallflow: TelephonyCallflowRecords = {
      ...callflow,
      ringGroups: [{ ...callflow.ringGroups[0]!, strategy: 'sequential' }],
    };
    const seqLines: string[] = [];
    appendTenantCallflowDialplan(
      seqLines,
      tenant,
      sequentialCallflow,
      buildCallflowDestinationMaps(sequentialCallflow, new Map()),
    );
    expect(seqLines.join('\n')).toContain('Dial(PJSIP/acme_ext_1001,25,g)');
  });

  it('emits enabled feature code DND stub', () => {
    const callflow: TelephonyCallflowRecords = {
      ...emptyCallflow(),
      featureCodes: [
        {
          tenantId: tenant.tenantId,
          tenantSlug: tenant.slug,
          asteriskContext: tenant.asteriskContext,
          code: '*78',
          actionType: 'dnd',
          enabled: true,
        },
      ],
    };
    const lines: string[] = [];
    appendTenantCallflowDialplan(
      lines,
      tenant,
      callflow,
      buildCallflowDestinationMaps(callflow, new Map()),
    );
    const dialplan = lines.join('\n');
    expect(dialplan).toContain('[pbx_acme_features]');
    expect(dialplan).toContain('exten => *78,1,NoOp(PBX feature dnd)');
    expect(dialplan).toContain('Set(DND=${IF($["${DND}" = "1"]?0:1)})');
  });

  it('prepends inbound blacklist Hangup checks', () => {
    const inboundLines = [
      '[from-pstn-acme]',
      'exten => +15551212,1,NoOp(inbound)',
    ];
    appendInboundBlacklistChecks(inboundLines, 'acme', [
      { tenantId: tenant.tenantId, tenantSlug: 'acme', numberPattern: '+1555XXXX' },
    ]);
    expect(inboundLines.join('\n')).toContain('Hangup(21)');
    expect(inboundLines.join('\n')).toContain('_+1555XXXX');
  });

  it('resolves queue and voicemail destinations', () => {
    const queueId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const extId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const callflow: TelephonyCallflowRecords = {
      ...emptyCallflow(),
      queues: [
        {
          tenantId: tenant.tenantId,
          tenantSlug: tenant.slug,
          asteriskContext: tenant.asteriskContext,
          queueId,
          name: 'Support',
          asteriskQueueName: 'q_acme_support',
          strategy: 'ringall',
          maxWaitSeconds: 60,
          number: '8000',
          mohClassName: null,
          members: [],
        },
      ],
    };
    const maps = buildCallflowDestinationMaps(callflow, new Map([[extId, '1001']]));
    expect(
      resolveCallflowDestination(tenant, 'queue', queueId, maps),
    ).toEqual({ context: 'pbx_acme_queues', exten: '8000', priority: 1 });
    expect(
      resolveCallflowDestination(tenant, 'voicemail', extId, maps),
    ).toEqual({ context: 'pbx_acme_vm', exten: '1001', priority: 1 });
  });
});
