import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: false,
  serverActions: {
    bodySizeLimit: '10mb',
  },
  experimental: {
    serverActionsBodySizeLimit: '10mb',
  },
}

export default config
