import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FunnelStageChart, RecommendationTrend } from './observability-charts';
import { MetricCard, IssuesTable } from './observability-dashboard';
import { DashboardEmpty, DashboardFailure, DashboardLoading } from './observability-dashboard-states';

describe('observability dashboard UI states and semantics', () => {
  it('exposes accessible loading, empty and failure states', () => {
    const loading = renderToStaticMarkup(<DashboardLoading />);
    const empty = renderToStaticMarkup(<DashboardEmpty windowLabel="۲۴ ساعت گذشته" />);
    const failure = renderToStaticMarkup(<DashboardFailure onRetry={() => undefined} />);
    expect(loading).toContain('aria-busy="true"');
    expect(empty).toContain('داده‌ای در این بازه پیدا نشد');
    expect(failure).toContain('role="alert"');
    expect(failure).toContain('تلاش دوباره');
  });

  it('puts the metric definition and denominator next to every KPI', () => {
    const markup = renderToStaticMarkup(
      <MetricCard
        label="نرخ خطا"
        value="۲٪"
        unit="درصد"
        denominator="۱۰۰ پاسخ"
        definition="پاسخ 5xx تقسیم بر تمام پاسخ‌ها"
        icon="error"
      />,
    );
    expect(markup).toContain('aria-label="تعریف نرخ خطا"');
    expect(markup).toContain('مخرج: ۱۰۰ پاسخ');
    expect(markup).toContain('پاسخ 5xx تقسیم بر تمام پاسخ‌ها');
  });

  it('does not rely on color alone for funnel and trend charts', () => {
    const stages = { served: 10, impression: 8, open: 4, engaged: 2 };
    const conversion = {
      servedToImpression: 0.8,
      impressionToOpen: 0.5,
      openToEngaged: 0.5,
      servedToEngaged: 0.2,
    };
    const funnel = renderToStaticMarkup(<FunnelStageChart stages={stages} conversion={conversion} />);
    const trend = renderToStaticMarkup(<RecommendationTrend trend={[
      { timestamp: '2026-08-31T11:00:00.000Z', stages },
      { timestamp: '2026-08-31T12:00:00.000Z', stages: { ...stages, engaged: 3 } },
    ]} windowKey="24h" />);
    expect(funnel).toContain('role="img"');
    expect(funnel).toContain('تحویل‌شده: 10');
    expect(trend).toContain('<title id="trend-svg-title">');
    expect(trend).toContain('<desc id="trend-svg-desc">');
    expect(trend).toContain('stroke-dasharray');
    expect(trend).toContain('<circle');
  });

  it('renders only the safe incident schema in the mobile-scrollable table', () => {
    const markup = renderToStaticMarkup(<IssuesTable issues={[{
      timestamp: '2026-08-31T11:00:00.000Z',
      eventName: 'pocketbase_failure',
      route: '/api/recommended',
      statusCode: 503,
      errorCode: 'pb_unavailable',
      requestId: '550e8400-e29b-41d4-a716-446655440000',
    }]} />);
    expect(markup).toContain('overflow-x-auto');
    expect(markup).toContain('incidentهای اخیر بدون اطلاعات شخصی');
    expect(markup).not.toMatch(/email|userId|token|cookie/i);
  });
});
