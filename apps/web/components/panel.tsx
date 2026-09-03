import type { ReactNode } from 'react';

/**
 * A titled white block.
 *
 * Every section on every page uses this, so spacing and the header rule are
 * defined once instead of being re-typed with slightly different padding on
 * each page — which is how a design drifts apart.
 */
export function Panel({
  title,
  action,
  children,
  bodyClassName = 'p-5',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Set to '' for content that manages its own padding, such as a table. */
  bodyClassName?: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgb(16_24_40/0.035)]">
      {title || action ? (
        <div className="flex min-h-[66px] items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          {title ? (
            <h2 className="text-[15px] font-bold tracking-[-0.01em] text-slate-900">{title}</h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}
