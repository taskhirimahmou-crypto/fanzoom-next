import type {
  FunnelConversion,
  FunnelStages,
  ObservabilityDashboardData,
} from '@/lib/observability/dashboard-types';

const STAGES = [
  { key: 'served', label: 'تحویل‌شده', color: 'var(--cat-blue)', dash: undefined },
  { key: 'impression', label: 'دیده‌شده', color: 'var(--cat-amber)', dash: '9 5' },
  { key: 'open', label: 'بازشده', color: 'var(--cat-violet)', dash: '3 5' },
  { key: 'engaged', label: 'مطالعه معتبر', color: 'var(--cat-green)', dash: '12 4 2 4' },
] as const;

const count = new Intl.NumberFormat('fa-IR');
const percent = new Intl.NumberFormat('fa-IR', { style: 'percent', maximumFractionDigits: 1 });

function formatPercent(value: number | null) {
  return value === null ? '—' : percent.format(value);
}

function stageRate(stage: keyof FunnelStages, stages: FunnelStages, conversion: FunnelConversion) {
  if (stage === 'served') return { value: 1, denominator: stages.served };
  if (stage === 'impression') return { value: conversion.servedToImpression, denominator: stages.served };
  if (stage === 'open') return { value: conversion.impressionToOpen, denominator: stages.impression };
  return { value: conversion.openToEngaged, denominator: stages.open };
}

export function FunnelStageChart({
  stages,
  conversion,
}: {
  stages: FunnelStages;
  conversion: FunnelConversion;
}) {
  const maximum = Math.max(1, stages.served, stages.impression, stages.open, stages.engaged);
  return (
    <figure aria-labelledby="funnel-title" className="space-y-5">
      <figcaption id="funnel-title">
        <h3 className="text-lg font-black">قیف پیشنهادها</h3>
        <p className="mt-1 text-sm text-on-surface-variant">
          تعداد event یکتای attributed؛ نرخ هر مرحله نسبت به مرحله‌ی قبلی است.
        </p>
      </figcaption>
      <div className="space-y-4">
        {STAGES.map((stage, index) => {
          const value = stages[stage.key];
          const rate = stageRate(stage.key, stages, conversion);
          return (
            <div key={stage.key} className="grid gap-2 sm:grid-cols-[8rem_1fr_8rem] sm:items-center">
              <div className="flex items-center gap-2 font-bold">
                <span
                  className="grid h-7 w-7 place-items-center rounded-full border-2 text-xs"
                  style={{ borderColor: stage.color }}
                  aria-hidden="true"
                >
                  {count.format(index + 1)}
                </span>
                {stage.label}
              </div>
              <div className="h-8 overflow-hidden rounded-full bg-surface-variant" role="img" aria-label={`${stage.label}: ${value}`}>
                <div
                  className="flex h-full min-w-2 items-center rounded-full px-3 font-mono text-xs font-black text-white"
                  style={{ width: `${Math.max(2, value / maximum * 100)}%`, backgroundColor: stage.color }}
                >
                  {value > 0 ? count.format(value) : ''}
                </div>
              </div>
              <p className="text-sm text-on-surface-variant sm:text-left">
                <strong className="font-mono text-on-surface">{formatPercent(rate.value)}</strong>
                {' '}از {count.format(rate.denominator)}
              </p>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

function points(values: number[], width: number, height: number, maximum: number) {
  if (values.length === 0) return '';
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : index / (values.length - 1) * width;
    const y = height - value / maximum * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

export function RecommendationTrend({
  trend,
  windowKey,
}: {
  trend: ObservabilityDashboardData['trend'];
  windowKey: string;
}) {
  const width = 720;
  const height = 220;
  const maximum = Math.max(1, ...trend.flatMap((bucket) => Object.values(bucket.stages)));
  const dates = trend.map((bucket) => new Date(bucket.timestamp));
  const label = (date: Date) => new Intl.DateTimeFormat('fa-IR', windowKey === '24h'
    ? { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }
    : { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date);
  const labelIndexes = [...new Set([0, Math.floor((trend.length - 1) / 2), trend.length - 1])]
    .filter((index) => index >= 0);

  return (
    <figure aria-labelledby="trend-title">
      <figcaption id="trend-title">
        <h3 className="text-lg font-black">روند مراحل قیف</h3>
        <p className="mt-1 text-sm text-on-surface-variant">
          bucketهای UTC؛ خط، dash و marker هر مرحله مستقل است.
        </p>
      </figcaption>
      <div className="mt-5 overflow-x-auto pb-2">
        <svg
          viewBox={`-55 -15 ${width + 85} ${height + 65}`}
          className="min-w-[660px]"
          role="img"
          aria-labelledby="trend-svg-title trend-svg-desc"
        >
          <title id="trend-svg-title">روند زمانی eventهای پیشنهاد</title>
          <desc id="trend-svg-desc">چهار خط برای served، impression، open و engaged با مقیاس مشترک از صفر.</desc>
          {[0, 0.5, 1].map((ratioValue) => {
            const y = height - ratioValue * height;
            return (
              <g key={ratioValue}>
                <line x1="0" x2={width} y1={y} y2={y} stroke="var(--md-outline-variant)" strokeWidth="1" />
                <text x="-12" y={y + 4} textAnchor="end" fill="var(--md-on-surface-variant)" fontSize="11">
                  {count.format(Math.round(maximum * ratioValue))}
                </text>
              </g>
            );
          })}
          {STAGES.map((stage) => {
            const values = trend.map((bucket) => bucket.stages[stage.key]);
            return (
              <g key={stage.key}>
                <polyline
                  points={points(values, width, height, maximum)}
                  fill="none"
                  stroke={stage.color}
                  strokeWidth="3"
                  strokeDasharray={stage.dash}
                  strokeLinejoin="round"
                />
                {values.map((value, index) => {
                  const x = values.length === 1 ? width / 2 : index / (values.length - 1) * width;
                  const y = height - value / maximum * height;
                  return <circle key={index} cx={x} cy={y} r="3" fill="var(--md-surface)" stroke={stage.color} strokeWidth="2" />;
                })}
              </g>
            );
          })}
          {labelIndexes.map((index) => {
            const x = trend.length <= 1 ? width / 2 : index / (trend.length - 1) * width;
            return (
              <text key={index} x={x} y={height + 28} textAnchor="middle" fill="var(--md-on-surface-variant)" fontSize="11">
                {dates[index] ? label(dates[index]) : ''}
              </text>
            );
          })}
        </svg>
      </div>
      <ul className="mt-2 flex flex-wrap gap-4 text-xs text-on-surface-variant" aria-label="راهنمای نمودار">
        {STAGES.map((stage) => (
          <li key={stage.key} className="flex items-center gap-2">
            <svg width="34" height="10" aria-hidden="true">
              <line x1="0" x2="34" y1="5" y2="5" stroke={stage.color} strokeWidth="3" strokeDasharray={stage.dash} />
            </svg>
            {stage.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function BreakdownBars({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: Array<{ label: string; served: number; engaged: number; open: number }>;
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.served));
  return (
    <figure>
      <figcaption>
        <h3 className="text-lg font-black">{title}</h3>
        <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p>
      </figcaption>
      {rows.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-surface-low p-6 text-center text-on-surface-variant">داده‌ی attributed کافی نیست.</p>
      ) : (
        <div className="mt-5 space-y-5">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-mono font-bold">{row.label}</span>
                <span className="text-on-surface-variant">
                  {count.format(row.served)} served · {formatPercent(row.open > 0 ? row.engaged / row.open : null)} engaged/open
                </span>
              </div>
              <div className="h-3 rounded-full bg-surface-variant" role="img" aria-label={`${row.label}: ${row.served} served`}>
                <div
                  className="h-full rounded-full border border-primary bg-primary-container"
                  style={{ width: `${row.served / maximum * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}
