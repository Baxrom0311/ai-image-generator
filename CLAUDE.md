# Qovun Sayli AI Photo Booth

Festival uchun AI interaktiv foto kiosk. Mehmonlar ovoz orqali AI bilan suhbatlashadi, kamera suratga oladi va Gemini rasm yaratadi.

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + TypeScript + Tailwind CSS 3
- **AI**: Google Gemini API (`@google/genai`)
  - `gemini-3.6-flash` — chat + speech-to-text
  - `gemini-3.1-flash-image` — image generation (img2img)
  - `gemini-2.5-flash-preview-tts` — text-to-speech (Uzbek)
- **QR Code**: `qrcode.react`

## Commands

- `cd ai-booth && npm install` — install dependencies
- `npm run dev` — start dev server (http://localhost:3000)
- `npx next build` — production build
- `npm run start` — start production server

## Project Structure

- `ai-booth/components/Booth.tsx` — main UI component (camera, mic, phases, QR)
- `ai-booth/app/api/chat/route.ts` — Gemini chat API (structured JSON response)
- `ai-booth/app/api/generate/route.ts` — Gemini image generation (img2img)
- `ai-booth/app/api/speak/route.ts` — Gemini TTS (Uzbek, PCM→WAV)
- `ai-booth/app/api/transcribe/route.ts` — Gemini STT (audio→text)
- `ai-booth/app/api/image/[id]/route.ts` — serves generated images
- `ai-booth/app/globals.css` — Tailwind + kiosk styles
- `ai-booth/.env.local` — `GEMINI_API_KEY`

## Key Configuration

- `GEMINI_API_KEY` in `.env.local`
- TTS voice: `Orus` (configurable via `GEMINI_TTS_VOICE` env var)
- Kiosk mode: Chrome flags `--use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required`
