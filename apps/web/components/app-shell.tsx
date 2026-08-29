'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@cheque-flow/ui';

import { useApi, useTranslator } from '@/components/providers';
import { useSession } from '@/components/session';

interface NavItem {
  href: string;
  labelKey: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard' },
  { href: '/cheques', labelKey: 'nav.cheques' },
  { href: '/cheques/review', labelKey: 'nav.review' },
  { href: '/cheques/due', labelKey: 'nav.due' },
  { href: '/cheques/bounced', labelKey: 'nav.bounced' },
  { href: '/contacts', labelKey: 'nav.contacts' },
  { href: '/branches', labelKey: 'nav.branches' },
  { href: '/locations', labelKey: 'nav.locations' },
  { href: '/reports', labelKey: 'nav.reports' },
  { href: '/users', labelKey: 'nav.users' },
  { href: '/roles', labelKey: 'nav.roles' },
  { href: '/settings', labelKey: 'nav.settings' },
];

/** Responsive shell: a sidebar on desktop, a collapsible drawer on mobile. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslator();
  const pathname = usePathname();
  const router = useRouter();
  const api = useApi();
  const { data: user } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout(): Promise<void> {
    try {
      await api.logout();
    } finally {
      router.replace('/login');
    }
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white p-4 lg:hidden">
        <span className="text-lg font-semibold text-teal-900">{t('common.appName')}</span>
        <button
          type="button"
          className="min-h-12 min-w-12 rounded-lg border border-slate-300 px-3"
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          ☰
        </button>
      </header>

      <nav
        id="main-nav"
        className={`${menuOpen ? 'block' : 'hidden'} w-full shrink-0 border-e border-slate-200 bg-white p-4 lg:block lg:w-64`}
        aria-label={t('nav.dashboard')}
      >
        <div className="mb-6 hidden text-lg font-semibold text-teal-900 lg:block">
          {t('common.appName')}
        </div>

        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-12 items-center rounded-lg px-3 text-base ${
                    active
                      ? 'bg-teal-50 font-medium text-teal-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 border-t border-slate-200 pt-4">
          {user ? (
            <p className="mb-3 text-sm text-slate-600">
              {user.name}
              <span className="block text-xs text-slate-500">{user.roles.join('، ')}</span>
            </p>
          ) : null}
          <Button variant="secondary" onClick={() => void handleLogout()} className="w-full">
            {t('common.logout')}
          </Button>
        </div>
      </nav>

      <main className="flex-1 p-4 lg:p-8">{children}</main>
    </div>
  );
}
