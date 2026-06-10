import Link from 'next/link';

export default function AccessDeniedPage() {
  return (
    <main style={{ maxWidth: 520, margin: '4rem auto', padding: '0 1rem' }}>
      <div className="card">
        <h1>Access denied</h1>
        <p>You do not have permission to view this page or tenant.</p>
        <Link href="/" className="btn btn-secondary">
          Go home
        </Link>
      </div>
    </main>
  );
}
