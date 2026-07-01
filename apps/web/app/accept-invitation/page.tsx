'use client';

import { FormEvent, Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ErrorAlert, LoadingBlock, PageHeader } from '@/components/app-shell';

function AcceptInvitationForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) setError('Invitation token is missing.');
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/backend/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password: password || undefined,
          displayName: displayName || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.message ?? 'Invitation acceptance failed');
      }
      setMessage('Invitation accepted. You can sign in now.');
      setTimeout(() => router.push('/login'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invitation acceptance failed');
    } finally {
      setBusy(false);
    }
  }

  if (!token) return <ErrorAlert message="Invitation token is missing." />;

  return (
    <>
      <PageHeader title="Accept invitation" description="Join your organization on the PBX portal." />
      {error ? <ErrorAlert message={error} /> : null}
      {message ? <p className="muted">{message}</p> : null}
      <section className="card" style={{ maxWidth: '28rem' }}>
        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="label">Display name</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="field">
            <label className="label">Password (new users)</label>
            <input
              className="input"
              type="password"
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Required if you do not already have an account"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Accept invitation
          </button>
        </form>
      </section>
    </>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <AcceptInvitationForm />
    </Suspense>
  );
}
