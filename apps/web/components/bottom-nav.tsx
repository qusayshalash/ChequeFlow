'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { IconCheque, IconContacts, IconDashboard, IconMenu, IconPlus } from '@/components/icons';
import { useTranslator } from '@/components/providers';

/**
 * The phone's navigation, along the bottom where a thumb reaches it.
 *
 * On a phone the sidebar is a drawer behind a button in the top corner: the
 * one place a thumb holding the phone does not reach, and two taps for every
 * move. The four places used all day sit here instead, with adding a cheque
 * in the middle, raised, because it is the action the app exists for; the
 * rest of the menu is one tap away under "More". Above the `lg` breakpoint
 * the sidebar is on screen and this bar is not drawn.
 */
export function BottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const t = useTranslator();
  const pathname = usePathname();
  const on = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const item = 'flex min-w-0 flex-1 flex-col items-center gap-1 pt-2 text-[11px] font-medium';
  const tone = (active: boolean) => (active ? 'text-primary-ink' : 'text-ink-muted');

  return (
    <nav
      aria-label={t('nav.mainNavigation')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="relative mx-auto flex h-16 max-w-md items-start">
        <Link
          href="/dashboard"
          className={`${item} ${tone(on('/dashboard'))}`}
          aria-current={on('/dashboard') ? 'page' : undefined}
        >
          <IconDashboard width="22" height="22" />
          {t('nav.today')}
        </Link>
        <Link
          href="/cheques"
          className={`${item} ${tone(on('/cheques') && !on('/cheques/new'))}`}
          aria-current={on('/cheques') && !on('/cheques/new') ? 'page' : undefined}
        >
          <IconCheque width="22" height="22" />
          {t('nav.cheques')}
        </Link>
        <div className="flex flex-1 justify-center">
          <Link
            href="/cheques/new"
            aria-label={t('nav.newCheque')}
            className="-mt-6 flex size-14 items-center justify-center rounded-2xl bg-primary text-on-primary shadow-lg ring-4 ring-bg"
          >
            <IconPlus width="26" height="26" />
          </Link>
        </div>
        <Link
          href="/contacts"
          className={`${item} ${tone(on('/contacts'))}`}
          aria-current={on('/contacts') ? 'page' : undefined}
        >
          <IconContacts width="22" height="22" />
          {t('nav.contacts')}
        </Link>
        <button type="button" onClick={onOpenMenu} className={`${item} ${tone(false)}`}>
          <IconMenu width="22" height="22" />
          {t('nav.more')}
        </button>
      </div>
    </nav>
  );
}
