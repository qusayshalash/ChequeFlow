import type { Metadata, Viewport } from 'next';

import { getDirection } from '@cheque-flow/localization';

import { Providers } from '@/components/providers';
import { defaultLocale } from '@/lib/config';
import { THEME_BOOT_SCRIPT } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'شيك فلو — إدارة الشيكات',
  description: 'نظام تتبع الشيكات وحركتها داخل الشركة',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = defaultLocale();

  return (
    // The theme script below sets data-theme on this element before React
    // hydrates; the server cannot know it, so the difference is expected here
    // and only here (the flag covers this element's attributes, not its tree).
    <html lang={locale} dir={getDirection(locale)} suppressHydrationWarning>
      <head>
        {/*
          Runs before the first paint, which is the whole point: a theme
          applied from a React effect arrives after the browser has already
          drawn the page, and the person watches the system's theme flash
          before their own replaces it.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
