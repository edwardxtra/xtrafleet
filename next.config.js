const { getBuildInfo } = require('./scripts/build-info');

const buildInfo = getBuildInfo();

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  // Build provenance, inlined at build time so /api/version can report which
  // commit is actually serving traffic (DEV-200).
  env: {
    NEXT_PUBLIC_BUILD_SHA: buildInfo.sha,
    NEXT_PUBLIC_BUILD_SHA_SOURCE: buildInfo.shaSource,
    NEXT_PUBLIC_BUILD_TIME: buildInfo.builtAt,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      // SECURITY FIX: Restrict server actions to specific domains
      allowedOrigins: [
        'https://xtrafleet.com',
        'https://xtrafleet-prd--studio-5112915880-e9ca2.us-central1.hosted.app',
        ...(process.env.NODE_ENV === 'development' 
          ? ['http://localhost:3000', 'http://localhost:9002'] 
          : []
        ),
      ]
    }
  }
};

module.exports = nextConfig;