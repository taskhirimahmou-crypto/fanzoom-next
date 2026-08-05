// src/app/api/views/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getPocketBase } from '@/lib/pocketbase';

export async function POST(req: NextRequest) {
  console.log('🔵 [API /views] Request received');
  
  try {
    const { id } = await req.json();
    console.log('🔵 [API /views] Article ID:', id);
    
    if (!id || typeof id !== 'string') {
      console.error('🔴 [API /views] Invalid ID');
      return NextResponse.json({ ok: false, error: 'invalid id' }, { status: 400 });
    }

    const pb = getPocketBase();
    console.log('🔵 [API /views] PocketBase instance created');

    const adminEmail = process.env.POCKETBASE_ADMIN_EMAIL;
    const adminPassword = process.env.POCKETBASE_ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.error('🔴 [API /views] MISSING ENV: POCKETBASE_ADMIN_EMAIL or POCKETBASE_ADMIN_PASSWORD');
      return NextResponse.json({ 
        ok: false, 
        error: 'admin credentials missing from environment' 
      }, { status: 500 });
    }

    console.log('🔐 [API /views] Authenticating as superuser...');
    try {
      await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
      console.log('✅ [API /views] Auth successful');
    } catch (authError: any) {
      console.error('🔴 [API /views] Auth FAILED:', authError.message);
      return NextResponse.json({ 
        ok: false, 
        error: 'admin auth failed', 
        details: authError.message 
      }, { status: 401 });
    }

    console.log('🔵 [API /views] Fetching article...');
    const article = await pb.collection('articles').getOne(id);
    const currentViews = (article as { views?: number }).views ?? 0;
    console.log('📊 [API /views] Current views:', currentViews);

    console.log('🔵 [API /views] Updating views...');
    const updated = await pb.collection('articles').update(id, {
      views: currentViews + 1,
    });
    const newViews = (updated as { views?: number }).views;
    console.log('✅ [API /views] Updated to:', newViews);

    return NextResponse.json({ ok: true, views: newViews });
  } catch (e: any) {
    console.error('🔴 [API /views] Unexpected error:', e.message);
    console.error('🔴 [API /views] Stack:', e.stack);
    return NextResponse.json({ 
      ok: false, 
      error: e.message,
      status: e.status 
    }, { status: 500 });
  }
}
