'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AssignableDestination } from '@pbx/contracts';
import { api } from '@/lib/api-client';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';
import {
  buildPurchaseAndAssignPayload,
  filterAssignableDestinationsByTarget,
  pickDefaultDestinationValue,
  sortActiveTenantsForAssignment,
  type TenantOption,
} from '@/lib/phone-number-assignment';

type AvailableNumber = {
  e164: string;
  friendlyName: string | null;
  locality: string | null;
  region: string | null;
  country: string;
  numberType: string;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  addressRequirement: string | null;
  regulatoryStatus: 'none' | 'requires_regulatory_setup';
  monthlyPrice: string | null;
};

type OwnedNumber = {
  sid: string;
  e164: string;
  friendlyName: string | null;
  trunkSid: string | null;
  capabilities?: { voice: boolean; sms: boolean; mms: boolean };
};

type TenantNumber = {
  id: string;
  e164: string;
  friendlyName: string | null;
  status: string;
  providerSid: string | null;
  onTwilioTrunk: boolean;
  destinationType: string | null;
  isActive: boolean;
};

const LIMITS = [10, 25, 50] as const;

export default function PlatformPhoneNumbersPage() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [routingTenantId, setRoutingTenantId] = useState('');
  const [assignmentTenantId, setAssignmentTenantId] = useState('');
  const [assignableDestinations, setAssignableDestinations] = useState<AssignableDestination[]>([]);
  const [destinationsLoading, setDestinationsLoading] = useState(false);
  const [destinationsError, setDestinationsError] = useState<string | null>(null);
  const [available, setAvailable] = useState<AvailableNumber[]>([]);
  const [owned, setOwned] = useState<OwnedNumber[]>([]);
  const [tenantNumbers, setTenantNumbers] = useState<TenantNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [country, setCountry] = useState('IL');
  const [numberType, setNumberType] = useState('local');
  const [areaCode, setAreaCode] = useState('');
  const [contains, setContains] = useState('');
  const [limit, setLimit] = useState<number>(25);
  const [appliedFilters, setAppliedFilters] = useState<{ areaCodeInput?: string; e164Prefix?: string } | null>(
    null,
  );

  const [selected, setSelected] = useState<AvailableNumber | null>(null);
  const [destinationType, setDestinationType] = useState<'extension' | 'ai_agent' | 'voicemail' | 'reserve_only'>(
    'extension',
  );
  const [destinationValue, setDestinationValue] = useState('');
  const [callerIdPolicy, setCallerIdPolicy] = useState('tenant_default');
  const [confirmChecked, setConfirmChecked] = useState(false);

  const activeTenants = useMemo(() => sortActiveTenantsForAssignment(tenants), [tenants]);

  const refreshOwned = useCallback(async () => {
    const res = await api.get<{ numbers: OwnedNumber[] }>('twilio/numbers/owned');
    setOwned(res.numbers);
  }, []);

  const refreshTenantNumbers = useCallback(async (tid: string) => {
    if (!tid) {
      setTenantNumbers([]);
      return;
    }
    const res = await api.get<{ numbers: TenantNumber[] }>(`tenants/${tid}/phone-numbers`, tid);
    setTenantNumbers(res.numbers);
  }, []);

  const loadAssignableDestinations = useCallback(async (tid: string) => {
    if (!tid) {
      setAssignableDestinations([]);
      setDestinationsError(null);
      return;
    }

    setDestinationsLoading(true);
    setDestinationsError(null);
    try {
      const res = await api.get<{
        tenantId: string;
        tenantSlug: string;
        destinations: AssignableDestination[];
      }>(`tenants/${tid}/assignable-destinations`, tid);
      setAssignableDestinations(res.destinations);
    } catch (err) {
      setAssignableDestinations([]);
      setDestinationsError(err instanceof Error ? err.message : 'Failed to load destinations');
    } finally {
      setDestinationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const tenantRows = await api.get<TenantOption[]>('tenants');
        setTenants(tenantRows);
        const active = sortActiveTenantsForAssignment(tenantRows);
        if (active[0]) {
          setRoutingTenantId(active[0].id);
        }
        await refreshOwned();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshOwned]);

  useEffect(() => {
    if (!routingTenantId) return;
    void refreshTenantNumbers(routingTenantId).catch(() => undefined);
  }, [routingTenantId, refreshTenantNumbers]);

  useEffect(() => {
    if (!assignmentTenantId) {
      setAssignableDestinations([]);
      setDestinationValue('');
      setDestinationsError(null);
      return;
    }
    void loadAssignableDestinations(assignmentTenantId);
  }, [assignmentTenantId, loadAssignableDestinations]);

  const destinationOptions = useMemo(
    () => filterAssignableDestinationsByTarget(assignableDestinations, destinationType),
    [assignableDestinations, destinationType],
  );

  useEffect(() => {
    if (destinationType === 'reserve_only') {
      setDestinationValue('');
      return;
    }
    setDestinationValue((current) =>
      pickDefaultDestinationValue(destinationOptions, current || undefined),
    );
  }, [destinationOptions, destinationType]);

  function openPurchaseModal(number: AvailableNumber) {
    setSelected(number);
    setConfirmChecked(false);
    setAssignmentTenantId('');
    setAssignableDestinations([]);
    setDestinationValue('');
    setDestinationsError(null);
    setDestinationType('extension');
  }

  async function runSearch() {
    setSearching(true);
    setError(null);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        country,
        type: numberType,
        limit: String(limit),
        voiceRequired: 'true',
      });
      if (areaCode) params.set('areaCode', areaCode);
      if (contains) params.set('contains', contains);
      const res = await api.get<{
        numbers: AvailableNumber[];
        appliedFilters?: { areaCodeInput?: string; e164Prefix?: string };
      }>(`twilio/numbers/search?${params}`);
      setAvailable(res.numbers);
      setAppliedFilters(res.appliedFilters ?? null);
      if (res.numbers.length === 0 && res.appliedFilters?.e164Prefix) {
        setMessage(
          `No numbers found for ${res.appliedFilters.e164Prefix}. Try clearing the prefix or using 02 / 04 / 09 / 076.`,
        );
      } else {
        setMessage(`Found ${res.numbers.length} available numbers`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  async function purchaseAndAssign() {
    if (!selected || !assignmentTenantId || !confirmChecked) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api.post(
        'twilio/numbers/purchase-and-assign',
        buildPurchaseAndAssignPayload({
          tenantId: assignmentTenantId,
          e164: selected.e164,
          destinationType,
          destinationExtensionNumber: destinationValue,
          destinationId: destinationType === 'ai_agent' ? destinationValue : '',
          outboundCallerIdPolicy: callerIdPolicy,
        }),
        assignmentTenantId,
      );
      setMessage(`Purchased and assigned ${selected.e164}`);
      setSelected(null);
      setConfirmChecked(false);
      setAssignmentTenantId('');
      await Promise.all([refreshOwned(), refreshTenantNumbers(assignmentTenantId)]);
      setAvailable([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Purchase failed');
    } finally {
      setBusy(false);
    }
  }

  const selectedBlocked = selected?.regulatoryStatus === 'requires_regulatory_setup';
  const assignmentTenant = activeTenants.find((tenant) => tenant.id === assignmentTenantId);

  const capabilityLabel = useMemo(
    () => (caps: { voice: boolean; sms: boolean; mms: boolean }) =>
      ['voice', 'sms', 'mms'].filter((k) => caps[k as keyof typeof caps]).join(', ') || '—',
    [],
  );

  const areaCodeLabel =
    country === 'IL'
      ? 'Area / prefix (e.g. 03, 02, 04, 076)'
      : country === 'US' || country === 'CA'
        ? 'Area code'
        : 'Area / prefix';

  if (loading) return <LoadingBlock />;

  return (
    <>
      <PageHeader
        title="Phone Numbers"
        description="Search Twilio inventory, purchase with explicit confirmation, attach to the production SIP trunk, and assign inbound routing."
      />
      {error ? <ErrorAlert message={error} /> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2>Search Twilio Inventory</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
          <label>
            Country
            <input value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} style={{ width: '100%' }} />
          </label>
          <label>
            Type
            <select value={numberType} onChange={(e) => setNumberType(e.target.value)} style={{ width: '100%' }}>
              <option value="local">Local</option>
              <option value="mobile">Mobile</option>
              <option value="toll_free">Toll-free</option>
              <option value="any">Any</option>
            </select>
          </label>
          <label>
            {areaCodeLabel}
            <input value={areaCode} onChange={(e) => setAreaCode(e.target.value)} style={{ width: '100%' }} />
          </label>
          <label>
            Contains
            <input value={contains} onChange={(e) => setContains(e.target.value)} style={{ width: '100%' }} />
          </label>
          <label>
            Limit
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ width: '100%' }}>
              {LIMITS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        {appliedFilters?.areaCodeInput && appliedFilters.e164Prefix ? (
          <p className="muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            Applied filter:{' '}
            <span className="badge">
              {appliedFilters.areaCodeInput} → {appliedFilters.e164Prefix}
            </span>
          </p>
        ) : null}
        <button type="button" className="btn btn-primary" style={{ marginTop: '0.75rem' }} disabled={searching} onClick={() => void runSearch()}>
          {searching ? 'Searching…' : 'Search available numbers'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2>Available Numbers</h2>
        <table>
          <thead>
            <tr>
              <th>E.164</th>
              <th>Locality</th>
              <th>Type</th>
              <th>Capabilities</th>
              <th>Regulatory</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {available.map((n) => (
              <tr key={n.e164}>
                <td>{n.e164}</td>
                <td>{n.locality ?? n.region ?? '—'}</td>
                <td>{n.numberType}</td>
                <td>{capabilityLabel(n.capabilities)}</td>
                <td>{n.regulatoryStatus === 'requires_regulatory_setup' ? 'Requires setup' : 'OK'}</td>
                <td>
                  <button type="button" className="btn" onClick={() => openPurchaseModal(n)}>
                    Select
                  </button>
                </td>
              </tr>
            ))}
            {available.length === 0 ? (
              <tr>
                <td colSpan={6}>Run a search to preview Twilio inventory. No purchase occurs until you confirm.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2>Owned Numbers (Twilio account)</h2>
        <table>
          <thead>
            <tr>
              <th>E.164</th>
              <th>On trunk</th>
              <th>SID</th>
            </tr>
          </thead>
          <tbody>
            {owned.map((n) => (
              <tr key={n.sid}>
                <td>{n.e164}</td>
                <td>{n.trunkSid ? 'Yes' : 'No'}</td>
                <td>{n.sid.slice(0, 8)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h2>Assignment / Routing (tenant)</h2>
        <label>
          Tenant
          <select
            value={routingTenantId}
            onChange={(e) => setRoutingTenantId(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '0.5rem' }}
          >
            {activeTenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
        </label>
        <table>
          <thead>
            <tr>
              <th>E.164</th>
              <th>Status</th>
              <th>Trunk</th>
              <th>Destination</th>
            </tr>
          </thead>
          <tbody>
            {tenantNumbers.map((n) => (
              <tr key={n.id}>
                <td>{n.e164}</td>
                <td>{n.status}</td>
                <td>{n.onTwilioTrunk ? 'Attached' : 'Not attached'}</td>
                <td>{n.destinationType ?? '—'}</td>
              </tr>
            ))}
            {tenantNumbers.length === 0 ? (
              <tr>
                <td colSpan={4}>No numbers assigned to this tenant yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="card">
          <h2>Confirm purchase and assignment</h2>
          <ul>
            <li>Number: {selected.e164}</li>
            <li>Trunk: Twilio Production</li>
            <li>Regulatory: {selected.regulatoryStatus === 'requires_regulatory_setup' ? 'Requires regulatory setup' : 'None'}</li>
            <li>Monthly price: {selected.monthlyPrice ?? 'See Twilio console'}</li>
          </ul>
          <label>
            Tenant
            <select
              value={assignmentTenantId}
              onChange={(e) => {
                setAssignmentTenantId(e.target.value);
                setDestinationValue('');
                setDestinationsError(null);
              }}
              style={{ display: 'block', width: '100%', marginBottom: '0.5rem' }}
            >
              <option value="">Select tenant…</option>
              {activeTenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
          </label>
          {assignmentTenant ? (
            <p className="muted" style={{ marginTop: '-0.25rem', marginBottom: '0.75rem' }}>
              Assigning to {assignmentTenant.name} ({assignmentTenant.slug})
            </p>
          ) : null}
          <label>
            Assignment target
            <select
              value={destinationType}
              onChange={(e) => {
                setDestinationType(e.target.value as typeof destinationType);
                setDestinationValue('');
              }}
              style={{ display: 'block', width: '100%', marginBottom: '0.5rem' }}
              disabled={!assignmentTenantId}
            >
              <option value="extension">Extension</option>
              <option value="ai_agent">AI agent</option>
              <option value="voicemail">Voicemail</option>
              <option value="reserve_only">Reserve only</option>
            </select>
          </label>
          <p className="muted" style={{ marginTop: '-0.25rem', marginBottom: '0.75rem' }}>
            IVR, queue, and ring group routing are coming soon — telephony config does not generate live routes for those targets yet.
          </p>
          {destinationType === 'extension' || destinationType === 'voicemail' ? (
            <label>
              {destinationType === 'voicemail' ? 'Voicemail extension' : 'Extension'}
              {destinationsLoading ? (
                <p className="muted" style={{ margin: '0.5rem 0' }}>
                  Loading destinations…
                </p>
              ) : null}
              {destinationsError ? <ErrorAlert message={destinationsError} /> : null}
              {!destinationsLoading && assignmentTenantId && destinationOptions.length === 0 && !destinationsError ? (
                <p className="muted" style={{ margin: '0.5rem 0' }}>
                  No active extensions found for this tenant.
                </p>
              ) : null}
              <select
                value={destinationValue}
                onChange={(e) => setDestinationValue(e.target.value)}
                style={{ display: 'block', width: '100%', marginBottom: '0.5rem' }}
                disabled={!assignmentTenantId || destinationsLoading || destinationOptions.length === 0}
              >
                {destinationOptions.map((destination) => (
                  <option key={destination.id} value={destination.value}>
                    {destination.label}
                  </option>
                ))}
              </select>
            </label>
          ) : destinationType === 'ai_agent' ? (
            <label>
              AI agent
              {destinationsLoading ? (
                <p className="muted" style={{ margin: '0.5rem 0' }}>
                  Loading destinations…
                </p>
              ) : null}
              {destinationsError ? <ErrorAlert message={destinationsError} /> : null}
              {!destinationsLoading && assignmentTenantId && destinationOptions.length === 0 && !destinationsError ? (
                <p className="muted" style={{ margin: '0.5rem 0' }}>
                  No active AI agents found for this tenant.
                </p>
              ) : null}
              <select
                value={destinationValue}
                onChange={(e) => setDestinationValue(e.target.value)}
                style={{ display: 'block', width: '100%', marginBottom: '0.5rem' }}
                disabled={!assignmentTenantId || destinationsLoading || destinationOptions.length === 0}
              >
                {destinationOptions.map((destination) => (
                  <option key={destination.id} value={destination.value}>
                    {destination.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Outbound caller ID policy
            <select value={callerIdPolicy} onChange={(e) => setCallerIdPolicy(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '0.5rem' }}>
              <option value="tenant_default">Use as tenant default outbound caller ID</option>
              <option value="extension_only">Extension only</option>
              <option value="inbound_only">Inbound only</option>
            </select>
          </label>
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} />
            I confirm purchase and assignment of this number (charges apply)
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                busy ||
                !confirmChecked ||
                selectedBlocked ||
                !assignmentTenantId ||
                (destinationType !== 'reserve_only' && !destinationValue)
              }
              onClick={() => void purchaseAndAssign()}
            >
              Purchase and assign number
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSelected(null);
                setConfirmChecked(false);
                setAssignmentTenantId('');
              }}
            >
              Cancel
            </button>
          </div>
          {selectedBlocked ? (
            <p style={{ marginTop: '0.75rem', color: '#b42318' }}>
              This number requires Twilio regulatory/address setup before purchase.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
