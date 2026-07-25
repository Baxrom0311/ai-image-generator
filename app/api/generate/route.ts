import { GoogleGenAI } from '@google/genai'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const { prompt, photo } = await req.json()

    if (!prompt) return Response.json({ error: 'No prompt' }, { status: 400 })
    if (!photo) return Response.json({ error: 'No photo' }, { status: 400 })

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${prompt}\n\nIMPORTANT: Transform the person in this photo according to the description above. Preserve the person's face identity and facial features. Create a high quality, photorealistic result.`,
            },
            {
              inlineData: { mimeType: 'image/jpeg', data: photo },
            },
          ],
        },
      ],
      config: { responseModalities: ['IMAGE', 'TEXT'] },
    })

    if (!response.candidates?.[0]) {
      return Response.json({ error: 'Gemini javob bermadi' }, { status: 500 })
    }

    const parts = response.candidates[0].content?.parts
    let imageBase64 = ''

    if (parts) {
      for (const part of parts) {
        if (part.inlineData) imageBase64 = part.inlineData.data as string
      }
    }

    if (!imageBase64) {
      return Response.json({ error: 'Rasm yaratilmadi' }, { status: 500 })
    }

    // Save to filesystem
    const id = randomUUID()
    const dir = path.join(process.cwd(), 'generated')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, `${id}.png`), Buffer.from(imageBase64, 'base64'))

    // Save to database
    try {
      const { savePhoto } = await import('@/lib/db')
      savePhoto(id, prompt, `/api/image/${id}`)
    } catch { /* DB not available yet */ }

    return Response.json({
      image: imageBase64,
      url: `/api/image/${id}`,
    })
  } catch (e: unknown) {
    return Response.json(
      { error: `Xatolik: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }
}
