/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    domains: ['ocixoxjozzldqldadrip.supabase.co'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.elevenlabs.io https://api.anthropic.com",
              "media-src 'self' blob: https://*.daily.co",
              "worker-src 'self' blob:",
              "frame-src 'self' https://*.daily.co",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.supabase.co",
            ].join('; ')
          }
        ]
      }
    ]
  }
}

module.exports = nextConfig
