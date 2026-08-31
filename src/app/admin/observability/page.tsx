import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';
import { requireAppAdmin } from '@/lib/admin/access';
import { beginServerRequest } from '@/lib/observability/request-context';
import {
  OBSERVABILITY_TABS,
  parseObservabilityFilters,
} from '@/lib/observability/metrics.mjs';
import type { ObservabilityTab } from '@/lib/observability/dashboard-types';
import { ObservabilityDashboard } from './observability-dashboard';

export const metadata: Metadata = {
  title: 'داشبورد پایش سیستم',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export default async function ObservabilityPage({ searchParams }: PageProps) {
  const requestHeaders = await headers();
  const context = beginServerRequest({ headers: requestHeaders }, '/admin/observability');
  const access = await requireAppAdmin(context, { minimumRole: 'viewer' });
  if (!access.ok) {
    if (access.response.status === 401) redirect('/login?redirect=/admin/observability');
    if (access.response.status === 403) forbidden();
    throw new Error('admin_access_unavailable');
  }

  const params = await searchParams;
  const parsed = parseObservabilityFilters({
    window: one(params.window) ?? '24h',
    surface: one(params.surface) ?? 'all',
    algorithmVersion: one(params.algorithm) ?? 'all',
  });
  const requestedTab = one(params.tab) ?? 'overview';
  if (!parsed.ok || !parsed.filters || !OBSERVABILITY_TABS.includes(requestedTab)) {
    redirect('/admin/observability?window=24h&surface=all&algorithm=all&tab=overview');
  }
  const filters = parsed.filters;

  return (
    <ObservabilityDashboard
      initialFilters={{
        window: filters.window.key,
        surface: filters.surface,
        algorithmVersion: filters.algorithmVersion,
      }}
      initialTab={requestedTab as ObservabilityTab}
      role={access.role}
    />
  );
}
