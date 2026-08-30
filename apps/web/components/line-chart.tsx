'use client';

export interface ChartSeries {
  label: string;
  /** One value per point, aligned with `labels`. */
  values: number[];
  color: string;
  /** Fills the area under the line, for the series being emphasised. */
  fill?: string;
}

/**
 * A small line chart, drawn as SVG.
 *
 * Hand-rolled rather than pulled from a charting library: this draws two
 * series over four points, and a charting package would add hundreds of
 * kilobytes and its own opinions about right-to-left layout for that.
 *
 * The chart is decorative in the accessibility sense — the same figures are in
 * the table below it — so it is hidden from screen readers and summarised in
 * text instead.
 */
export function LineChart({
  series,
  labels,
  axisLabel,
  height = 220,
}: {
  series: ChartSeries[];
  labels: string[];
  axisLabel?: string;
  height?: number;
}) {
  const width = 640;
  const padding = { top: 16, end: 12, bottom: 34, start: 46 };
  const plotWidth = width - padding.start - padding.end;
  const plotHeight = height - padding.top - padding.bottom;

  const allValues = series.flatMap((entry) => entry.values);
  const rawMax = Math.max(...allValues, 0);
  // Round the ceiling up to something a person would choose, so the gridlines
  // land on readable numbers instead of 17,431.
  const max = rawMax === 0 ? 1 : niceCeiling(rawMax);

  const stepCount = Math.max(labels.length - 1, 1);
  const x = (index: number) => padding.start + (plotWidth * index) / stepCount;
  const y = (value: number) => padding.top + plotHeight - (plotHeight * value) / max;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[520px]"
        role="img"
        aria-hidden="true"
      >
        {gridLines.map((ratio) => {
          const lineY = padding.top + plotHeight * (1 - ratio);
          return (
            <g key={ratio}>
              <line
                x1={padding.start}
                x2={width - padding.end}
                y1={lineY}
                y2={lineY}
                stroke="#EEF1F4"
                strokeWidth="1"
              />
              <text
                x={padding.start - 10}
                y={lineY + 4}
                textAnchor="end"
                className="fill-slate-400"
                fontSize="11"
              >
                {compact(max * ratio)}
              </text>
            </g>
          );
        })}

        {series.map((entry) => {
          const points = entry.values.map((value, index) => `${x(index)},${y(value)}`);
          return (
            <g key={entry.label}>
              {entry.fill ? (
                <polygon
                  points={[
                    `${x(0)},${padding.top + plotHeight}`,
                    ...points,
                    `${x(entry.values.length - 1)},${padding.top + plotHeight}`,
                  ].join(' ')}
                  fill={entry.fill}
                />
              ) : null}
              <polyline
                points={points.join(' ')}
                fill="none"
                stroke={entry.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {entry.values.map((value, index) => (
                <circle
                  key={index}
                  cx={x(index)}
                  cy={y(value)}
                  r="4"
                  fill={entry.color}
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
              ))}
            </g>
          );
        })}

        {labels.map((label, index) => (
          <text
            key={label}
            x={x(index)}
            y={height - 12}
            textAnchor="middle"
            className="fill-slate-400"
            fontSize="11"
          >
            {label}
          </text>
        ))}

        {axisLabel ? (
          <text x={padding.start - 38} y={12} className="fill-slate-400" fontSize="10">
            {axisLabel}
          </text>
        ) : null}
      </svg>
    </div>
  );
}

/** 17,431 -> 20,000, so the top gridline is a number someone would say aloud. */
function niceCeiling(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / (magnitude / 2)) * (magnitude / 2);
}

/** 20000 -> "20K"; axis labels have no room for the full figure. */
function compact(value: number): string {
  if (value >= 1000) return `${Math.round(value / 100) / 10}K`.replace('.0K', 'K');
  return String(Math.round(value));
}
