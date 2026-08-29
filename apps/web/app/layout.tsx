import type { Metadata, Viewport } from 'next';

import { getDirection } from '@cheque-flow/localization';

import { Providers } from '@/components/providers';
import { defaultLocale } from '@/lib/config';
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
    <html lang={locale} dir={getDirection(locale)}>
      <body className="min-h-screen antialiased">
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
