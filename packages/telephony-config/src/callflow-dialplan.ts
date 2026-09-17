import type { WeektimeRule } from '@pbx/shared';
import type {
  DestinationResolution,
  TelephonyBlacklistRecord,
  TelephonyBusinessScheduleRecord,
  TelephonyCallflowRecords,
  TelephonyFeatureCodeRecord,
  TelephonyIvrRecord,
  TelephonyMohClassRecord,
  TelephonyQueueRecord,
  TelephonyRingGroupRecord,
} from './callflow.types.js';
import type { TelephonyTenantRecord } from './types.js';

const ASTERISK_DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function assertSafeIdentifier(value: string, label: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function assertDialplanPattern(value: string, label: string): void {
  if (!/^[0-9*#+_.A-Za-z\[\]-]+$/.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
}

function shortId(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 8);
}

export function mohClassAsteriskName(tenantSlug: string, mohClassId: string): string {
  return `pbx_${tenantSlug}_moh_${shortId(mohClassId)}`;
}

export function mohClassMediaDirectory(tenantSlug: string, mohClassId: string): string {
  return `/var/lib/pbx/callflow-media/${tenantSlug}/moh/${shortId(mohClassId)}`;
}

function ivrContext(tenantSlug: string, ivrId: string): string {
  return `pbx_${tenantSlug}_ivr_${shortId(ivrId)}`;
}

function scheduleContext(tenantSlug: string, scheduleId: string): string {
  return `pbx_${tenantSlug}_sched_${shortId(scheduleId)}`;
}

function ringGroupContext(tenantSlug: string, ringGroupId: string): string {
  return `pbx_${tenantSlug}_ring_${shortId(ringGroupId)}`;
}

function queueContext(tenantSlug: string): string {
  return `pbx_${tenantSlug}_queues`;
}

function featureContext(tenantSlug: string): string {
  return `pbx_${tenantSlug}_features`;
}

function voicemailContext(tenantSlug: string): string {
  return `pbx_${tenantSlug}_vm`;
}

function parseTimeToHm(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`;
}

function formatAsteriskDayRange(days: number[]): string | null {
  const sorted = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  if (sorted.length === 7) return '*';
  return sorted.map((d) => ASTERISK_DOW[d]).join('&');
}

export function weektimeRulesToGotoIfTime(
  rules: unknown[],
  timezone: string,
): Array<{ timeRange: string; dayRange: string; timezone: string }> {
  const clauses: Array<{ timeRange: string; dayRange: string; timezone: string }> = [];
  if (!Array.isArray(rules)) return clauses;

  for (const raw of rules) {
    if (!raw || typeof raw !== 'object') continue;
    const rule = raw as WeektimeRule;
    if (rule.type && rule.type !== 'weektime') continue;

    const days = rule.days ?? (rule.dayOfWeek !== undefined ? [rule.dayOfWeek] : undefined);
    const startRaw = rule.start ?? rule.startTime;
    const endRaw = rule.end ?? rule.endTime;
    if (!days || !startRaw || !endRaw) continue;

    const dayRange = formatAsteriskDayRange(days);
    const start = parseTimeToHm(startRaw);
    const end = parseTimeToHm(endRaw);
    if (!dayRange || !start || !end) continue;

    clauses.push({
      dayRange,
      timeRange: `${start}-${end}`,
      timezone,
    });
  }

  return clauses;
}

export interface CallflowDestinationMaps {
  extensionNumbers: Map<string, string>;
  queueById: Map<string, { asteriskQueueName: string; number: string | null }>;
  ringGroupIds: Set<string>;
  ivrIds: Set<string>;
  scheduleIds: Set<string>;
}

export function resolveCallflowDestination(
  tenant: TelephonyTenantRecord,
  destinationType: string | null | undefined,
  destinationId: string | null | undefined,
  maps: CallflowDestinationMaps,
): DestinationResolution | null {
  if (!destinationType || !destinationId) return null;

  switch (destinationType) {
    case 'extension': {
      const exten = maps.extensionNumbers.get(destinationId);
      if (!exten) return null;
      return { context: tenant.asteriskContext, exten, priority: 1 };
    }
    case 'queue': {
      const queue = maps.queueById.get(destinationId);
      if (!queue) return null;
      const exten = queue.number ?? queue.asteriskQueueName;
      return { context: queueContext(tenant.slug), exten, priority: 1 };
    }
    case 'ring_group':
    case 'hunt_group': {
      if (!maps.ringGroupIds.has(destinationId)) return null;
      return {
        context: ringGroupContext(tenant.slug, destinationId),
        exten: 's',
        priority: 1,
      };
    }
    case 'ivr': {
      if (!maps.ivrIds.has(destinationId)) return null;
      return { context: ivrContext(tenant.slug, destinationId), exten: 's', priority: 1 };
    }
    case 'schedule': {
      if (!maps.scheduleIds.has(destinationId)) return null;
      return {
        context: scheduleContext(tenant.slug, destinationId),
        exten: 's',
        priority: 1,
      };
    }
    case 'voicemail': {
      const exten = maps.extensionNumbers.get(destinationId);
      if (!exten) return null;
      return { context: voicemailContext(tenant.slug), exten, priority: 1 };
    }
    default:
      return null;
  }
}

function appendGoto(lines: string[], dest: DestinationResolution): void {
  lines.push(` same => n,Goto(${dest.context},${dest.exten},${dest.priority})`);
}

function emitVoicemailStub(lines: string[], tenantSlug: string): void {
  lines.push(
    '',
    `[${voicemailContext(tenantSlug)}]`,
    '; Voicemail stub — controller-owned retrieval/leave flow pending',
    'exten => _X.,1,NoOp(PBX voicemail stub ${EXTEN} tenant ' + tenantSlug + ')',
    ' same => n,Stasis(pbx-platform,' + tenantSlug + ',${CALLERID(num)},vm,${EXTEN})',
    ' same => n,Hangup()',
  );
}

function emitIvrContext(
  lines: string[],
  ivr: TelephonyIvrRecord,
  maps: CallflowDestinationMaps,
  tenant: TelephonyTenantRecord,
): void {
  const ctx = ivrContext(tenant.slug, ivr.ivrId);
  assertSafeIdentifier(ctx, 'ivr context');
  lines.push('', `[${ctx}]`, `exten => s,1,NoOp(PBX IVR ${ivr.name})`);

  if (ivr.greetingAudioKey) {
    const playbackKey = ivr.greetingAudioKey.split('/').pop() ?? ivr.greetingAudioKey;
    assertSafeIdentifier(playbackKey.replace(/[^a-zA-Z0-9_-]/g, '_'), 'greeting key');
    lines.push(` same => n,Playback(${playbackKey})`);
  } else {
    lines.push(' same => n,NoOp(no greetingAudioKey)');
  }

  lines.push(
    ` same => n,Set(CHANNEL(language)=${ivr.language})`,
    ` same => n,WaitExten(${ivr.timeoutSeconds})`,
    ' same => n,Hangup()',
  );

  for (const option of ivr.options) {
    assertDialplanPattern(option.digit, 'ivr digit');
    const dest = resolveCallflowDestination(
      tenant,
      option.destinationType,
      option.destinationId,
      maps,
    );
    lines.push(`exten => ${option.digit},1,NoOp(IVR route digit ${option.digit})`);
    if (dest) {
      appendGoto(lines, dest);
    } else {
      lines.push(' same => n,NoOp(unresolved destination)');
    }
    lines.push(' same => n,Hangup()');
  }

  lines.push(
    'exten => t,1,NoOp(IVR timeout)',
    ' same => n,Hangup()',
    'exten => i,1,NoOp(IVR invalid)',
    ' same => n,Hangup()',
  );
}

function emitScheduleContext(
  lines: string[],
  schedule: TelephonyBusinessScheduleRecord,
  maps: CallflowDestinationMaps,
  tenant: TelephonyTenantRecord,
): void {
  const ctx = scheduleContext(tenant.slug, schedule.scheduleId);
  assertSafeIdentifier(ctx, 'schedule context');
  lines.push('', `[${ctx}]`, `exten => s,1,NoOp(PBX schedule ${schedule.name})`);

  const openDest = resolveCallflowDestination(
    tenant,
    schedule.openDestinationType,
    schedule.openDestinationId,
    maps,
  );
  const closedDest = resolveCallflowDestination(
    tenant,
    schedule.closedDestinationType,
    schedule.closedDestinationId,
    maps,
  );

  const gotoIfTimeClauses =
    schedule.scheduleType === 'weektime'
      ? weektimeRulesToGotoIfTime(schedule.rules, schedule.timezone)
      : [];

  if (gotoIfTimeClauses.length > 0 && openDest) {
    let step = 2;
    for (const clause of gotoIfTimeClauses) {
      lines.push(
        ` same => n(${step}),GotoIfTime(${clause.timeRange},${clause.dayRange},*,${clause.timezone}?${openDest.context},${openDest.exten},${openDest.priority})`,
      );
      step += 1;
    }
    if (closedDest) {
      appendGoto(lines, closedDest);
    } else {
      lines.push(' same => n,NoOp(closed hours — no destination configured)');
    }
    lines.push(' same => n,Hangup()');
    return;
  }

  lines.push(
    ' same => n,NoOp(schedule runtime stub — complex rules evaluated by controller)',
    ' same => n,Set(PBX_SCHEDULE_ID=' + schedule.scheduleId + ')',
  );
  if (openDest) {
    appendGoto(lines, openDest);
  }
  lines.push(' same => n,Hangup()');
}

function mapQueueStrategy(strategy: string): string {
  const normalized = strategy.toLowerCase();
  const allowed = new Set([
    'ringall',
    'leastrecent',
    'fewestcalls',
    'random',
    'rrmemory',
    'linear',
    'wrandom',
  ]);
  return allowed.has(normalized) ? normalized : 'ringall';
}

function emitQueueContexts(
  lines: string[],
  queues: TelephonyQueueRecord[],
  tenant: TelephonyTenantRecord,
): void {
  if (queues.length === 0) return;

  const ctx = queueContext(tenant.slug);
  lines.push('', `[${ctx}]`);
  for (const queue of queues) {
    assertSafeIdentifier(queue.asteriskQueueName, 'queue name');
    const exten = queue.number ?? queue.asteriskQueueName;
    assertDialplanPattern(exten, 'queue exten');
    const strategy = mapQueueStrategy(queue.strategy);
    lines.push(
      `exten => ${exten},1,NoOp(PBX queue ${queue.name} strategy ${strategy})`,
      ` same => n,Queue(${queue.asteriskQueueName},${strategy},,,${queue.maxWaitSeconds})`,
      ' same => n,Hangup()',
    );
  }
}

function emitRingGroupContext(
  lines: string[],
  group: TelephonyRingGroupRecord,
  tenant: TelephonyTenantRecord,
): void {
  const ctx = ringGroupContext(tenant.slug, group.ringGroupId);
  assertSafeIdentifier(ctx, 'ring group context');
  const endpoints = group.members
    .slice()
    .sort((a, b) => a.priority - b.priority)
    .map((m) => `PJSIP/${m.asteriskEndpointId}`);

  lines.push('', `[${ctx}]`, `exten => s,1,NoOp(PBX ring group ${group.name})`);
  if (endpoints.length === 0) {
    lines.push(' same => n,NoOp(no members configured)', ' same => n,Hangup()');
    return;
  }

  if (group.strategy === 'sequential') {
    let step = 2;
    for (const endpoint of endpoints) {
      lines.push(
        ` same => n(${step}),Dial(${endpoint},${group.timeoutSeconds},g)`,
        ` same => n,GotoIf($["\${DIALSTATUS}" = "ANSWER"]?done)`,
      );
      step += 2;
    }
    lines.push(` same => n(${step}),Hangup()`, ` same => n(done),Hangup()`);
    return;
  }

  lines.push(
    ` same => n,Dial(${endpoints.join('&')},${group.timeoutSeconds})`,
    ' same => n,Hangup()',
  );
}

function emitFeatureCodeContext(
  lines: string[],
  codes: TelephonyFeatureCodeRecord[],
  tenant: TelephonyTenantRecord,
): void {
  const enabled = codes.filter((c) => c.enabled);
  if (enabled.length === 0) return;

  const ctx = featureContext(tenant.slug);
  lines.push('', `[${ctx}]`);
  for (const code of enabled) {
    assertDialplanPattern(code.code, 'feature code');
    lines.push(`exten => ${code.code},1,NoOp(PBX feature ${code.actionType})`);
    if (code.actionType === 'dnd' || code.actionType === 'do_not_disturb') {
      lines.push(' same => n,Set(DND=${IF($["${DND}" = "1"]?0:1)})');
      lines.push(' same => n,NoOp(DND toggled to ${DND})');
    } else {
      lines.push(' same => n,NoOp(feature stub — controller hook pending)');
    }
    lines.push(' same => n,Hangup()');
  }
}

export function emitQueuesConf(queues: TelephonyQueueRecord[]): string {
  if (queues.length === 0) return '';
  const lines = ['; PBX generated tenant queues — do not edit manually'];
  for (const queue of queues) {
    assertSafeIdentifier(queue.asteriskQueueName, 'queue name');
    const strategy = mapQueueStrategy(queue.strategy);
    lines.push(
      '',
      `[${queue.asteriskQueueName}]`,
      `strategy=${strategy}`,
      'timeout=15',
      'retry=5',
      'wrapuptime=0',
      'maxlen=0',
    );
    if (queue.mohClassName) {
      assertSafeIdentifier(queue.mohClassName, 'moh class name');
      lines.push(`musiconhold=${queue.mohClassName}`);
    }
    for (const member of queue.members) {
      lines.push(
        `member=PJSIP/${member.asteriskEndpointId},${member.penalty}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

export function emitMusiconholdConf(mohClasses: TelephonyMohClassRecord[]): string {
  if (mohClasses.length === 0) return '';
  const lines = [
    '; PBX generated tenant MusicOnHold classes — do not edit manually',
    '; Sync media files from API storage into each directory before reload.',
  ];

  for (const mohClass of mohClasses) {
    assertSafeIdentifier(mohClass.asteriskClassName, 'moh class name');
    lines.push('', `[${mohClass.asteriskClassName}]`, `; ${mohClass.name}`);

    if (mohClass.tracks.length === 0) {
      lines.push(
        '; No media files linked — runtime stub only',
        'mode=files',
        `directory=${mohClassMediaDirectory(mohClass.tenantSlug, mohClass.mohClassId)}`,
        'sort=alpha',
      );
      continue;
    }

    lines.push(
      'mode=files',
      `directory=${mohClassMediaDirectory(mohClass.tenantSlug, mohClass.mohClassId)}`,
      mohClass.randomize ? 'sort=random' : 'sort=alpha',
    );
    for (const track of mohClass.tracks) {
      lines.push(`; file: ${track.fileName} (${track.storageKey})`);
    }
  }

  return `${lines.join('\n')}\n`;
}

export function appendInboundBlacklistChecks(
  inboundLines: string[],
  tenantSlug: string,
  entries: TelephonyBlacklistRecord[],
): void {
  if (entries.length === 0) return;

  const context = `from-pstn-${tenantSlug}`;
  const startIdx = inboundLines.findIndex((line) => line === `[${context}]`);
  if (startIdx < 0) return;

  const blacklistLines: string[] = [];
  for (const entry of entries) {
    assertDialplanPattern(entry.numberPattern, 'blacklist pattern');
    blacklistLines.push(
      `exten => _${entry.numberPattern},1,NoOp(PBX blacklist match ${entry.numberPattern})`,
      ' same => n,Hangup(21)',
    );
  }

  inboundLines.splice(startIdx + 1, 0, ...blacklistLines);
}

export function appendTenantCallflowDialplan(
  dialplanLines: string[],
  tenant: TelephonyTenantRecord,
  callflow: TelephonyCallflowRecords,
  maps: CallflowDestinationMaps,
): void {
  assertSafeIdentifier(tenant.slug, 'tenant slug');

  const tenantIvrs = callflow.ivrs.filter((i) => i.tenantSlug === tenant.slug);
  const tenantSchedules = callflow.schedules.filter((s) => s.tenantSlug === tenant.slug);
  const tenantQueues = callflow.queues.filter((q) => q.tenantSlug === tenant.slug);
  const tenantRingGroups = callflow.ringGroups.filter((g) => g.tenantSlug === tenant.slug);
  const tenantFeatures = callflow.featureCodes.filter((f) => f.tenantSlug === tenant.slug);

  emitVoicemailStub(dialplanLines, tenant.slug);

  for (const ivr of tenantIvrs) {
    emitIvrContext(dialplanLines, ivr, maps, tenant);
  }
  for (const schedule of tenantSchedules) {
    emitScheduleContext(dialplanLines, schedule, maps, tenant);
  }
  emitQueueContexts(dialplanLines, tenantQueues, tenant);
  for (const group of tenantRingGroups) {
    emitRingGroupContext(dialplanLines, group, tenant);
  }
  emitFeatureCodeContext(dialplanLines, tenantFeatures, tenant);
}

export function buildCallflowDestinationMaps(
  callflow: TelephonyCallflowRecords,
  extensionNumbers: Map<string, string>,
): CallflowDestinationMaps {
  const queueById = new Map<string, { asteriskQueueName: string; number: string | null }>();
  for (const queue of callflow.queues) {
    queueById.set(queue.queueId, {
      asteriskQueueName: queue.asteriskQueueName,
      number: queue.number,
    });
  }

  return {
    extensionNumbers,
    queueById,
    ringGroupIds: new Set(callflow.ringGroups.map((g) => g.ringGroupId)),
    ivrIds: new Set(callflow.ivrs.map((i) => i.ivrId)),
    scheduleIds: new Set(callflow.schedules.map((s) => s.scheduleId)),
  };
}
