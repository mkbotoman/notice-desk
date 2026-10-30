import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  // The seed loader reads data/seed at runtime, which file tracing cannot see.
  outputFileTracingIncludes: { '/*': ['./data/seed/**/*'] },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
