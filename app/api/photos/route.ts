import { getPhotos } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const photos = getPhotos(100)
  return Response.json(photos)
}
