'use client';

import { AppShell } from '@/components/app-shell';
import { RequireSession } from '@/components/session';

/** Every route in this group requires a session and renders inside the shell. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession>
      <AppShell>{children}</AppShell>
    </RequireSession>
  );
}
