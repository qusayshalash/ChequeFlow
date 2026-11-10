'use client';

import { useEffect, useState } from 'react';

import { useTranslator } from '@/components/providers';
import {
  THEME_CHOICES,
  applyThemeChoice,
  readThemeChoice,
  storeThemeChoice,
  type ThemeChoice,
} from '@/lib/theme';

/**
 * Choosing a theme, for the people the system setting does not speak for.
 *
 * Three segments rather than a two-state toggle, because "system" is a real
 * answer and not the absence of one: it is where everybody starts, and someone
 * who tries dark for an afternoon has to be able to get back to it.
 *
 * Rendered as a radio group rather than buttons — the three are one question
 * with one answer, which is what lets the arrow keys move between them and
 * what a screen reader announces as "2 of 3" instead of three unrelated
 * controls that happen to sit together.
 *
 * The server cannot know the answer: it lives in this browser's storage, so
 * the first render marks nothing as selected and an effect fills it in. The
 * page is not painted in the wrong theme while that happens — the theme itself
 * is applied by a script in `<head>` before the first paint, and this control
 * only catches up with what is already on screen.
 */
/** `compact` fills a narrow box (the account menu) instead of sizing itself. */
export function ThemeChoiceControl({ compact = false }: { compact?: boolean }) {
  const t = useTranslator();
  const [choice, setChoice] = useState<ThemeChoice | null>(null);

  useEffect(() => {
    setChoice(readThemeChoice());
  }, []);

  const pick = (next: ThemeChoice) => {
    setChoice(next);
    storeThemeChoice(next);
    applyThemeChoice(next, document.documentElement);
  };

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      className={`${compact ? 'grid w-full grid-cols-3' : 'inline-flex'} rounded-xl border border-line bg-subtle p-1`}
    >
      {THEME_CHOICES.map((value) => {
        // Until the effect has run there is no answer to show. Marking the
        // default as chosen would be a lie for anyone who picked another.
        const selected = choice === value;

        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => pick(value)}
            className={`min-h-9 rounded-lg font-semibold ${compact ? 'px-1 text-xs' : 'min-w-20 px-3 text-sm'} ${
              selected
                ? 'bg-surface text-ink shadow-sm ring-1 ring-line'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t(`theme.${value}`)}
          </button>
        );
      })}
    </div>
  );
}
