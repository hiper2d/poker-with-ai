import type { MetadataRoute } from 'next';

/** Public pages are crawlable; game rooms, profile, and APIs are auth-gated noise. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/games', '/profile'] }],
    sitemap: 'https://pokerwithai.net/sitemap.xml',
  };
}
