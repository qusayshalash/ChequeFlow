'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { NotificationBell } from '@/components/notification-bell';
import {
  IconCheque,
  IconChevronDown,
  IconLayers,
  IconLogout,
  IconMenu,
  IconPlus,
  IconSearch,
  IconSettings,
} from '@/components/icons';
import { useApi, useTranslator } from '@/components/providers';

/**
 * The bar across the top of every screen.
 *
 * Three jobs, in the order people reach for them: find a cheque, record a new
 * one, and know whose session this is. The old bar carried a breadcrumb that
 * repeated the page title already printed underneath it, and a single "new
 * cheque" link that could only make one at a time.
 */
export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const t = useTranslator();
  const api = useApi();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const createRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);

  const session = useQuery({ queryKey: ['session'], queryFn: () => api.me(), retry: false });

  /**
   * ⌘K / Ctrl-K focuses the search.
   *
   * The shortcut is printed inside the field rather than left for people to
   * discover: a shortcut nobody knows about is one nobody uses.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setCreateOpen(false);
        setAccountOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /** A menu that only closes on its own button is a menu that gets stuck open. */
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (createRef.current && !createRef.current.contains(target)) setCreateOpen(false);
      if (accountRef.current && !accountRef.current.contains(target)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  async function logout(): Promise<void> {
    try {
      await api.logout();
    } finally {
      router.replace('/login');
    }
  }

  function submitSearch(event: FormEvent): void {
    event.preventDefault();
    router.push(search ? `/cheques?search=${encodeURIComponent(search)}` : '/cheques');
  }

  const user = session.data;
  const initial = (user?.name ?? '؟').trim().charAt(0);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl lg:px-7">
      <button
        type="button"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm lg:hidden"
        aria-label={t('common.more')}
        onClick={onOpenMenu}
      >
        <IconMenu />
      </button>

      <form onSubmit={submitSearch} className="mx-auto min-w-0 flex-1 lg:max-w-xl">
        <label className="relative flex items-center">
          <span className="pointer-events-none absolute start-3 text-slate-400">
            <IconSearch width="18" height="18" />
          </span>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('dashboard.searchPlaceholder')}
            aria-label={t('common.search')}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/80 ps-10 pe-16 text-sm text-slate-800 outline-none placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10"
          />
          <kbd className="pointer-events-none absolute end-3 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-400">
            {t('common.searchShortcut')}
          </kbd>
        </label>
      </form>

      {/* A split button: the common case is one cheque, but a whole book is one
          menu item away rather than a different screen to go and find. */}
      <div ref={createRef} className="relative hidden sm:block">
        <div className="flex h-11 items-center overflow-hidden rounded-xl bg-teal-800 text-sm font-semibold text-white shadow-sm">
          <Link
            href="/cheques/new"
            className="flex h-full items-center gap-2 px-4 hover:bg-teal-900"
          >
            <IconPlus width="18" height="18" />
            <span>{t('cheque.newTitle')}</span>
          </Link>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={createOpen}
            aria-label={t('cheque.batchMode')}
            onClick={() => setCreateOpen((open) => !open)}
            className="flex h-full items-center border-s border-white/20 px-2 hover:bg-teal-900"
          >
            <IconChevronDown width="16" height="16" />
          </button>
        </div>

        {createOpen ? (
          <div
            role="menu"
            className="absolute end-0 top-13 z-40 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          >
            <Link
              role="menuitem"
              href="/cheques/new"
              onClick={() => setCreateOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <IconCheque width="18" height="18" className="text-slate-400" />
              {t('common.singleCheque')}
            </Link>
            <Link
              role="menuitem"
              href="/cheques/new?mode=batch"
              onClick={() => setCreateOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <IconLayers width="18" height="18" className="text-slate-400" />
              {t('common.chequeBatch')}
            </Link>
          </div>
        ) : null}
      </div>

      <NotificationBell />

      {/* Who is signed in, said plainly. A finance system where the acting user
          is ambiguous is one where nobody can be asked about an entry. */}
      <div ref={accountRef} className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={accountOpen}
          onClick={() => setAccountOpen((open) => !open)}
          className="flex h-11 items-center gap-2.5 rounded-xl px-1.5 hover:bg-slate-50"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-900">
            {initial}
          </span>
          <span className="hidden text-start leading-tight md:block">
            <span className="block text-sm font-semibold text-slate-900">{user?.name ?? ''}</span>
            <span className="block text-xs text-slate-500">
              {(user?.roles ?? []).map((role) => t(`role.${role}`)).join('، ')}
            </span>
          </span>
          <IconChevronDown width="16" height="16" className="hidden text-slate-400 md:block" />
        </button>

        {accountOpen ? (
          <div
            role="menu"
            className="absolute end-0 top-13 z-40 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          >
            <p className="px-3 py-2 text-xs text-slate-500">
              {t('common.signedInAs')}
              <span className="mt-0.5 block truncate font-medium text-slate-700">
                {user?.email ?? ''}
              </span>
            </p>
            <Link
              role="menuitem"
              href="/settings"
              onClick={() => setAccountOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <IconSettings width="18" height="18" className="text-slate-400" />
              {t('nav.settings')}
            </Link>
            {/* Kept apart from the rest by a rule: signing out is not a
                navigation item, and it should not sit a mis-click away. */}
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              role="menuitem"
              onClick={() => void logout()}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm text-red-600 hover:bg-red-50"
            >
              <IconLogout width="18" height="18" />
              {t('common.logout')}
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
