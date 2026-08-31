'use client';

import { DashboardFailure } from './observability-dashboard-states';

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <DashboardFailure onRetry={reset} />;
}
