import type { Metadata } from 'next';
import type { ReactNode } from 'react';

/**
 * A shared statement is for the one person given the link: never indexed,
 * never followed, and (with the site-wide no-referrer policy) never named to
 * a site it links to.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default function SharedStatementLayout({ children }: { children: ReactNode }) {
  return children;
}
