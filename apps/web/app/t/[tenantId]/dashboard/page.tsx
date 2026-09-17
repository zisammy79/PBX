'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { formatCurrency, formatDate, formatDuration } from '@/lib/format';
import {
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBanner,
} from '@/components/app-shell';
import { Breadcrumbs } from '@/components/telephony/breadcrumbs';
import { CallsHourlyChart } from '@/components/telephony/calls-chart';
import { KpiCard, KpiGrid } from '@/components/telephony/kpi-card';
import { useI18n } from '@/lib/i18n';

type DashboardSummary = {
  kpis?: {
    connectedExtensions: number;
    disconnectedExtensions: number;
    inboundToday: number;
    outboundToday: number;
    internalActive: number;
  };
  calls: {
    active: number;
    todayTotal: number;
    todayCompleted: number;
    todayFailed: number;
    todayInbound: number;
    todayOutbound: number;
    todayInternal: number;
    todayMissed: number;
    liveInbound: number;
    liveOutbound: number;
    liveInternal: number;
    liveOnHold: number;
    totalTalkSecondsToday: number;
    avgInboundAnswerSeconds: number;
    avgOutboundAnswerSeconds: number;
    hourlyChart: Array<{ hour: number; inbound: number; outbound: number; internal: number }>;
    recent: Array<{
      id: string;
      direction: string;
      status: string;
      callerNumber: string | null;
      calleeNumber: string | null;
      startedAt: string;
      durationSeconds: number | null;
    }>;
  };
  extensions: { total: number; registered: number; unregistered: number };
  aiSessions: { active: number };
  usage: { normalizedEventCount: number; unratedCount: number; providerCostStatus: string };
  billing: { previewTotal: string; currency: string; stripeStatus: string; providerCostStatus: string } | null;
  subscription: { planName: string | null; monthlyAmount: string | null; currency: string } | null;
};

export default function TenantDashboardPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { t } = useI18n();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<DashboardSummary>(`tenants/${tenantId}/dashboard`, tenantId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard'));
  }, [tenantId]);

  if (error) return <ErrorAlert message={error} />;
  if (!data) return <LoadingBlock />;

  const calls = data.calls;
  const kpis = data.kpis ?? {
    connectedExtensions: data.extensions.registered,
    disconnectedExtensions: data.extensions.unregistered,
    inboundToday: calls.todayInbound,
    outboundToday: calls.todayOutbound,
    internalActive: calls.liveInternal,
  };

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t('nav.dashboard'), href: `/t/${tenantId}/dashboard` },
          { label: t('dashboard.overview') },
        ]}
      />
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <Link href={`/t/${tenantId}/statistics`} className="btn btn-secondary">
            {t('dashboard.statisticsHub')}
          </Link>
        }
      />
      <StatusBanner demoAi externalAi stripe providerCost pstn />

      <KpiGrid>
        <KpiCard
          label={t('dashboard.inboundToday')}
          value={kpis.inboundToday}
          tone="inbound"
          href={`/t/${tenantId}/calls?direction=inbound`}
        />
        <KpiCard
          label={t('dashboard.outboundToday')}
          value={kpis.outboundToday}
          tone="outbound"
          href={`/t/${tenantId}/calls?direction=outbound`}
        />
        <KpiCard
          label={t('dashboard.internalActive')}
          value={kpis.internalActive}
          tone="local"
          href={`/t/${tenantId}/calls?direction=internal`}
        />
        <KpiCard
          label={t('dashboard.missedToday')}
          value={calls.todayMissed}
          tone="missed"
          href={`/t/${tenantId}/calls?status=failed`}
        />
        <KpiCard
          label={t('dashboard.liveCalls')}
          value={calls.active}
          hint={`${calls.liveOnHold} ${t('dashboard.onHold')}`}
          tone="live"
          href={`/t/${tenantId}/operator`}
        />
        <KpiCard
          label={t('dashboard.connectedExtensions')}
          value={kpis.connectedExtensions}
          hint={`${kpis.disconnectedExtensions} ${t('dashboard.extensionsOffline')}`}
          href={`/t/${tenantId}/status`}
        />
      </KpiGrid>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <section className="card">
          <h2>{t('dashboard.liveBreakdown')}</h2>
          <p>{t('dashboard.inbound')}: {calls.liveInbound}</p>
          <p>{t('dashboard.outbound')}: {calls.liveOutbound}</p>
          <p>{t('dashboard.local')}: {calls.liveInternal}</p>
          <p>{t('dashboard.onHoldLabel')}: {calls.liveOnHold}</p>
          <Link href={`/t/${tenantId}/operator`}>{t('dashboard.operatorPanel')}</Link>
        </section>
        <section className="card">
          <h2>{t('dashboard.talkTimeToday')}</h2>
          <p>{t('dashboard.total')}: {formatDuration(calls.totalTalkSecondsToday)}</p>
          <p>{t('dashboard.avgInboundAnswer')}: {formatDuration(Math.round(calls.avgInboundAnswerSeconds))}</p>
          <p>{t('dashboard.avgOutboundAnswer')}: {formatDuration(Math.round(calls.avgOutboundAnswerSeconds))}</p>
        </section>
        <section className="card">
          <h2>{t('dashboard.usageSummary')}</h2>
          <p>{t('dashboard.normalizedEvents')}: {data.usage.normalizedEventCount}</p>
          <p>{t('dashboard.unratedEvents')}: {data.usage.unratedCount}</p>
          <p className="muted">{t('dashboard.providerCostUnavailable')}</p>
        </section>
        <section className="card">
          <h2>{t('dashboard.billingPreview')}</h2>
          {data.billing ? (
            <>
              <p>
                {t('dashboard.currentPeriodEstimate')}:{' '}
                {formatCurrency(data.billing.previewTotal, data.billing.currency)}
              </p>
              <p className="muted">{t('dashboard.paymentDisabled')}</p>
            </>
          ) : (
            <p className="muted">{t('dashboard.invoiceUnavailable')}</p>
          )}
          {data.subscription ? (
            <p>
              {t('dashboard.plan')}: {data.subscription.planName ?? 'Assigned'} —{' '}
              {formatCurrency(data.subscription.monthlyAmount, data.subscription.currency)}/mo
            </p>
          ) : (
            <p className="muted">{t('dashboard.noSubscription')}</p>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>{t('dashboard.hourlyVolume')}</h2>
        <CallsHourlyChart data={calls.hourlyChart} />
      </section>

      <section className="card" style={{ marginTop: '1rem' }} aria-labelledby="recent-calls-heading">
        <h2 id="recent-calls-heading">{t('dashboard.recentCalls')}</h2>
        {calls.recent.length === 0 ? (
          <p className="muted">{t('dashboard.noCalls')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('dashboard.when')}</th>
                  <th>{t('dashboard.direction')}</th>
                  <th>{t('dashboard.from')}</th>
                  <th>{t('dashboard.to')}</th>
                  <th>{t('dashboard.status')}</th>
                  <th>{t('dashboard.duration')}</th>
                </tr>
              </thead>
              <tbody>
                {calls.recent.map((call) => (
                  <tr key={call.id}>
                    <td>{formatDate(call.startedAt)}</td>
                    <td>{call.direction}</td>
                    <td>{call.callerNumber ?? '—'}</td>
                    <td>{call.calleeNumber ?? '—'}</td>
                    <td>
                      <Link href={`/t/${tenantId}/calls/${call.id}`}>{call.status}</Link>
                    </td>
                    <td>{formatDuration(call.durationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
