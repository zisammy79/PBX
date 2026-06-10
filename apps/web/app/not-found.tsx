import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ maxWidth: 520, margin: '4rem auto', padding: '0 1rem' }}>
      <div className="card">
        <h1>Page not found</h1>
        <p>The requested page does not exist.</p>
        <Link href="/" className="btn btn-secondary">
          Go home
        </Link>
      </div>
    </main>
  );
}
