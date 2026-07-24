import { readFile } from 'fs/promises'
import path from 'path'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const sanitized = id.replace(/[^a-zA-Z0-9-]/g, '')
    const filePath = path.join(process.cwd(), 'generated', `${sanitized}.png`)
    const file = await readFile(filePath)
    return new Response(file, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
