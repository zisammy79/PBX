'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loginRequest, useAuth } from '@/lib/auth';
import { ErrorAlert } from '@/components/app-shell';

type ReadyHealth = {
  ready?: boolean;
  status?: string;
  dependencies?: Array<{ name: string; status: string; message?: string }>;
};

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [platformIssue, setPlatformIssue] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/v1/health/ready', { cache: 'no-store' })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as ReadyHealth | null;
        if (!body || body.ready) {
          setPlatformIssue(null);
          return;
        }
        const bad = body.dependencies?.filter((d) => d.status !== 'healthy') ?? [];
        const summary = bad
          .map((d) => `${d.name}: ${d.message ?? d.status}`)
          .slice(0, 2)
          .join(' · ');
        setPlatformIssue(
          summary
            ? `Platform services are degraded (${summary}). Sign-in may fail until this is resolved.`
            : 'Platform services are degraded. Sign-in may fail until this is resolved.',
        );
      })
      .catch(() => undefined);
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await loginRequest(email, password);
      await refresh();
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: '4rem auto', padding: '0 1rem' }}>
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Sign in</h1>
        <p className="muted">Use your tenant or platform administrator account.</p>
        {platformIssue ? (
          <div className="alert alert-warning" role="status">{platformIssue}</div>
        ) : null}
        {error ? <ErrorAlert message={error} /> : null}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
