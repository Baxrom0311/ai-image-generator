import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: false,
  serverExternalPackages: ['better-sqlite3'],
}

export default config
