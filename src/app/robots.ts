// src/app/robots.ts
import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/history', '/bookmarks', '/profile', '/login', '/search'],
      },
    ],
    sitemap: 'https://fanzoom.ir/sitemap.xml',
    host: 'https://fanzoom.ir',
  };
}
