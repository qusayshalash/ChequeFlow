'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { IconBell } from '@/components/icons';
import { useApi, useTranslator } from '@/components/providers';

/**
 * The reminder count, read from the feed rather than hardcoded.
 *
 * Only reminders whose moment has arrived are counted: a badge that includes
 * next month's reminders is a number nobody can ever clear, and a badge you
 * cannot clear stops being read.
 */
export function NotificationBell() {
  const api = useApi();
  const t = useTranslator();

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.listNotifications(50),
    // The feed changes on its own as reminders come due.
    refetchInterval: 60_000,
  });

  const due = (query.data?.data ?? []).filter((row) => row.isDue).length;

  return (
    <Link
      href="/notifications"
      aria-label={`${t('nav.notifications')}${due > 0 ? ` (${due})` : ''}`}
      className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
    >
      <IconBell />
      {due > 0 ? (
        <span className="absolute -top-1 -end-1 flex min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 px-1 text-[10px] font-bold text-white tabular-nums">
          {due > 99 ? '99+' : due}
        </span>
      ) : null}
    </Link>
  );
}
