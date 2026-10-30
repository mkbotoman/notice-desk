'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const FRAME = { width: 480, height: 224 };

/** Series colours live here as CSS variables so the chart and its legend read the same values. */
function Frame({
  label,
  legend,
  children,
}: {
  label: string;
  legend?: React.ReactNode;
  children: React.ReactElement;
}) {
  return (
    <div className="flex flex-col gap-3 [--c1:var(--color-navy)] [--c2:#eb6834] [--c3:#1baf7a]">
      {legend}
      <div role="img" aria-label={label} className="h-56 w-full text-xs text-muted-foreground">
        <ResponsiveContainer width="100%" height="100%" initialDimension={FRAME}>
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const axes = (
  <>
    <CartesianGrid vertical={false} stroke="var(--border)" />
    <XAxis
      dataKey="label"
      tickLine={false}
      stroke="var(--border)"
      tick={{ fill: 'currentColor' }}
    />
    <YAxis
      allowDecimals={false}
      width={28}
      tickLine={false}
      axisLine={false}
      tick={{ fill: 'currentColor' }}
    />
  </>
);

export function MonthlyBars({
  data,
  label,
}: {
  data: { label: string; count: number }[];
  label: string;
}) {
  return (
    <Frame label={label}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        {axes}
        <Tooltip cursor={false} />
        <Bar
          dataKey="count"
          name="Cases sent"
          fill="var(--c1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
          isAnimationActive={false}
        />
      </BarChart>
    </Frame>
  );
}

export interface ActivitySeries {
  key: 'notes' | 'stageChanges' | 'ownerChanges';
  name: string;
  /** The CSS variable on the chart frame that holds this series' colour. */
  color: '--c1' | '--c2' | '--c3';
}

export const ACTIVITY_SERIES: ActivitySeries[] = [
  { key: 'notes', name: 'Notes', color: '--c1' },
  { key: 'stageChanges', name: 'Stage changes', color: '--c2' },
  { key: 'ownerChanges', name: 'Owner changes', color: '--c3' },
];

const SWATCH = { '--c1': 'bg-(--c1)', '--c2': 'bg-(--c2)', '--c3': 'bg-(--c3)' } as const;

export function ActivityBars({
  data,
  label,
}: {
  data: { label: string; notes: number; stageChanges: number; ownerChanges: number }[];
  label: string;
}) {
  return (
    <Frame
      label={label}
      legend={
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
          {ACTIVITY_SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-3 rounded-sm ${SWATCH[s.color]}`} />
              {s.name}
            </li>
          ))}
        </ul>
      }
    >
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        {axes}
        <Tooltip cursor={false} />
        {ACTIVITY_SERIES.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stackId="activity"
            fill={`var(${s.color})`}
            stroke="var(--card)"
            strokeWidth={2}
            maxBarSize={36}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </Frame>
  );
}
