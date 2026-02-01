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
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.daily.co https://*.vapi.ai blob:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.vapi.ai https://*.daily.co wss://*.daily.co https://api.openai.com https://api.deepgram.com",
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
