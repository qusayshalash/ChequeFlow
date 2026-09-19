import clsx from 'clsx';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

import { toneFor, type StatusTone } from './tokens.js';

/**
 * Presentational primitives for the web dashboard.
 *
 * They are styled with Tailwind utility classes and carry no data fetching,
 * which keeps them trivially replaceable and testable.
 */

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'border-line bg-subtle text-ink-soft',
  info: 'border-info-line bg-info-soft text-info',
  success: 'border-success-line bg-success-soft text-success',
  warning: 'border-warning-line bg-warning-soft text-warning',
  danger: 'border-danger-line bg-danger-soft text-danger',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}

/** A cheque status pill; the label is passed in already translated. */
export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge tone={toneFor(status)}>{label}</Badge>;
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
}

const BUTTON_VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'border border-primary bg-primary text-on-primary shadow-sm hover:border-primary hover:bg-primary-hover focus-visible:outline-primary',
  secondary:
    'border border-line bg-surface text-ink-soft shadow-sm hover:border-line-strong hover:bg-subtle focus-visible:outline-line-strong',
  outline:
    'border border-primary-soft bg-surface text-primary-ink hover:border-primary-soft hover:bg-primary-soft focus-visible:outline-primary',
  ghost:
    'border border-transparent bg-transparent text-ink-soft hover:bg-sunken hover:text-ink focus-visible:outline-line-strong',
  danger:
    'border border-danger-solid bg-danger-solid text-on-danger shadow-sm hover:border-danger-solid hover:bg-danger-solid focus-visible:outline-danger-solid',
};

const BUTTON_SIZES: Record<NonNullable<ButtonProps['size']>, string> = {
  sm: 'min-h-9 rounded-lg px-3 text-xs',
  md: 'min-h-11 rounded-xl px-4 text-sm',
  lg: 'min-h-12 rounded-xl px-5 text-base',
  icon: 'size-11 rounded-xl p-0',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      // 48px minimum height keeps the target comfortable on touch screens.
      className={clsx(
        'inline-flex shrink-0 items-center justify-center gap-2 font-semibold transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0',
        BUTTON_SIZES[size],
        BUTTON_VARIANTS[variant],
        className,
      )}
      disabled={disabled === true || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={clsx(
        'inline-block animate-spin rounded-full border-2 border-current border-t-transparent',
        className ?? 'size-5',
      )}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'rounded-2xl border border-line/90 bg-surface p-5 shadow-[0_1px_2px_rgb(16_24_40/0.035)]',
        className,
      )}
      {...props}
    />
  );
}

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: StatusTone;
}

export function StatCard({ label, value, hint, tone = 'neutral' }: StatCardProps) {
  return (
    <Card className={clsx('flex flex-col gap-1', tone === 'danger' && 'border-danger-line')}>
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
      {hint ? <span className="text-xs text-ink-muted">{hint}</span> : null}
    </Card>
  );
}

/** The four UI states every data view must handle. */
export function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 p-5">
      <span className="sr-only">{label}</span>
      <span className="app-skeleton h-4 w-32 rounded-md" aria-hidden="true" />
      <span className="app-skeleton h-14 w-full rounded-xl" aria-hidden="true" />
      <span className="app-skeleton h-14 w-full rounded-xl" aria-hidden="true" />
      <span className="app-skeleton h-14 w-4/5 rounded-xl" aria-hidden="true" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl border border-line bg-subtle text-ink-muted">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M4 7.5h16v12H4z" />
          <path d="M7 4.5h10l2 3H5zM8 12h8" />
        </svg>
      </span>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description ? (
        <p className="max-w-md text-sm leading-6 text-ink-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  requestId,
  onRetry,
  retryLabel,
}: {
  title: string;
  requestId?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-2xl border border-danger-line bg-danger-soft/80 p-5"
    >
      <p className="font-semibold text-danger">{title}</p>
      {requestId ? <p className="text-xs text-danger">request-id: {requestId}</p> : null}
      {onRetry && retryLabel ? (
        <Button variant="secondary" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function SuccessBanner({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-xl border border-success-line bg-success-soft px-4 py-3 text-sm font-medium text-success"
    >
      <span className="flex size-5 items-center justify-center rounded-full bg-success text-xs text-on-success">
        ✓
      </span>
      <span>{message}</span>
    </div>
  );
}

export interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, required, children }: FieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink-soft">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-danger">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? <span className="text-xs text-ink-muted">{hint}</span> : null}
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export const inputClassName =
  'min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink shadow-[0_1px_1px_rgb(16_24_40/0.02)] ' +
  'placeholder:text-ink-muted hover:border-line-strong focus:border-primary focus:outline-none focus:ring-4 ' +
  'focus:ring-primary/10 disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger-solid/10';
