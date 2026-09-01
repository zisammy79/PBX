'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

const TELEPHONY_LINKS = (tenantId: string) => [
  { href: `/t/${tenantId}/dashboard`, label: 'Dashboard' },
  { href: `/t/${tenantId}/operator`, label: 'Operator' },
  { href: `/t/${tenantId}/agent`, label: 'Agent' },
  { href: `/t/${tenantId}/calls`, label: 'Call records' },
];

export function TelephonyTopBar() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const pathname = usePathname();
  const links = TELEPHONY_LINKS(tenantId);

  const showBar =
    pathname.startsWith(`/t/${tenantId}/dashboard`) ||
    pathname.startsWith(`/t/${tenantId}/calls`) ||
    pathname.startsWith(`/t/${tenantId}/extensions`) ||
    pathname.startsWith(`/t/${tenantId}/numbers`) ||
    pathname.startsWith(`/t/${tenantId}/statistics`) ||
    pathname.startsWith(`/t/${tenantId}/operator`) ||
    pathname.startsWith(`/t/${tenantId}/agent`) ||
    pathname.startsWith(`/t/${tenantId}/status`);

  if (!showBar) return null;

  return (
    <nav className="telephony-top-bar" aria-label="Telephony quick navigation">
      {links.map((link) => {
        const active =
          pathname === link.href || (link.href !== `/t/${tenantId}/dashboard` && pathname.startsWith(link.href));
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`telephony-top-link${active ? ' telephony-top-link-active' : ''}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
