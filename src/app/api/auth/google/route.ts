import { NextRequest, NextResponse } from 'next/server';
import { getServerPocketBase } from '@/lib/auth-cookies';

export async function GET(req: NextRequest) {
  try {
    const pb = await getServerPocketBase();
    
    // PocketBase URL redirect را می‌سازد
    const authUrl = pb.buildUrl('/api/oauth2-redirect');
    
    // Redirect به Google OAuth (PocketBase خودش مدیریت می‌کند)
    return NextResponse.redirect(
      `${pb.baseUrl}/api/oauth2-redirect?provider=google`
    );
  } catch (error) {
    console.error('🔴 Google OAuth error:', error);
    return NextResponse.redirect(new URL('/login?error=oauth_failed', req.url));
  }
}