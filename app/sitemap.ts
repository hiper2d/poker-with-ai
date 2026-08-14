import type { MetadataRoute } from 'next';

const BASE = 'https://pokerwithai.net';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/models`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/rules`, changeFrequency: 'monthly', priority: 0.7 },
  ];
}
