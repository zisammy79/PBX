'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { downloadCsv } from '@/lib/csv-export';
import { formatDate, formatDuration } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import { Breadcrumbs } from '@/components/telephony/breadcrumbs';
import {
  DateRangePicker,
  defaultTodayRange,
  type DateRangeValue,
} from '@/components/telephony/date-range-picker';
import { InlineRecordingPlayer } from '@/components/telephony/inline-recording';

type Call = {
  id: string;
  direction: string;
  status: string;
  callerNumber: string | null;
  calleeNumber: string | null;
  startedAt: string;
  answeredAt: string | null;
  durationSeconds: number | null;
  correlationId: string;
  recordingId: string | null;
};

type PaginatedCalls = {
  data: Call[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
};

type Filters = {
  direction: string;
  status: string;
  source: string;
  destination: string;
  did: string;
  extensionId: string;
  minDurationSeconds: string;
  maxDurationSeconds: string;
  range: DateRangeValue;
};

function buildQuery(page: number, filters: Filters): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: '50',
    startDate: filters.range.from.slice(0, 10),
    endDate: filters.range.to.slice(0, 10),
  });
  if (filters.direction) params.set('direction', filters.direction);
  if (filters.status) params.set('status', filters.status);
  if (filters.source) params.set('source', filters.source);
  if (filters.destination) params.set('destination', filters.destination);
  if (filters.did) params.set('did', filters.did);
  if (filters.extensionId) params.set('extensionId', filters.extensionId);
  if (filters.minDurationSeconds) params.set('minDurationSeconds', filters.minDurationSeconds);
  if (filters.maxDurationSeconds) params.set('maxDurationSeconds', filters.maxDurationSeconds);
  return `calls?${params.toString()}`;
}

function ttaSeconds(call: Call): number | null {
  if (!call.answeredAt) return null;
  const start = new Date(call.startedAt).getTime();
  const answered = new Date(call.answeredAt).getTime();
  return Math.max(0, Math.round((answered - start) / 1000));
}

export default function CallsPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const initialFilters = useMemo<Filters>(
    () => ({
      direction: searchParams.get('direction') ?? '',
      status: searchParams.get('status') ?? '',
      source: searchParams.get('source') ?? '',
      destination: searchParams.get('destination') ?? '',
      did: searchParams.get('did') ?? '',
      extensionId: searchParams.get('extensionId') ?? '',
      minDurationSeconds: searchParams.get('minDurationSeconds') ?? '',
      maxDurationSeconds: searchParams.get('maxDurationSeconds') ?? '',
      range: defaultTodayRange(),
    }),
    [searchParams],
  );

  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(initialFilters);
  const [history, setHistory] = useState<PaginatedCalls | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<PaginatedCalls>(
        buildQuery(page, appliedFilters),
        tenantId,
      );
      setHistory(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('calls.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page, tenantId, t]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  function onApplyFilters(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setAppliedFilters(filters);
  }

  function exportCsv() {
    if (!history) return;
    const headers = [
      t('calls.when'),
      t('calls.direction'),
      t('calls.from'),
      t('calls.to'),
      t('calls.status'),
      t('calls.duration'),
      t('calls.tta'),
      'Correlation ID',
    ];
    const rows = history.data.map((call) => [
      call.startedAt,
      call.direction,
      call.callerNumber ?? '',
      call.calleeNumber ?? '',
      call.status,
      String(call.durationSeconds ?? ''),
      String(ttaSeconds(call) ?? ''),
      call.correlationId,
    ]);
    downloadCsv(`call-records-${tenantId.slice(0, 8)}.csv`, headers, rows);
  }

  const recordsSummary = history
    ? t('calls.recordsSummary')
        .replace('{total}', String(history.pagination.totalItems))
        .replace('{page}', String(history.pagination.page))
        .replace('{pages}', String(history.pagination.totalPages))
    : '';

  return (
    <>
      <Breadcrumbs
        items={[
          { label: t('calls.dashboard'), href: `/t/${tenantId}/dashboard` },
          { label: t('calls.title') },
        ]}
      />
      <PageHeader
        title={t('calls.title')}
        description={t('calls.description')}
        actions={
          <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={!history}>
            {t('calls.exportCsv')}
          </button>
        }
      />
      {error ? <ErrorAlert message={error} /> : null}

      <form className="card" onSubmit={onApplyFilters}>
        <h2>{t('calls.filters')}</h2>
        <DateRangePicker
          value={filters.range}
          onChange={(range) => setFilters((prev) => ({ ...prev, range }))}
        />
        <div className="cdr-filters">
          <label className="field">
            <span className="label">{t('calls.direction')}</span>
            <select
              className="select"
              value={filters.direction}
              onChange={(e) => setFilters((prev) => ({ ...prev, direction: e.target.value }))}
            >
              <option value="">{t('calls.directionAll')}</option>
              <option value="inbound">{t('calls.directionInbound')}</option>
              <option value="outbound">{t('calls.directionOutbound')}</option>
              <option value="internal">{t('calls.directionInternal')}</option>
            </select>
          </label>
          <label className="field">
            <span className="label">{t('calls.status')}</span>
            <select
              className="select"
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="">{t('calls.statusAll')}</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
              <option value="cancelled">cancelled</option>
              <option value="answered">answered</option>
              <option value="ringing">ringing</option>
            </select>
          </label>
          <label className="field">
            <span className="label">{t('calls.source')}</span>
            <input
              className="input"
              value={filters.source}
              onChange={(e) => setFilters((prev) => ({ ...prev, source: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="label">{t('calls.destination')}</span>
            <input
              className="input"
              value={filters.destination}
              onChange={(e) => setFilters((prev) => ({ ...prev, destination: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="label">{t('calls.did')}</span>
            <input
              className="input"
              value={filters.did}
              onChange={(e) => setFilters((prev) => ({ ...prev, did: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="label">{t('calls.extensionId')}</span>
            <input
              className="input"
              value={filters.extensionId}
              onChange={(e) => setFilters((prev) => ({ ...prev, extensionId: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="label">{t('calls.minDuration')}</span>
            <input
              className="input"
              type="number"
              min={0}
              value={filters.minDurationSeconds}
              onChange={(e) => setFilters((prev) => ({ ...prev, minDurationSeconds: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="label">{t('calls.maxDuration')}</span>
            <input
              className="input"
              type="number"
              min={0}
              value={filters.maxDurationSeconds}
              onChange={(e) => setFilters((prev) => ({ ...prev, maxDurationSeconds: e.target.value }))}
            />
          </label>
        </div>
        <button type="submit" className="btn btn-primary">{t('calls.applyFilters')}</button>
      </form>

      {loading && !history ? (
        <LoadingBlock />
      ) : history ? (
        <section className="card">
          <div className="filter-actions">
            <span className="muted">{recordsSummary}</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('calls.previous')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page >= history.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('calls.next')}
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('calls.when')}</th>
                  <th>{t('calls.direction')}</th>
                  <th>{t('calls.from')}</th>
                  <th>{t('calls.to')}</th>
                  <th>{t('calls.status')}</th>
                  <th>{t('calls.duration')}</th>
                  <th>{t('calls.tta')}</th>
                  <th>{t('calls.recording')}</th>
                </tr>
              </thead>
              <tbody>
                {history.data.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted">{t('calls.noResults')}</td>
                  </tr>
                ) : (
                  history.data.map((call) => (
                    <tr key={call.id}>
                      <td>{formatDate(call.startedAt)}</td>
                      <td>{call.direction}</td>
                      <td>{call.callerNumber ?? '—'}</td>
                      <td>{call.calleeNumber ?? '—'}</td>
                      <td>
                        <Link href={`/t/${tenantId}/calls/${call.id}`}>{call.status}</Link>
                      </td>
                      <td>{formatDuration(call.durationSeconds)}</td>
                      <td>{formatDuration(ttaSeconds(call))}</td>
                      <td>
                        {call.recordingId ? (
                          <InlineRecordingPlayer tenantId={tenantId} recordingId={call.recordingId} />
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
