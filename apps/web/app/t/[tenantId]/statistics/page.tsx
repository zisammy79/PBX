'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/app-shell';
import { Breadcrumbs } from '@/components/telephony/breadcrumbs';
import { STATISTICS_HUB_LINKS } from '@/lib/nav-config';

export default function StatisticsHubPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const links = STATISTICS_HUB_LINKS(tenantId);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: 'Dashboard', href: `/t/${tenantId}/dashboard` },
          { label: 'Statistics' },
        ]}
      />
      <PageHeader
        title="Statistics"
        description="Reports and operational metrics across your PBX."
      />
      <div className="stat-hub-grid">
        {links.map((item) => (
          <Link key={item.href} href={item.href} className="stat-hub-card">
            <h3>{item.title}</h3>
            <p>{item.description}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
