import { GoogleGenAI } from '@google/genai'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image'

export const maxDuration = 60

export async function POST(req: Request) {
  console.log('\n========== /api/generate ==========')
  try {
    const rawBody = await req.text()
    console.log('[generate] Raw body length:', rawBody.length)
    const { prompt, photo } = JSON.parse(rawBody)
    console.log('[generate] Model:', MODEL)
    console.log('[generate] Prompt:', prompt)
    console.log('[generate] Photo base64 length:', photo?.length || 0)
    console.log('[generate] Photo first 50 chars:', photo?.substring(0, 50))

    if (!prompt) {
      console.error('[generate] ERROR: No prompt provided')
      return Response.json({ error: 'No prompt' }, { status: 400 })
    }
    if (!photo) {
      console.error('[generate] ERROR: No photo provided')
      return Response.json({ error: 'No photo' }, { status: 400 })
    }

    console.log('[generate] Calling Gemini...')
    const startTime = Date.now()

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
              inlineData: {
                mimeType: 'image/jpeg',
                data: photo,
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['IMAGE', 'TEXT'],
      },
    })

    const elapsed = Date.now() - startTime
    console.log('[generate] Gemini responded in', elapsed, 'ms')
    console.log('[generate] Response candidates count:', response.candidates?.length ?? 0)

    if (!response.candidates || !response.candidates[0]) {
      console.error('[generate] ERROR: No candidates in response')
      console.error('[generate] Full response:', JSON.stringify(response).substring(0, 500))
      return Response.json({ error: 'Gemini javob bermadi' }, { status: 500 })
    }

    const parts = response.candidates[0].content?.parts
    console.log('[generate] Parts count:', parts?.length ?? 0)
    console.log('[generate] Part types:', parts?.map((p, i) => {
      const keys = Object.keys(p)
      if (p.inlineData) return `part[${i}]: inlineData (mime=${(p.inlineData as {mimeType?: string}).mimeType}, size=${((p.inlineData as {data?: string}).data || '').length})`
      if (p.text) return `part[${i}]: text (${(p.text as string).substring(0, 100)})`
      return `part[${i}]: ${keys.join(',')}`
    }))

    let imageBase64 = ''
    let message = ''

    if (parts) {
      for (const part of parts) {
        if (part.inlineData) {
          imageBase64 = part.inlineData.data as string
        } else if (part.text) {
          message = part.text
        }
      }
    }

    console.log('[generate] Image base64 length:', imageBase64.length)
    console.log('[generate] Message:', message)

    if (!imageBase64) {
      console.error('[generate] ERROR: No image in response parts')
      console.error('[generate] finishReason:', response.candidates[0].finishReason)
      console.error('[generate] safetyRatings:', JSON.stringify(response.candidates[0].safetyRatings))
      return Response.json({ error: 'Rasm yaratilmadi. Gemini rasm qaytarmadi.' }, { status: 500 })
    }

    // Save to filesystem for QR code access
    const id = randomUUID()
    const dir = path.join(process.cwd(), 'generated')
    await mkdir(dir, { recursive: true })
    const filePath = path.join(dir, `${id}.png`)
    await writeFile(filePath, Buffer.from(imageBase64, 'base64'))
    console.log('[generate] Saved to:', filePath)
    console.log('[generate] SUCCESS')

    return Response.json({
      image: imageBase64,
      url: `/api/image/${id}`,
      message: message || 'Rasmingiz tayyor! QR kodni skanerlang.',
    })
  } catch (e: unknown) {
    console.error('[generate] CATCH ERROR:', e)
    if (e instanceof Error) {
      console.error('[generate] Error name:', e.name)
      console.error('[generate] Error message:', e.message)
      console.error('[generate] Error stack:', e.stack)
    }
    return Response.json(
      { error: `Rasm yaratishda xatolik: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }
}
