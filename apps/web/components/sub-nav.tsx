'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { SubNavItem } from '@/lib/nav-config';

export function SubNav({ items, ariaLabel }: { items: SubNavItem[]; ariaLabel: string }) {
  const pathname = usePathname();

  return (
    <nav className="sub-nav" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`sub-nav-link${active ? ' sub-nav-link-active' : ''}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
