import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts'
const TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Orus'

export async function POST(req: Request) {
  try {
    const { text } = await req.json()
    if (!text) return Response.json({ error: 'No text' }, { status: 400 })

    const response = await ai.models.generateContent({
      model: TTS_MODEL,
      contents: `Read aloud in Uzbek language with natural Uzbek pronunciation. O'zbek tilidagi so'zlarni to'g'ri talaffuz qil. "o'" is pronounced like "ö", "sh" like "sh", "ch" like "ch", "ng" like "ŋ", "g'" like "ğ", "q" is a deep "k" sound from the throat.\n\n${text}`,
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: TTS_VOICE },
          },
        },
      },
    })

    const parts = response.candidates?.[0]?.content?.parts || []
    const audioPart = parts.find((p: { inlineData?: unknown }) => p.inlineData)
    if (!audioPart?.inlineData) {
      return Response.json({ error: 'No audio generated' }, { status: 500 })
    }

    const pcmData = Buffer.from((audioPart.inlineData as { data: string }).data, 'base64')

    // PCM L16 → WAV
    const header = Buffer.alloc(44)
    header.write('RIFF', 0)
    header.writeUInt32LE(36 + pcmData.length, 4)
    header.write('WAVE', 8)
    header.write('fmt ', 12)
    header.writeUInt32LE(16, 16)
    header.writeUInt16LE(1, 20)
    header.writeUInt16LE(1, 22)
    header.writeUInt32LE(24000, 24)
    header.writeUInt32LE(48000, 28)
    header.writeUInt16LE(2, 32)
    header.writeUInt16LE(16, 34)
    header.write('data', 36)
    header.writeUInt32LE(pcmData.length, 40)

    const wav = Buffer.concat([header, pcmData])

    return new Response(wav, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': wav.length.toString(),
      },
    })
  } catch {
    return Response.json({ error: 'TTS failed' }, { status: 500 })
  }
}
