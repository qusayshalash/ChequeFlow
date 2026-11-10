'use client';

import { useId } from 'react';

/**
 * The projected balance, day by day: where the running total of what comes
 * in minus what goes out stands on each day ahead.
 *
 * Unlike the flow chart this one has to go below zero, because a balance
 * that dips under it is the whole point: the day the cheques we owe outrun
 * the cheques we hold. Zero is drawn as a dashed rule, and the lowest point
 * is marked whenever it falls beneath it.
 *
 * Time runs right to left, today at the right edge, as an Arabic reader
 * reads the dates set under it. The SVG is stretched to its box, so it
 * carries no text: the labels are HTML under it, where stretching cannot
 * distort them.
 */
export function BalanceCurve({
  values,
  height = 240,
  ariaLabel,
}: {
  values: number[];
  height?: number;
  ariaLabel: string;
}) {
  // useId gives «:r1:»-style ids; a colon inside url(#…) can break the reference.
  const gradient = `curve${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const width = 900;
  if (values.length === 0) return null;

  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pad = 12;
  const plot = height - pad * 2;
  // Today at the right, time running leftward: the reading direction of the
  // page, and the order of the date labels the page sets under the curve.
  const x = (index: number) =>
    values.length === 1 ? width / 2 : width - (width * index) / (values.length - 1);
  const y = (value: number) => pad + plot - (plot * (value - min)) / span;

  const line = values
    .map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index)},${y(value)}`)
    .join(' ');
  const area = `${line} L${x(values.length - 1)},${height} L${x(0)},${height} Z`;
  const zeroY = y(0);

  const lowIndex = values.indexOf(Math.min(...values));
  const low = values[lowIndex] ?? 0;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-[240px] w-full"
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--app-primary)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--app-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line
        x1="0"
        x2={width}
        y1={zeroY}
        y2={zeroY}
        stroke="var(--app-border-strong)"
        strokeDasharray="5 7"
        vectorEffect="non-scaling-stroke"
      />
      <path d={area} fill={`url(#${gradient})`} />
      <path
        d={line}
        fill="none"
        stroke="var(--app-primary)"
        strokeWidth="3"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {low < 0 ? (
        <>
          <rect
            x={Math.min(width - 80, Math.max(0, x(lowIndex) - 40))}
            y={zeroY}
            width="80"
            height={Math.max(0, y(low) - zeroY + 8)}
            fill="var(--app-danger-soft)"
            opacity="0.7"
          />
          <line
            x1={x(lowIndex)}
            x2={x(lowIndex)}
            y1={y(low)}
            y2={y(low) + 0.01}
            stroke="var(--app-danger-solid)"
            strokeWidth="12"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : null}
    </svg>
  );
}
