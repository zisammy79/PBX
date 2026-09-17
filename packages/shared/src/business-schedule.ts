export type ScheduleEvaluation = 'open' | 'closed';

export interface WeektimeRule {
  type?: string;
  days?: number[];
  dayOfWeek?: number;
  start?: string;
  startTime?: string;
  end?: string;
  endTime?: string;
}

function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getZonedParts(date: Date, timezone: string): { dayOfWeek: number; minutes: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    dayOfWeek: dayMap[weekday] ?? 0,
    minutes: hour * 60 + minute,
  };
}

function ruleMatchesNow(rule: WeektimeRule, dayOfWeek: number, minutes: number): boolean {
  const days =
    rule.days ??
    (rule.dayOfWeek !== undefined ? [rule.dayOfWeek] : undefined);
  if (!days || !days.includes(dayOfWeek)) return false;

  const startRaw = rule.start ?? rule.startTime;
  const endRaw = rule.end ?? rule.endTime;
  if (!startRaw || !endRaw) return false;

  const start = parseTimeToMinutes(startRaw);
  const end = parseTimeToMinutes(endRaw);
  if (start === null || end === null) return false;

  if (start <= end) {
    return minutes >= start && minutes < end;
  }
  return minutes >= start || minutes < end;
}

/** Evaluate weektime-style schedule rules against a point in time. */
export function evaluateBusinessSchedule(
  rules: unknown[],
  now: Date,
  timezone: string,
): ScheduleEvaluation {
  if (!Array.isArray(rules) || rules.length === 0) {
    return 'open';
  }

  const { dayOfWeek, minutes } = getZonedParts(now, timezone);
  const weektimeRules = rules.filter((rule) => {
    if (!rule || typeof rule !== 'object') return false;
    const typed = rule as WeektimeRule;
    if (typed.type && typed.type !== 'weektime') return false;
    return true;
  }) as WeektimeRule[];

  const candidates = weektimeRules.length > 0 ? weektimeRules : (rules as WeektimeRule[]);
  const matched = candidates.some((rule) => ruleMatchesNow(rule, dayOfWeek, minutes));
  return matched ? 'open' : 'closed';
}
