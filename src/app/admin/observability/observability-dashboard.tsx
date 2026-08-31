'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, type IconName } from '@/components/Icon';
import type { AppAdminRole } from '@/lib/admin/access';
import type {
  ObservabilityDashboardData,
  ObservabilityFilters,
  ObservabilityTab,
  SafeOperationalIssue,
} from '@/lib/observability/dashboard-types';
import {
  BreakdownBars,
  FunnelStageChart,
  RecommendationTrend,
} from './observability-charts';
import {
  DashboardEmpty,
  DashboardFailure,
  DashboardLoading,
} from './observability-dashboard-states';

const count = new Intl.NumberFormat('fa-IR');
const decimal = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('fa-IR', { style: 'percent', maximumFractionDigits: 1 });
const dateTime = new Intl.DateTimeFormat('fa-IR', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tehran',
});

const TABS: Array<{ key: ObservabilityTab; label: string; icon: IconName }> = [
  { key: 'overview', label: 'نمای کلی', icon: 'space_dashboard' },
  { key: 'recommendations', label: 'پیشنهادها', icon: 'conversion_path' },
  { key: 'quality', label: 'کیفیت داده', icon: 'fact_check' },
  { key: 'system', label: 'سیستم', icon: 'dns' },
];

const WINDOW_LABELS = { '24h': '۲۴ ساعت گذشته', '7d': '۷ روز گذشته', '30d': '۳۰ روز گذشته' };
const SURFACE_LABELS: Record<string, string> = { all: 'همه‌ی سطح‌ها', home: 'خانه', for_you: 'برای شما' };

function formatDate(value: string | null) {
  return value ? dateTime.format(new Date(value)) : 'بدون نمونه';
}

function formatPercent(value: number | null) {
  return value === null ? '—' : percent.format(value);
}

function statusTone(status: 'good' | 'warn' | 'bad' | 'neutral') {
  if (status === 'good') return 'border-primary/40 bg-primary-container text-on-primary-container';
  if (status === 'bad') return 'border-error/40 bg-error/10 text-error';
  if (status === 'warn') return 'border-[var(--cat-amber)]/40 bg-[color-mix(in_srgb,var(--cat-amber)_12%,transparent)] text-on-surface';
  return 'border-outline-variant bg-surface-low text-on-surface';
}

export function MetricCard({
  label,
  value,
  unit,
  denominator,
  definition,
  icon,
  status = 'neutral',
}: {
  label: string;
  value: string;
  unit: string;
  denominator: string;
  definition: string;
  icon: IconName;
  status?: 'good' | 'warn' | 'bad' | 'neutral';
}) {
  return (
    <article className={`cyber-card min-h-40 rounded-2xl border p-4 shadow-1 ${statusTone(status)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-surface/60" aria-hidden="true">
          <Icon name={icon} className="text-xl" />
        </div>
        <details className="group relative">
          <summary
            className="grid h-8 w-8 cursor-pointer list-none place-items-center rounded-full hover:bg-on-surface/10 focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={`تعریف ${label}`}
          >
            <Icon name="info" className="text-lg text-on-surface-variant" />
          </summary>
          <div className="absolute left-0 z-20 mt-2 w-64 rounded-xl border border-outline-variant bg-surface p-3 text-xs leading-6 text-on-surface shadow-3">
            {definition}
          </div>
        </details>
      </div>
      <p className="mt-4 text-sm font-bold text-on-surface-variant">{label}</p>
      <p className="mt-1 font-mono text-2xl font-black text-on-surface" dir="ltr">{value}</p>
      <p className="mt-1 text-xs text-on-surface-variant">{unit}</p>
      <p className="mt-3 border-t border-outline-variant/60 pt-2 text-[11px] leading-5 text-on-surface-variant">
        مخرج: {denominator}
      </p>
    </article>
  );
}

export function IssuesTable({ issues }: { issues: SafeOperationalIssue[] }) {
  if (issues.length === 0) {
    return <p className="rounded-2xl bg-surface-low p-6 text-center text-on-surface-variant">incident قابل نمایش وجود ندارد.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-outline-variant">
      <table className="min-w-[760px] w-full text-right text-sm">
        <caption className="sr-only">incidentهای اخیر بدون اطلاعات شخصی</caption>
        <thead className="bg-surface-low text-xs text-on-surface-variant">
          <tr>
            <th scope="col" className="px-4 py-3">زمان</th>
            <th scope="col" className="px-4 py-3">رخداد</th>
            <th scope="col" className="px-4 py-3">route</th>
            <th scope="col" className="px-4 py-3">وضعیت</th>
            <th scope="col" className="px-4 py-3">کد خطا</th>
            <th scope="col" className="px-4 py-3">requestId امن</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/60">
          {issues.map((issue, index) => (
            <tr key={`${issue.requestId ?? 'none'}-${issue.eventName}-${index}`} className="bg-surface-container hover:bg-surface-container-high">
              <td className="whitespace-nowrap px-4 py-3">{formatDate(issue.timestamp)}</td>
              <td className="px-4 py-3 font-mono text-xs">{issue.eventName}</td>
              <td className="px-4 py-3 font-mono text-xs" dir="ltr">{issue.route}</td>
              <td className="px-4 py-3 font-mono">{count.format(issue.statusCode)}</td>
              <td className="px-4 py-3 font-mono text-xs">{issue.errorCode ?? '—'}</td>
              <td className="max-w-52 truncate px-4 py-3 font-mono text-xs" dir="ltr" title={issue.requestId ?? undefined}>
                {issue.requestId ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`cyber-card rounded-3xl bg-surface-container p-5 shadow-1 md:p-6 ${className}`}>{children}</section>;
}

function Overview({ data }: { data: ObservabilityDashboardData }) {
  const definitions = Object.fromEntries(data.definitions.map((definition) => [definition.id, definition]));
  const healthGood = data.overview.health === 'healthy';
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" aria-label="شاخص‌های کلیدی سلامت">
        <MetricCard
          label="سلامت PocketBase"
          value={healthGood ? 'سالم' : 'ناسالم'}
          unit="health و schema مورد انتظار"
          denominator="آخرین health probe"
          definition="دسترسی PocketBase و وجود field/ruleهای مورد انتظار را بررسی می‌کند؛ جزئیات داخلی عمومی نمی‌شوند."
          icon={healthGood ? 'check_circle' : 'error'}
          status={healthGood ? 'good' : 'bad'}
        />
        <MetricCard
          label="نرخ خطای سرور"
          value={formatPercent(data.overview.errorRate)}
          unit={`${count.format(data.overview.responses5xx)} خطا`}
          denominator={`${count.format(data.overview.totalResponses)} پاسخ`}
          definition={definitions.errorRate?.definition ?? ''}
          icon="error"
          status={(data.overview.errorRate ?? 0) > 0.02 ? 'bad' : 'good'}
        />
        <MetricCard
          label="پاسخ‌های 429"
          value={count.format(data.overview.responses429)}
          unit="پاسخ محدودشده"
          denominator={`${count.format(data.overview.totalResponses)} پاسخ`}
          definition={definitions.responses429?.definition ?? ''}
          icon="speed"
          status={data.overview.responses429 > 0 ? 'warn' : 'good'}
        />
        <MetricCard
          label="پاسخ‌های 5xx"
          value={count.format(data.overview.responses5xx)}
          unit="خطای سرور"
          denominator={`${count.format(data.overview.totalResponses)} پاسخ`}
          definition={definitions.responses5xx?.definition ?? ''}
          icon="report"
          status={data.overview.responses5xx > 0 ? 'bad' : 'good'}
        />
        <MetricCard
          label="تاخیر p95"
          value={data.overview.p95LatencyMs === null ? '—' : decimal.format(data.overview.p95LatencyMs)}
          unit="میلی‌ثانیه"
          denominator={`${count.format(data.overview.latencySamples)} نمونه`}
          definition={definitions.p95Latency?.definition ?? ''}
          icon="timer"
          status={(data.overview.p95LatencyMs ?? 0) > 1000 ? 'warn' : 'neutral'}
        />
        <MetricCard
          label="نرخ مطالعه معتبر"
          value={formatPercent(data.overview.engagedReadRate)}
          unit="engaged / open"
          denominator={`${count.format(data.funnel.stages.open)} open معتبر`}
          definition={definitions.engagedReadRate?.definition ?? ''}
          icon="auto_stories"
          status="neutral"
        />
        <MetricCard
          label="نرخ feed خالی"
          value={formatPercent(data.overview.emptyFeedRate)}
          unit={`${count.format(data.overview.emptyFeeds)} feed خالی`}
          denominator={`${count.format(data.overview.recommendedResponses)} پاسخ feed`}
          definition={definitions.emptyFeedRate?.definition ?? ''}
          icon="inbox"
          status={(data.overview.emptyFeedRate ?? 0) > 0.05 ? 'warn' : 'neutral'}
        />
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel><FunnelStageChart stages={data.funnel.stages} conversion={data.funnel.conversion} /></Panel>
        <Panel><RecommendationTrend trend={data.trend} windowKey={data.window.key} /></Panel>
      </div>
    </div>
  );
}

function Recommendations({ data }: { data: ObservabilityDashboardData }) {
  const bySurface = Object.values(data.breakdowns.reduce<Record<string, { label: string; served: number; open: number; engaged: number }>>((acc, row) => {
    const current = acc[row.surface] ?? { label: SURFACE_LABELS[row.surface] ?? row.surface, served: 0, open: 0, engaged: 0 };
    current.served += row.stages.served;
    current.open += row.stages.open;
    current.engaged += row.stages.engaged;
    acc[row.surface] = current;
    return acc;
  }, {}));
  const byAlgorithm = Object.values(data.breakdowns.reduce<Record<string, { label: string; served: number; open: number; engaged: number }>>((acc, row) => {
    const current = acc[row.algorithmVersion] ?? { label: row.algorithmVersion, served: 0, open: 0, engaged: 0 };
    current.served += row.stages.served;
    current.open += row.stages.open;
    current.engaged += row.stages.engaged;
    acc[row.algorithmVersion] = current;
    return acc;
  }, {}));

  return (
    <div className="space-y-6">
      <Panel><FunnelStageChart stages={data.funnel.stages} conversion={data.funnel.conversion} /></Panel>
      <Panel><RecommendationTrend trend={data.trend} windowKey={data.window.key} /></Panel>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <BreakdownBars title="مقایسه‌ی surfaceها" subtitle="حجم served و نرخ engaged/open؛ مخرج هر ردیف مستقل است." rows={bySurface} />
        </Panel>
        <Panel>
          <BreakdownBars title="مقایسه‌ی نسخه‌های الگوریتم" subtitle="فقط attribution کامل؛ نسخه‌های بدون داده نمایش داده نمی‌شوند." rows={byAlgorithm} />
        </Panel>
      </div>
    </div>
  );
}

function Quality({ data }: { data: ObservabilityDashboardData }) {
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="شاخص‌های کیفیت داده">
        <MetricCard label="پوشش attribution" value={formatPercent(data.quality.coverageRate)} unit="attributed / funnel" denominator={`${count.format(data.quality.funnelEvents)} event قیف`} definition="سهم eventهای قیف با tuple کامل توصیه از کل eventهای یکتای قیف." icon="verified" />
        <MetricCard label="duplicate" value={count.format(data.quality.duplicateEvents)} unit="رکورد اضافه" denominator={`${count.format(data.source.eventRowsRead)} ردیف خوانده‌شده`} definition="retry یا رکورد اضافه با userId و idempotencyKey تکراری؛ کلید در خروجی نمایش داده نمی‌شود." icon="content_copy" status={data.quality.duplicateEvents ? 'warn' : 'good'} />
        <MetricCard label="attribution ناقص" value={count.format(data.quality.incompleteEvents)} unit="event ناسازگار" denominator={`${count.format(data.quality.funnelEvents)} event قیف`} definition="سطح recommendation بدون tuple کامل، یا attribution روی سطح direct/non-recommendation." icon="link_off" status={data.quality.incompleteEvents ? 'warn' : 'good'} />
        <MetricCard label="رد attribution جعلی" value={count.format(data.quality.rejectedInvalidAttributions)} unit="رد سمت سرور" denominator="logهای invalid_attribution در بازه" definition="درخواست‌هایی که consistency سمت سرور آن‌ها را به‌عنوان attribution نامعتبر رد کرده است." icon="gpp_bad" status={data.quality.rejectedInvalidAttributions ? 'warn' : 'good'} />
        <MetricCard label="event مستقیم" value={count.format(data.quality.directEvents)} unit="direct بدون attribution" denominator={`${count.format(data.quality.funnelEvents)} event قیف`} definition="مطالعه‌های مستقیم معتبر که عمداً با recommendation attribution مخلوط نشده‌اند." icon="open_in_new" />
        <MetricCard label="شکست جزئی served" value={count.format(data.quality.servedPartialFailures)} unit="batch متاثر" denominator="logهای served_partial_failure" definition="batchهایی که بخشی از writeهای served آن‌ها شکست خورده است؛ retry idempotent باقی می‌ماند." icon="rule" status={data.quality.servedPartialFailures ? 'bad' : 'good'} />
      </section>
      <Panel>
        <h2 className="text-xl font-black">کنترل سازگاری</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-surface-low p-4"><p className="text-sm text-on-surface-variant">event ناسازگار با توالی</p><p className="mt-2 font-mono text-2xl font-black">{count.format(data.quality.inconsistentEvents)}</p></div>
          <div className="rounded-2xl bg-surface-low p-4"><p className="text-sm text-on-surface-variant">event ناقص/بدون زمان</p><p className="mt-2 font-mono text-2xl font-black">{count.format(data.quality.malformedEvents)}</p></div>
          <div className="rounded-2xl bg-surface-low p-4"><p className="text-sm text-on-surface-variant">log ناقص/بدون زمان</p><p className="mt-2 font-mono text-2xl font-black">{count.format(data.quality.malformedLogs)}</p></div>
        </div>
      </Panel>
      <Panel>
        <h2 className="mb-4 text-xl font-black">مشکلات اخیر بدون PII</h2>
        <IssuesTable issues={data.quality.recentIssues} />
      </Panel>
    </div>
  );
}

function System({ data }: { data: ObservabilityDashboardData }) {
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="خطای PocketBase" value={count.format(data.system.pocketBaseFailures)} unit="failure یکتا" denominator="logهای pocketbase_failure" definition="شکست دسترسی یا عملیات PocketBase که در routeها به کد محدود تبدیل شده است." icon="database" status={data.system.pocketBaseFailures ? 'bad' : 'good'} />
        <MetricCard label="خطای views اتمیک" value={count.format(data.system.atomicViewFailures)} unit="failure یکتا" denominator="logهای atomic_view_failure" definition="شکست hook اتمیک افزایش بازدید؛ متن exception نمایش داده نمی‌شود." icon="visibility" status={data.system.atomicViewFailures ? 'bad' : 'good'} />
        <MetricCard label="validation ردشده" value={count.format(data.system.eventValidationFailures)} unit="درخواست" denominator="logهای event_validation_failed" definition="payloadهای recommendation event که validation قرارداد را نگذرانده‌اند." icon="data_alert" status={data.system.eventValidationFailures ? 'warn' : 'good'} />
        <MetricCard label="consent rejection" value={count.format(data.system.consentRejections)} unit="درخواست" denominator="logهای consent_rejection" definition="ارسال event در زمانی که personalization کاربر خاموش بوده است." icon="privacy_tip" status={data.system.consentRejections ? 'warn' : 'good'} />
      </section>
      <Panel>
        <h2 className="text-xl font-black">Shared rate limiter</h2>
        <p className="mt-1 text-sm text-on-surface-variant">فقط شمارنده‌های aggregate نمایش داده می‌شوند؛ key hash، شناسه‌ی کاربر، IP و secret هرگز وارد پاسخ نیستند.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="تصمیم مجاز" value={count.format(data.system.sharedRateLimit.allowed)} unit="bucket decision" denominator="logهای shared limiter در بازه" definition="تعداد bucketهای policy که quota کافی داشته‌اند." icon="check_circle" status="good" />
          <MetricCard label="تصمیم ردشده" value={count.format(data.system.sharedRateLimit.denied)} unit="bucket decision" denominator="logهای shared limiter در بازه" definition="تعداد bucketهایی که quota نداشته‌اند؛ در enforce به 429 منجر می‌شوند." icon="gpp_bad" status={data.system.sharedRateLimit.denied ? 'warn' : 'good'} />
          <MetricCard label="p95 latency hook" value={data.system.sharedRateLimit.p95HookLatencyMs === null ? '—' : decimal.format(data.system.sharedRateLimit.p95HookLatencyMs)} unit="ms" denominator={`${count.format(data.system.sharedRateLimit.hookLatencySamples)} check`} definition="صدک ۹۵ زمان رفت‌وبرگشت Next.js تا hook مشترک PocketBase." icon="speed" status="neutral" />
          <MetricCard label="fail-closed" value={count.format(data.system.sharedRateLimit.failClosed)} unit="درخواست" denominator="شکست backend در mode enforce" definition="درخواست privileged که به‌علت unavailable بودن limiter با 503 متوقف شده است." icon="shield" status={data.system.sharedRateLimit.failClosed ? 'bad' : 'good'} />
          <MetricCard label="active buckets" value={data.system.sharedRateLimit.activeBuckets === null ? '—' : count.format(data.system.sharedRateLimit.activeBuckets)} unit="bucket" denominator="snapshot امضاشده‌ی hook" definition="bucketهای منقضی‌نشده‌ی فعلی در SQLite." icon="database" status="neutral" />
          <MetricCard label="cleanup backlog" value={data.system.sharedRateLimit.cleanupBacklog === null ? '—' : count.format(data.system.sharedRateLimit.cleanupBacklog)} unit="row منقضی" denominator="bucket و decision منقضی" definition="رکوردهای منتظر پاک‌سازی batch بعدی." icon="history" status={data.system.sharedRateLimit.cleanupBacklog ? 'warn' : 'good'} />
          <MetricCard label="SQLite busy" value={count.format(data.system.sharedRateLimit.sqliteBusy)} unit="رخداد" denominator="logهای limiter در بازه" definition="تعداد contentionهای SQLITE_BUSY مشاهده‌شده." icon="data_alert" status={data.system.sharedRateLimit.sqliteBusy ? 'bad' : 'good'} />
          <MetricCard label="بدون shared limit" value={count.format(data.system.sharedRateLimit.privilegedWithoutSharedLimiter)} unit="تلاش" denominator="همه‌ی درخواست‌های superuser" definition="guard نهایی getAdminPocketBase؛ مقدار قابل قبول همیشه صفر است." icon="gpp_bad" status={data.system.sharedRateLimit.privilegedWithoutSharedLimiter ? 'bad' : 'good'} />
        </div>
      </Panel>
      <Panel>
        <h2 className="text-xl font-black">latency و خطا براساس route</h2>
        <p className="mt-1 text-sm text-on-surface-variant">مرتب‌شده با اولویت تعداد 5xx؛ همه‌ی اعداد در بازه‌ی انتخابی هستند.</p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-outline-variant">
          <table className="min-w-[700px] w-full text-right text-sm">
            <caption className="sr-only">آمار خطا و latency routeها</caption>
            <thead className="bg-surface-low text-xs text-on-surface-variant"><tr><th className="px-4 py-3">route</th><th className="px-4 py-3">پاسخ</th><th className="px-4 py-3">5xx</th><th className="px-4 py-3">نرخ خطا</th><th className="px-4 py-3">میانگین ms</th><th className="px-4 py-3">p95 ms</th></tr></thead>
            <tbody className="divide-y divide-outline-variant/60">
              {data.system.routeStats.map((route) => (
                <tr key={route.route} className="bg-surface-container">
                  <td className="px-4 py-3 font-mono text-xs" dir="ltr">{route.route}</td>
                  <td className="px-4 py-3 font-mono">{count.format(route.responses)}</td>
                  <td className="px-4 py-3 font-mono">{count.format(route.errors5xx)}</td>
                  <td className="px-4 py-3 font-mono">{formatPercent(route.errorRate)}</td>
                  <td className="px-4 py-3 font-mono">{route.averageLatencyMs === null ? '—' : decimal.format(route.averageLatencyMs)}</td>
                  <td className="px-4 py-3 font-mono">{route.p95LatencyMs === null ? '—' : decimal.format(route.p95LatencyMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel><h2 className="mb-4 text-xl font-black">incidentهای اخیر</h2><IssuesTable issues={data.system.recentIncidents} /></Panel>
    </div>
  );
}

export function ObservabilityDashboard({
  initialFilters,
  initialTab,
  role,
}: {
  initialFilters: ObservabilityFilters;
  initialTab: ObservabilityTab;
  role: AppAdminRole;
}) {
  const router = useRouter();
  const [filters, setFilters] = useState(initialFilters);
  const [tab, setTab] = useState(initialTab);
  const [data, setData] = useState<ObservabilityDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const syncUrl = useCallback((nextFilters: ObservabilityFilters, nextTab: ObservabilityTab) => {
    const params = new URLSearchParams({
      window: nextFilters.window,
      surface: nextFilters.surface,
      algorithm: nextFilters.algorithmVersion,
      tab: nextTab,
    });
    router.replace(`/admin/observability?${params.toString()}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      setFailure(false);
      try {
        const params = new URLSearchParams({
          window: filters.window,
          surface: filters.surface,
          algorithm: filters.algorithmVersion,
        });
        const response = await fetch(`/api/admin/observability?${params.toString()}`, {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (response.status === 401) {
          window.location.assign('/login?redirect=/admin/observability');
          return;
        }
        if (!response.ok) throw new Error(`observability_${response.status}`);
        const nextData = await response.json() as ObservabilityDashboardData;
        setData(nextData);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setFailure(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [filters, refreshKey]);

  const updateFilters = (patch: Partial<ObservabilityFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    syncUrl(next, tab);
  };
  const updateTab = (next: ObservabilityTab) => {
    setTab(next);
    syncUrl(filters, next);
  };

  const isEmpty = useMemo(() => data
    ? data.quality.funnelEvents === 0 && data.overview.totalResponses === 0
    : false, [data]);

  return (
    <main className="pcb-bg min-h-screen pb-16">
      <div className="mx-auto max-w-[1500px] px-4 py-7 md:px-8 md:py-10">
        <header className="cyber-card overflow-hidden rounded-3xl bg-surface-container shadow-2">
          <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:p-7">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary-container px-3 py-1 text-xs font-bold text-on-primary-container">
                  {data?.datasetKind === 'test' ? 'داده‌ی آزمایشی' : 'منبع لوکال'}
                </span>
                <span className="rounded-full border border-outline-variant px-3 py-1 font-mono text-xs text-on-surface-variant">role: {role}</span>
                <span className="rounded-full border border-outline-variant px-3 py-1 text-xs text-on-surface-variant">UTC metrics</span>
              </div>
              <h1 className="mt-4 text-2xl font-black md:text-3xl">مرکز پایش فن‌زوم</h1>
              <p className="mt-2 max-w-2xl leading-7 text-on-surface-variant">
                سلامت سیستم و کیفیت مسیر پیشنهاد تا مطالعه‌ی معتبر؛ بدون نمایش event خام یا اطلاعات کاربران.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm text-on-surface-variant">
                <p>آخرین مشاهده</p>
                <p className="mt-1 font-mono font-bold text-on-surface">{formatDate(data?.freshness.lastObservedAt ?? null)}</p>
              </div>
              <button
                type="button"
                onClick={() => setRefreshKey((value) => value + 1)}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 font-bold text-on-primary shadow-1 disabled:cursor-wait disabled:opacity-60"
              >
                <Icon name="refresh" className={loading ? 'animate-spin text-lg' : 'text-lg'} />
                تازه‌سازی
              </button>
            </div>
          </div>
          <div className="grid gap-3 border-t border-outline-variant/70 bg-surface-low p-4 sm:grid-cols-3 md:p-5">
            <label className="text-sm font-bold">
              بازه‌ی زمانی
              <select value={filters.window} onChange={(event) => updateFilters({ window: event.target.value as ObservabilityFilters['window'] })} className="cyber-input mt-2 w-full rounded-xl px-3 py-2.5 font-normal">
                <option value="24h">۲۴ ساعت</option><option value="7d">۷ روز</option><option value="30d">۳۰ روز</option>
              </select>
            </label>
            <label className="text-sm font-bold">
              سطح نمایش
              <select value={filters.surface} onChange={(event) => updateFilters({ surface: event.target.value as ObservabilityFilters['surface'] })} className="cyber-input mt-2 w-full rounded-xl px-3 py-2.5 font-normal">
                <option value="all">همه</option><option value="home">خانه</option><option value="for_you">برای شما</option>
              </select>
            </label>
            <label className="text-sm font-bold">
              نسخه‌ی الگوریتم
              <select value={filters.algorithmVersion} onChange={(event) => updateFilters({ algorithmVersion: event.target.value })} className="cyber-input mt-2 w-full rounded-xl px-3 py-2.5 font-mono font-normal" dir="ltr">
                <option value="all">all</option>
                {(data?.availableFilters.algorithmVersions ?? []).map((algorithm) => <option key={algorithm} value={algorithm}>{algorithm}</option>)}
              </select>
            </label>
          </div>
        </header>

        <nav className="my-6 overflow-x-auto" aria-label="بخش‌های داشبورد">
          <div className="inline-flex min-w-full gap-2 rounded-2xl bg-surface-container p-2 shadow-1" role="tablist">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => updateTab(item.key)}
                className={`inline-flex min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-primary ${tab === item.key ? 'bg-primary text-on-primary shadow-1' : 'text-on-surface-variant hover:bg-on-surface/8'}`}
              >
                <Icon name={item.icon} className="text-lg" />{item.label}
              </button>
            ))}
          </div>
        </nav>

        {data && !data.source.logsAvailable && (
          <div role="status" className="mb-5 flex items-start gap-3 rounded-2xl border border-[var(--cat-amber)]/50 bg-[color-mix(in_srgb,var(--cat-amber)_10%,transparent)] p-4 text-sm leading-7">
            <Icon name="warning" className="mt-1 text-[var(--cat-amber)]" />
            log mirror محلی در دسترس نیست؛ metricهای 429، 5xx، latency و incident ممکن است نمونه نداشته باشند.
          </div>
        )}
        {data && (data.source.eventsTruncated || data.source.logsTruncated) && (
          <div role="status" className="mb-5 rounded-2xl border border-outline bg-surface-low p-4 text-sm">
            پوشش منبع به سقف ایمنی query رسیده است؛ اعداد فقط بخش خوانده‌شده را نشان می‌دهند.
          </div>
        )}

        {loading && !data ? <DashboardLoading /> : failure ? (
          <DashboardFailure onRetry={() => setRefreshKey((value) => value + 1)} />
        ) : data && isEmpty ? (
          <DashboardEmpty windowLabel={WINDOW_LABELS[filters.window]} />
        ) : data ? (
          <div role="tabpanel" aria-label={TABS.find((item) => item.key === tab)?.label}>
            {tab === 'overview' && <Overview data={data} />}
            {tab === 'recommendations' && <Recommendations data={data} />}
            {tab === 'quality' && <Quality data={data} />}
            {tab === 'system' && <System data={data} />}
          </div>
        ) : null}

        {data && (
          <footer className="mt-8 flex flex-col gap-2 rounded-2xl border border-outline-variant bg-surface-container px-4 py-3 text-xs text-on-surface-variant md:flex-row md:items-center md:justify-between">
            <p>بازه: {formatDate(data.window.start)} تا {formatDate(data.window.end)} · {data.window.timeZone}</p>
            <p>آخرین refresh: {formatDate(data.generatedAt)} · {count.format(data.source.eventRowsRead)} event · {count.format(data.source.logRowsRead)} log</p>
          </footer>
        )}
      </div>
    </main>
  );
}
