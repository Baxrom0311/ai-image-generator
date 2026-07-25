import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

export async function POST(req: Request) {
  try {
    const { audio, mimeType } = await req.json()
    if (!audio) return Response.json({ error: 'No audio' }, { status: 400 })

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Transcribe this Uzbek speech to text. Only output what was said, nothing else. If silent, return empty string.' },
            { inlineData: { mimeType: mimeType || 'audio/wav', data: audio } },
          ],
        },
      ],
    })

    return Response.json({ text: (response.text ?? '').trim() })
  } catch {
    return Response.json({ error: 'Transcription failed', text: '' }, { status: 500 })
  }
}
