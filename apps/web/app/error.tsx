'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main style={{ maxWidth: 520, margin: '4rem auto', padding: '0 1rem' }}>
      <div className="card">
        <h1>Something went wrong</h1>
        <p className="muted">{error.message}</p>
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </main>
  );
}
