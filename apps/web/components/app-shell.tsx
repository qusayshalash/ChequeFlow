'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ComponentType, type SVGProps } from 'react';

import { useApi, useTranslator } from '@/components/providers';
import { Permission } from '@cheque-flow/shared-types';

import {
  IconBell,
  IconBranch,
  IconCalendar,
  IconCheque,
  IconChevronDown,
  IconChevronEnd,
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
  /** Hidden unless the signed-in user holds this. Absent means always shown. */
  permission?: Permission;
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
  // Beside the due list because it answers the next question: not just what is
  // due, but what to put in an envelope this morning.
  { href: '/reports/deposit-slip', labelKey: 'nav.depositSlip', Icon: IconReports },
];

const SECONDARY_NAV: NavItem[] = [
  { href: '/notifications', labelKey: 'nav.notifications', Icon: IconBell },
  { href: '/contacts', labelKey: 'nav.contacts', Icon: IconContacts },
  { href: '/branches', labelKey: 'nav.branches', Icon: IconBranch },
  { href: '/locations', labelKey: 'nav.locations', Icon: IconSafe },
  {
    href: '/reports',
    labelKey: 'nav.reports',
    Icon: IconReports,
    permission: Permission.REPORT_VIEW,
  },
  {
    href: '/users',
    labelKey: 'nav.users',
    Icon: IconUsers,
    permission: Permission.USER_MANAGE,
  },
  {
    href: '/roles',
    labelKey: 'nav.roles',
    Icon: IconShield,
    permission: Permission.USER_MANAGE,
  },
  {
    href: '/settings',
    labelKey: 'nav.settings',
    Icon: IconSettings,
    permission: Permission.SETTINGS_MANAGE,
  },
];

const COLLAPSED_KEY = 'chequeflow.sidebarCollapsed';

/**
 * Responsive shell: a sidebar on desktop, a drawer on mobile.
 *
 * The sidebar collapses to icons on wide screens and remembers the choice —
 * someone who works in the cheque table all day wants the width back, and
 * wants it to stay back tomorrow.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslator();
  const pathname = usePathname();
  const router = useRouter();
  const api = useApi();
  const { data: user } = useSession();

  /**
   * Offering a page that will answer with a permission error is worse than not
   * offering it, so entries the user cannot use are not rendered at all.
   */
  const permitted = (items: NavItem[]): NavItem[] =>
    items.filter(
      (item) => !item.permission || (user?.permissions.includes(item.permission) ?? false),
    );
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  // Starts expanded and corrects itself after mount. Reading storage during
  // render would make the server and the first client paint disagree.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === 'true');
    } catch {
      // A browser refusing storage is not a reason to fail to render.
    }
  }, []);

  function toggleCollapsed(): void {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, String(next));
      } catch {
        // The choice still applies for this session.
      }
      return next;
    });
  }

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
          const label = t(labelKey);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? 'page' : undefined}
                // Collapsed, the icon is the only thing left, so the label has
                // to survive as the accessible name and as a hover tooltip.
                aria-label={collapsed ? label : undefined}
                title={collapsed ? label : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-xl text-[15px] transition-colors ${
                  collapsed ? 'lg:justify-center lg:px-0' : ''
                } px-3 ${
                  active
                    ? 'bg-teal-50 font-semibold text-teal-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={active ? 'text-teal-700' : 'text-slate-400'} />
                <span className={collapsed ? 'lg:hidden' : ''}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
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
        className={`${menuOpen ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-slate-200 bg-white p-4 transition-[width] lg:flex lg:border-e ${
          collapsed ? 'lg:w-[84px]' : 'lg:w-[264px]'
        }`}
        aria-label={t('nav.dashboard')}
      >
        <div
          className={`mb-6 hidden items-center gap-2.5 pt-2 lg:flex ${
            collapsed ? 'justify-center px-0' : 'px-2'
          }`}
        >
          <IconLogo className="shrink-0 text-teal-700" />
          <span className={`text-xl font-bold text-teal-800 ${collapsed ? 'hidden' : ''}`}>
            {t('common.appName')}
          </span>
        </div>

        {/* Desktop only: on mobile the drawer already opens and closes. */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-controls="main-nav"
          title={collapsed ? t('nav.expandMenu') : t('nav.collapseMenu')}
          className={`mb-3 hidden min-h-9 items-center gap-2 rounded-lg text-sm text-slate-400 hover:bg-slate-50 hover:text-slate-600 lg:flex ${
            collapsed ? 'justify-center px-0' : 'px-3'
          }`}
        >
          <IconChevronEnd
            width="18"
            height="18"
            // The chevron points the way the panel will move, which in a
            // right-to-left layout is the mirror of the left-to-right case.
            className={`transition-transform ${collapsed ? 'rotate-180' : ''}`}
          />
          <span className={collapsed ? 'hidden' : ''}>{t('nav.collapseMenu')}</span>
        </button>

        {renderNav(permitted(PRIMARY_NAV))}

        <div className="my-4 border-t border-slate-100" />

        {renderNav(permitted(SECONDARY_NAV))}

        {/* The account sits at the very bottom, out of the way of the work. */}
        <div className="mt-auto pt-4">
          <div
            className={`rounded-2xl border border-slate-200 bg-white p-2 ${collapsed ? 'lg:border-0 lg:p-0' : ''}`}
          >
            <button
              type="button"
              onClick={() => setAccountOpen((open) => !open)}
              aria-expanded={accountOpen}
              aria-label={collapsed ? (user?.name ?? t('nav.users')) : undefined}
              title={collapsed ? (user?.name ?? undefined) : undefined}
              className={`flex w-full items-center gap-3 rounded-xl py-2 text-start hover:bg-slate-50 ${
                collapsed ? 'lg:justify-center lg:px-0' : 'px-2'
              }`}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <IconUser />
              </span>
              <span className={`min-w-0 flex-1 ${collapsed ? 'lg:hidden' : ''}`}>
                <span className="block truncate text-sm font-semibold text-slate-800">
                  {user?.name ?? '—'}
                </span>
                <span className="block truncate text-xs tracking-wide text-slate-400">
                  {user?.roles[0] ?? ''}
                </span>
              </span>
              <IconChevronDown
                className={`shrink-0 text-slate-400 transition-transform ${accountOpen ? 'rotate-180' : ''} ${
                  collapsed ? 'lg:hidden' : ''
                }`}
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
