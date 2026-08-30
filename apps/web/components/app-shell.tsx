'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ComponentType, type SVGProps } from 'react';

import { useApi, useTranslator } from '@/components/providers';
import {
  IconBranch,
  IconCalendar,
  IconCheque,
  IconChevronDown,
  IconContacts,
  IconDashboard,
  IconLogo,
  IconReports,
  IconReturn,
  IconSafe,
  IconSearch,
  IconSettings,
  IconShield,
  IconUser,
  IconUsers,
} from '@/components/icons';
import { useSession } from '@/components/session';

interface NavItem {
  href: string;
  labelKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

/**
 * Two groups: the cheque work someone does all day, then everything they set
 * up once and rarely revisit. The separator is the point — it keeps the daily
 * five from being buried in a list of twelve.
 */
const PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', Icon: IconDashboard },
  { href: '/cheques', labelKey: 'nav.cheques', Icon: IconCheque },
  { href: '/cheques/review', labelKey: 'nav.review', Icon: IconSearch },
  { href: '/cheques/due', labelKey: 'nav.due', Icon: IconCalendar },
  { href: '/cheques/bounced', labelKey: 'nav.bounced', Icon: IconReturn },
];

const SECONDARY_NAV: NavItem[] = [
  { href: '/contacts', labelKey: 'nav.contacts', Icon: IconContacts },
  { href: '/branches', labelKey: 'nav.branches', Icon: IconBranch },
  { href: '/locations', labelKey: 'nav.locations', Icon: IconSafe },
  { href: '/reports', labelKey: 'nav.reports', Icon: IconReports },
  { href: '/users', labelKey: 'nav.users', Icon: IconUsers },
  { href: '/roles', labelKey: 'nav.roles', Icon: IconShield },
  { href: '/settings', labelKey: 'nav.settings', Icon: IconSettings },
];

/** Responsive shell: a sidebar on desktop, a collapsible drawer on mobile. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslator();
  const pathname = usePathname();
  const router = useRouter();
  const api = useApi();
  const { data: user } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  async function handleLogout(): Promise<void> {
    try {
      await api.logout();
    } finally {
      router.replace('/login');
    }
  }

  /**
   * `/cheques` must not light up while `/cheques/due` is open, so the
   * catch-all list only matches exactly; deeper pages own their own prefix.
   */
  function isActive(href: string): boolean {
    if (href === '/cheques') {
      return pathname === '/cheques' || /^\/cheques\/[^/]+$/.test(pathname);
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function renderNav(items: NavItem[]) {
    return (
      <ul className="flex flex-col gap-0.5">
        {items.map(({ href, labelKey, Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors ${
                  active
                    ? 'bg-teal-50 font-semibold text-teal-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={active ? 'text-teal-700' : 'text-slate-400'} />
                <span>{t(labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row-reverse">
      {/* Mobile header. The sidebar becomes a drawer below the lg breakpoint. */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <span className="flex items-center gap-2 text-lg font-bold text-teal-800">
          <IconLogo className="text-teal-700" />
          {t('common.appName')}
        </span>
        <button
          type="button"
          className="min-h-11 min-w-11 rounded-xl border border-slate-200 text-slate-600"
          aria-expanded={menuOpen}
          aria-controls="main-nav"
          onClick={() => setMenuOpen((open) => !open)}
        >
          ☰
        </button>
      </header>

      <nav
        id="main-nav"
        className={`${menuOpen ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-slate-200 bg-white p-4 lg:flex lg:w-[264px] lg:border-s`}
        aria-label={t('nav.dashboard')}
      >
        <div className="mb-6 hidden items-center gap-2.5 px-2 pt-2 lg:flex">
          <IconLogo className="text-teal-700" />
          <span className="text-xl font-bold text-teal-800">{t('common.appName')}</span>
        </div>

        {renderNav(PRIMARY_NAV)}

        <div className="my-4 border-t border-slate-100" />

        {renderNav(SECONDARY_NAV)}

        {/* The account sits at the very bottom, out of the way of the work. */}
        <div className="mt-auto pt-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-2">
            <button
              type="button"
              onClick={() => setAccountOpen((open) => !open)}
              aria-expanded={accountOpen}
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start hover:bg-slate-50"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <IconUser />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">
                  {user?.name ?? '—'}
                </span>
                <span className="block truncate text-xs tracking-wide text-slate-400">
                  {user?.roles[0] ?? ''}
                </span>
              </span>
              <IconChevronDown
                className={`shrink-0 text-slate-400 transition-transform ${accountOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {accountOpen ? (
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="mt-1 w-full rounded-xl px-3 py-2.5 text-start text-sm text-red-700 hover:bg-red-50"
              >
                {t('common.logout')}
              </button>
            ) : null}
          </div>
        </div>
      </nav>

      <main className="min-w-0 flex-1 p-4 lg:p-7">{children}</main>
    </div>
  );
}
