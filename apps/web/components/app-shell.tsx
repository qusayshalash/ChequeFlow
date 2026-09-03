'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ComponentType, type SVGProps } from 'react';

import { Permission } from '@cheque-flow/shared-types';

import {
  IconBell,
  IconBranch,
  IconCalendar,
  IconCheque,
  IconChevronEnd,
  IconClose,
  IconContacts,
  IconDashboard,
  IconLogo,
  IconReports,
  IconReturn,
  IconSafe,
  IconSearch,
  IconSettings,
  IconShield,
  IconUsers,
} from '@/components/icons';

import { useTranslator } from '@/components/providers';
import { TopBar } from '@/components/top-bar';
import { useSession } from '@/components/session';

interface NavItem {
  href: string;
  labelKey: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  permission?: Permission;
}

const WORKSPACE_NAV: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', Icon: IconDashboard },
  { href: '/cheques', labelKey: 'nav.cheques', Icon: IconCheque },
  { href: '/cheques/review', labelKey: 'nav.review', Icon: IconSearch },
  { href: '/cheques/due', labelKey: 'nav.due', Icon: IconCalendar },
  { href: '/cheques/bounced', labelKey: 'nav.bounced', Icon: IconReturn },
  // Beside the due list because it answers the next question: not just what
  // is due, but what to put in an envelope this morning.
  { href: '/reports/deposit-slip', labelKey: 'nav.depositSlip', Icon: IconReports },
  { href: '/notifications', labelKey: 'nav.notifications', Icon: IconBell },
];

const MANAGEMENT_NAV: NavItem[] = [
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const t = useTranslator();
  const pathname = usePathname();
  const { data: user } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === 'true');
    } catch {
      // The shell still works when browser storage is unavailable.
    }
  }, []);

  const permitted = (items: NavItem[]): NavItem[] =>
    items.filter(
      (item) => !item.permission || (user?.permissions.includes(item.permission) ?? false),
    );

  function isActive(href: string): boolean {
    if (href === '/cheques') {
      return pathname === '/cheques' || /^\/cheques\/[^/]+$/.test(pathname);
    }
    if (href === '/reports') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function toggleCollapsed(): void {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, String(next));
      } catch {
        // The choice still applies for the current session.
      }
      return next;
    });
  }

  function renderNav(items: NavItem[], labelKey: string) {
    return (
      <section className="mt-5 first:mt-0">
        <p
          className={`mb-2 px-3 text-[11px] font-semibold tracking-[0.12em] text-white/60 ${
            collapsed ? 'lg:hidden' : ''
          }`}
        >
          {t(labelKey)}
        </p>
        <ul className="flex flex-col gap-1">
          {items.map(({ href, labelKey: itemLabelKey, Icon }) => {
            const active = isActive(href);
            const label = t(itemLabelKey);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={collapsed ? label : undefined}
                  title={collapsed ? label : undefined}
                  className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm ${
                    collapsed ? 'lg:justify-center lg:px-0' : ''
                  } ${
                    active
                      ? 'bg-white/[0.09] font-semibold text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]'
                      : 'text-[var(--app-sidebar-muted)] hover:bg-white/[0.05] hover:text-white'
                  }`}
                >
                  {active ? (
                    <span className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-emerald-400" />
                  ) : null}
                  <Icon
                    className={`shrink-0 ${
                      active ? 'text-emerald-300' : 'text-white/60 group-hover:text-white'
                    }`}
                  />
                  <span className={collapsed ? 'lg:hidden' : ''}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--app-bg)]">
      <a
        href="#main-content"
        className="fixed start-4 top-3 z-[70] -translate-y-20 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-xl focus:translate-y-0"
      >
        {t('common.skipToContent')}
      </a>
      {menuOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
          aria-label={t('common.close')}
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <aside
        id="main-nav"
        // `start-0`, not `end-0`: the drawer belongs on the side the menu
        // button is on, which in this right-to-left layout is the right — and
        // it is the side the sidebar sits on at desktop width, so the panel
        // does not jump across the screen at the breakpoint.
        //
        // Closed, it is `hidden` rather than merely pushed off-screen. A
        // drawer parked outside the viewport is still part of the document:
        // it gave every page 87px of sideways scroll on a phone, an empty
        // column the whole layout could be swiped into, and it kept its
        // seventeen links in the tab order where keyboard focus walked into a
        // menu nobody could see. Clipping the overflow away instead is not an
        // option here — in a right-to-left page it crops the side the content
        // starts on. The cost is the closing slide; the opening one still
        // plays, and a drawer that shuts instantly is a fair trade for a
        // layout that does not shift.
        className={`fixed inset-y-0 start-0 z-50 shrink-0 flex-col bg-[var(--app-sidebar)] text-white shadow-2xl transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:flex lg:h-screen lg:translate-x-0 lg:shadow-none ${
          menuOpen ? 'flex translate-x-0' : 'hidden translate-x-full'
        } ${collapsed ? 'w-[292px] lg:w-[84px]' : 'w-[292px] lg:w-[272px]'}`}
        aria-label={t('common.appName')}
      >
        <div
          className={`flex h-[76px] shrink-0 items-center border-b border-[var(--app-sidebar-line)] px-5 ${
            collapsed ? 'lg:justify-center lg:px-0' : 'justify-between'
          }`}
        >
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400 text-emerald-950 shadow-[0_8px_24px_-12px_rgb(52_211_153/0.9)]">
              <IconLogo width="23" height="23" strokeWidth="1.9" />
            </span>
            <span className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
              <span className="block truncate text-base font-bold tracking-tight text-white">
                {t('common.appName')}
              </span>
              <span className="block text-[10px] font-medium tracking-[0.18em] text-white/60">
                CHEQUE OPERATIONS
              </span>
            </span>
          </Link>

          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-xl text-white/75 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label={t('common.close')}
            onClick={() => setMenuOpen(false)}
          >
            <IconClose />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-5">
          {renderNav(permitted(WORKSPACE_NAV), 'nav.workspace')}
          <div className="my-5 border-t border-[var(--app-sidebar-line)]" />
          {renderNav(permitted(MANAGEMENT_NAV), 'nav.management')}
        </nav>

        <div className="border-t border-[var(--app-sidebar-line)] p-3">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="main-nav"
            title={collapsed ? t('nav.expandMenu') : t('nav.collapseMenu')}
            className={`mt-2 hidden min-h-10 w-full items-center gap-2 rounded-xl px-3 text-xs text-white/60 hover:bg-white/[0.05] hover:text-white lg:flex ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <IconChevronEnd width="16" height="16" className={collapsed ? 'rotate-180' : ''} />
            <span className={collapsed ? 'hidden' : ''}>{t('nav.collapseMenu')}</span>
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />

        <main id="main-content" className="min-w-0 px-4 py-6 lg:px-7 lg:py-7 xl:px-9">
          {children}
        </main>
      </div>
    </div>
  );
}
