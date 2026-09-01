'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api-client';
import { downloadCsv } from '@/lib/csv-export';
import { formatDate, formatDuration } from '@/lib/format';
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
  callerNumber: string;
  calleeNumber: string;
  range: DateRangeValue;
};

function buildQuery(page: number, filters: Filters): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: '50',
    from: filters.range.from,
    to: filters.range.to,
  });
  if (filters.direction) params.set('direction', filters.direction);
  if (filters.status) params.set('status', filters.status);
  if (filters.callerNumber) params.set('callerNumber', filters.callerNumber);
  if (filters.calleeNumber) params.set('calleeNumber', filters.calleeNumber);
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

  const initialFilters = useMemo<Filters>(
    () => ({
      direction: searchParams.get('direction') ?? '',
      status: searchParams.get('status') ?? '',
      callerNumber: '',
      calleeNumber: '',
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
      setError(err instanceof Error ? err.message : 'Failed to load calls');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, page, tenantId]);

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
      'Started',
      'Direction',
      'From',
      'To',
      'Status',
      'Duration',
      'TTA',
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

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/t/${tenantId}/dashboard` },
          { label: 'Call records' },
        ]}
      />
      <PageHeader
        title="Call records"
        description="Search, filter, and export call detail records."
        actions={
          <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={!history}>
            Export CSV
          </button>
        }
      />
      {error ? <ErrorAlert message={error} /> : null}

      <form className="card" onSubmit={onApplyFilters}>
        <h2>Filters</h2>
        <DateRangePicker
          value={filters.range}
          onChange={(range) => setFilters((prev) => ({ ...prev, range }))}
        />
        <div className="cdr-filters">
          <label className="field">
            <span className="label">Direction</span>
            <select
              className="select"
              value={filters.direction}
              onChange={(e) => setFilters((prev) => ({ ...prev, direction: e.target.value }))}
            >
              <option value="">All</option>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
              <option value="internal">Local</option>
            </select>
          </label>
          <label className="field">
            <span className="label">Status</span>
            <select
              className="select"
              value={filters.status}
              onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="">All</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
              <option value="answered">Answered</option>
              <option value="ringing">Ringing</option>
            </select>
          </label>
          <label className="field">
            <span className="label">Caller</span>
            <input
              className="input"
              value={filters.callerNumber}
              onChange={(e) => setFilters((prev) => ({ ...prev, callerNumber: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="label">Callee</span>
            <input
              className="input"
              value={filters.calleeNumber}
              onChange={(e) => setFilters((prev) => ({ ...prev, calleeNumber: e.target.value }))}
            />
          </label>
        </div>
        <button type="submit" className="btn btn-primary">Apply filters</button>
      </form>

      {loading && !history ? (
        <LoadingBlock />
      ) : history ? (
        <section className="card">
          <div className="filter-actions">
            <span className="muted">
              {history.pagination.totalItems} records · page {history.pagination.page} of{' '}
              {history.pagination.totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={page >= history.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Direction</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>TTA</th>
                  <th>Recording</th>
                </tr>
              </thead>
              <tbody>
                {history.data.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted">No calls match these filters.</td>
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
