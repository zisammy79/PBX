import Link from 'next/link';

type KpiCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'inbound' | 'outbound' | 'local' | 'missed' | 'live' | 'default';
  href?: string;
};

export function KpiCard({ label, value, hint, tone = 'default', href }: KpiCardProps) {
  const body = (
    <div className={`kpi-card kpi-card-${tone}`}>
      <div className="kpi-card-label">{label}</div>
      <div className="kpi-card-value">{value}</div>
      {hint ? <div className="kpi-card-hint">{hint}</div> : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="kpi-card-link">
        {body}
      </Link>
    );
  }

  return body;
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="kpi-grid">{children}</div>;
}
