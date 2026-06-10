'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/format';
import { ConfirmDialog } from '@/components/ui-panels';
import {
  ErrorAlert,
  LoadingBlock,
  PageHeader,
  StatusBanner,
} from '@/components/app-shell';

type TenantSummary = {
  calls?: { active?: number; todayTotal?: number; todayFailed?: number };
  extensions?: { total?: number; registered?: number; unregistered?: number };
  aiSessions?: { active?: number };
  usage?: { normalizedEventCount?: number; unratedCount?: number };
  billing?: { previewTotal?: string; currency?: string } | null;
  subscription?: { planName?: string | null; monthlyAmount?: string | null; currency?: string } | null;
};

export default function PlatformTenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [tenant, setTenant] = useState<Record<string, unknown> | null>(null);
  const [summary, setSummary] = useState<TenantSummary | null>(null);
  const [invoices, setInvoices] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [voidId, setVoidId] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState('10.00');
  const [creditReason, setCreditReason] = useState('platform_adjustment');

  async function load() {
    const [t, s, inv] = await Promise.all([
      api.get(`tenants/${tenantId}`),
      api.get(`tenants/${tenantId}/dashboard`, tenantId),
      api.get<Array<Record<string, unknown>>>('invoices', tenantId),
    ]);
    setTenant(t as Record<string, unknown>);
    setSummary(s as TenantSummary);
    setInvoices(inv);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load tenant'));
  }, [tenantId]);

  async function onPreview() {
    setError(null);
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(1);
    periodStart.setUTCHours(0, 0, 0, 0);
    try {
      const preview = await api.post<Record<string, unknown>>(
        'invoices/preview',
        { periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() },
        tenantId,
      );
      setMessage(`Preview total: ${formatCurrency(String(preview.total), String(preview.currency ?? 'USD'))}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    }
  }

  async function onGenerate() {
    setError(null);
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(1);
    periodStart.setUTCHours(0, 0, 0, 0);
    try {
      await api.post(
        'invoices/generate',
        {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          idempotencyKey: `platform-${tenantId}-${periodStart.toISOString().slice(0, 7)}`,
        },
        tenantId,
      );
      setMessage('Draft invoice generated.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generate failed');
    }
  }

  async function onFinalize(invoiceId: string) {
    setError(null);
    try {
      await api.post(`invoices/${invoiceId}/finalize`, {}, tenantId);
      setMessage('Invoice finalized.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Finalize failed');
    }
  }

  async function onVoid(invoiceId: string) {
    setError(null);
    try {
      await api.post(`invoices/${invoiceId}/void`, {}, tenantId);
      setMessage('Invoice voided.');
      setVoidId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Void failed');
    }
  }

  async function onCreditAdjust(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post('credits/adjustments', { amount: creditAmount, currency: 'USD', reason: creditReason }, tenantId);
      setMessage('Credit adjustment applied.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credit adjustment failed');
    }
  }

  if (error && !tenant) return <ErrorAlert message={error} />;
  if (!tenant) return <LoadingBlock />;

  return (
    <>
      <PageHeader title={String(tenant.name)} description={`Slug: ${String(tenant.slug)}`} />
      <StatusBanner stripe providerCost />
      {error ? <ErrorAlert message={error} /> : null}
      {message ? (
        <div className="alert alert-info" role="status">
          {message}
        </div>
      ) : null}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <p>Status: {String(tenant.status)}</p>
        <p>
          <Link href={`/t/${tenantId}/dashboard`}>Open tenant workspace</Link>
        </p>
        <p className="muted">Support-session impersonation is unavailable in this release.</p>
      </div>
      {summary ? (
        <div className="grid-stats" style={{ marginBottom: '1rem' }}>
          <div className="card">
            <div className="muted">Active calls</div>
            <div className="stat-value">{summary.calls?.active ?? 0}</div>
          </div>
          <div className="card">
            <div className="muted">Extensions</div>
            <div className="stat-value">{summary.extensions?.total ?? 0}</div>
            <div className="muted">
              {summary.extensions?.registered ?? 0} registered / {summary.extensions?.unregistered ?? 0} unregistered
            </div>
          </div>
          <div className="card">
            <div className="muted">AI sessions</div>
            <div className="stat-value">{summary.aiSessions?.active ?? 0}</div>
          </div>
          <div className="card">
            <div className="muted">Usage events</div>
            <div className="stat-value">{summary.usage?.normalizedEventCount ?? 0}</div>
            <div className="muted">{summary.usage?.unratedCount ?? 0} unrated</div>
          </div>
        </div>
      ) : null}
      <section className="card" style={{ marginBottom: '1rem' }} aria-labelledby="billing-admin-heading">
        <h2 id="billing-admin-heading">Billing administration</h2>
        <p className="muted">Payment integration: Disabled</p>
        {summary?.subscription ? (
          <p>
            Plan: {summary.subscription.planName ?? 'Assigned'} —{' '}
            {formatCurrency(summary.subscription.monthlyAmount, summary.subscription.currency)}/mo
          </p>
        ) : (
          <p className="muted">No subscription assigned</p>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.75rem 0' }}>
          <button type="button" className="btn btn-secondary" onClick={() => void onPreview()}>
            Preview invoice
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void onGenerate()}>
            Generate draft invoice
          </button>
        </div>
        <form onSubmit={onCreditAdjust} style={{ marginTop: '1rem' }}>
          <h3>Credit adjustment</h3>
          <div className="field">
            <label className="label" htmlFor="credit-amount">
              Amount (USD)
            </label>
            <input
              id="credit-amount"
              className="input"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="credit-reason">
              Reason
            </label>
            <input
              id="credit-reason"
              className="input"
              value={creditReason}
              onChange={(e) => setCreditReason(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Apply credit adjustment
          </button>
        </form>
      </section>
      <section className="card" aria-labelledby="invoices-heading">
        <h2 id="invoices-heading">Invoices</h2>
        {invoices.length === 0 ? (
          <p className="muted">No invoices yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Total</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={String(inv.id)}>
                    <td>
                      {formatDate(String(inv.periodStart))} – {formatDate(String(inv.periodEnd))}
                    </td>
                    <td>{String(inv.status)}</td>
                    <td>{formatCurrency(String(inv.total), String(inv.currency ?? 'USD'))}</td>
                    <td>
                      {inv.status === 'draft' ? (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => void onFinalize(String(inv.id))}
                        >
                          Finalize
                        </button>
                      ) : null}
                      {inv.status === 'draft' || inv.status === 'finalized' ? (
                        <button
                          type="button"
                          className="btn btn-danger"
                          style={{ marginLeft: '0.35rem' }}
                          onClick={() => setVoidId(String(inv.id))}
                        >
                          Void
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ConfirmDialog
        open={!!voidId}
        title="Void invoice"
        message="This invoice will be marked void and cannot be paid externally."
        confirmLabel="Void invoice"
        onCancel={() => setVoidId(null)}
        onConfirm={() => {
          if (voidId) void onVoid(voidId);
        }}
      />
    </>
  );
}
