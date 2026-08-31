import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';
import { requireAppAdmin } from '@/lib/admin/access';
import { beginServerRequest } from '@/lib/observability/request-context';
import { AdminAccessManager } from './admin-access-manager';

export const metadata: Metadata = {
  title: 'مدیریت دسترسی مدیران',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminAccessPage() {
  const requestHeaders = await headers();
  const context = beginServerRequest({ headers: requestHeaders }, '/admin/access');
  const access = await requireAppAdmin(context, {
    minimumRole: 'owner',
    rateLimitPolicies: ['admin-access-read.visitor', 'admin-access-read.user'],
  });
  if (!access.ok) {
    if (access.response.status === 401) redirect('/login?redirect=/admin/access');
    if (access.response.status === 403) forbidden();
    throw new Error('admin_access_unavailable');
  }

  return <AdminAccessManager />;
}
