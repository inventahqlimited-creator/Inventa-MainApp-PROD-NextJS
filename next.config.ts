import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',  // Required for Docker — produces minimal self-contained build

  // Silence the Supabase realtime websocket warning in dev
  logging: {
    fetches: { fullUrl: false },
  },
}

export default nextConfig
