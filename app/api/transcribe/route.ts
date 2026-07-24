import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

export async function POST(req: Request) {
  console.log('\n========== /api/transcribe ==========')
  try {
    const { audio, mimeType } = await req.json()
    console.log('[transcribe] Audio base64 length:', audio?.length || 0)
    console.log('[transcribe] MimeType:', mimeType)

    if (!audio) {
      console.error('[transcribe] ERROR: No audio')
      return Response.json({ error: 'No audio' }, { status: 400 })
    }

    const startTime = Date.now()
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Transcribe this Uzbek speech to text. Only output what was said, nothing else. If silent, return empty string.`,
            },
            {
              inlineData: {
                mimeType: mimeType || 'audio/wav',
                data: audio,
              },
            },
          ],
        },
      ],
    })

    const elapsed = Date.now() - startTime
    const text = (response.text ?? '').trim()
    console.log('[transcribe] Gemini responded in', elapsed, 'ms')
    console.log('[transcribe] Result text:', text)
    console.log('[transcribe] SUCCESS')

    return Response.json({ text })
  } catch (e: unknown) {
    console.error('[transcribe] CATCH ERROR:', e)
    if (e instanceof Error) {
      console.error('[transcribe] Error message:', e.message)
    }
    return Response.json({ error: 'Transcription failed', text: '' }, { status: 500 })
  }
}
