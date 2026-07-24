import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Photo Booth',
  description: 'Interactive AI Photo Booth for festivals',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body className="bg-black text-white antialiased">{children}</body>
    </html>
  )
}
