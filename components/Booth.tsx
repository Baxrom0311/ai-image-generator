'use client'

import { useState, useRef, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'

type Phase =
  | 'loading'
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'processing'
  | 'speaking'
  | 'camera'
  | 'countdown'
  | 'generating'
  | 'result'

interface HistoryItem {
  role: 'user' | 'model'
  text: string
}

interface AIResponse {
  message: string
  action: string
  enhancedPrompt: string
}

export default function Booth() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [aiText, setAiText] = useState('')
  const [userText, setUserText] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [count, setCount] = useState(0)
  const [timer, setTimer] = useState(0)
  const [error, setError] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const historyRef = useRef<HistoryItem[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const timerRef = useRef<any>(null)
  const photoRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  // ── Wake Lock ────────────────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lock: any = null
    const acquire = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lock = await (navigator as any).wakeLock?.request('screen')
      } catch { /* not supported */ }
    }
    acquire()
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      lock?.release()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // ── Init ─────────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    init()
    return () => {
      mountedRef.current = false
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const GREETING = 'Assalomu alaykum! Qovun sayliga xush kelibsiz! Esda qolarli va qiziqarli rasmga tushishga tayyormisiz? Siz bugun qanday qahramon bo\'lmoqchisiz?'

  async function init() {
    setPhase('loading')
    setError('')
    setAiText('')
    setImage(null)
    setImageUrl(null)
    setUserText('')
    historyRef.current = []
    photoRef.current = null

    // Hardcoded greeting — tezroq, API call kerak emas
    historyRef.current.push({ role: 'model', text: JSON.stringify({ message: GREETING, action: 'none', enhancedPrompt: '' }) })
    if (!mountedRef.current) return
    setAiText(GREETING)
    setPhase('speaking')
    await speakText(GREETING)
    if (mountedRef.current) setPhase('idle')
  }

  // ── Chat API ─────────────────────────────────────────
  async function chatAPI(input: string): Promise<AIResponse> {
    historyRef.current.push({ role: 'user', text: input })

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history: historyRef.current }),
    })

    if (!res.ok) {
      historyRef.current.pop()
      throw new Error(`API ${res.status}`)
    }

    const data: AIResponse = await res.json()
    historyRef.current.push({ role: 'model', text: JSON.stringify(data) })
    return data
  }

  // ── Handle AI Response ───────────────────────────────
  async function handleAI(data: AIResponse) {
    setAiText(data.message)

    switch (data.action) {
      case 'show_camera':
        // Speak va kamerani parallel ochish — 5-6s tejash
        setPhase('speaking')
        await Promise.all([speakText(data.message), openCamera()])
        if (mountedRef.current) setPhase('camera')
        break

      case 'capture':
        // Avval gapirsin, keyin capture
        setPhase('speaking')
        await speakText(data.message)
        if (!mountedRef.current) return
        await doCapture()
        break

      case 'generate':
        if (data.enhancedPrompt && photoRef.current) {
          // Speak va generate parallel — 5-6s tejash
          setPhase('generating')
          await Promise.all([
            speakText(data.message),
            doGenerate(data.enhancedPrompt, photoRef.current),
          ])
        } else {
          setPhase('speaking')
          await speakText(data.message)
          if (mountedRef.current) {
            setError("Surat olinmagan. Qaytadan urinib ko'ring.")
            setPhase('idle')
          }
        }
        break

      case 'reset':
        setPhase('speaking')
        await speakText(data.message)
        if (mountedRef.current) doReset()
        break

      default:
        setPhase('speaking')
        await speakText(data.message)
        if (mountedRef.current) setPhase(streamRef.current ? 'camera' : 'idle')
    }
  }

  // ── Audio Recording (MediaRecorder → Gemini STT) ────
  async function startRecording() {
    setError('')
    // AI gapirayotgan bo'lsa to'xtat
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      })
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        // Stop mic stream
        micStreamRef.current?.getTracks().forEach(t => t.stop())
        micStreamRef.current = null

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        if (blob.size < 1000) {
          // Too short — probably no speech
          if (mountedRef.current) setPhase(streamRef.current ? 'camera' : 'idle')
          return
        }

        // Convert to base64
        const buffer = await blob.arrayBuffer()
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        )

        // Transcribe via Gemini
        if (mountedRef.current) setPhase('transcribing')
        try {
          const res = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio: base64, mimeType: 'audio/webm' }),
          })
          const data = await res.json()
          const text = (data.text || '').trim()

          if (!text || !mountedRef.current) {
            if (mountedRef.current) setPhase(streamRef.current ? 'camera' : 'idle')
            return
          }

          setUserText(text)
          setPhase('processing')

          const aiRes = await chatAPI(text)
          if (mountedRef.current) {
            setUserText('')
            await handleAI(aiRes)
          }
        } catch {
          if (mountedRef.current) {
            setError("Ovoz tanilmadi. Qaytadan urinib ko'ring.")
            setPhase(streamRef.current ? 'camera' : 'idle')
          }
        }
      }

      recorder.start()
      setPhase('recording')
    } catch {
      setError("Mikrofonga ruxsat berilmadi. Brauzer sozlamalarini tekshiring.")
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
  }

  // ── Text-to-Speech (Gemini TTS) ──────────────────────
  async function speakText(text: string): Promise<void> {
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) return

      const audioBlob = await res.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      await new Promise<void>((resolve) => {
        const audio = audioRef.current
        if (!audio) return resolve()

        audio.src = audioUrl
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl)
          resolve()
        }
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl)
          resolve()
        }
        audio.play().catch(() => resolve())
      })
    } catch {
      // TTS failed silently — not critical
    }
  }

  // ── Camera ───────────────────────────────────────────
  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      setCameraOpen(true)
      // Wait a tick for React to render the video element
      await new Promise(r => setTimeout(r, 50))
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch {
      setError("Kameraga ruxsat berilmadi.")
    }
  }

  function closeCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraOpen(false)
    if (videoRef.current) videoRef.current.srcObject = null
  }

  async function doCapture() {
    setPhase('countdown')
    for (let i = 3; i >= 1; i--) {
      if (!mountedRef.current) return
      setCount(i)
      await delay(1000)
    }
    setCount(0)

    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) { setPhase('idle'); return }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    const photo = canvas.toDataURL('image/jpeg', 0.9)
    console.log('[doCapture] photo dataURL length:', photo.length)
    photoRef.current = photo
    closeCamera()

    setPhase('processing')
    try {
      const res = await chatAPI('__PHOTO_TAKEN__')
      if (mountedRef.current) await handleAI(res)
    } catch {
      if (mountedRef.current) {
        setError("Xatolik yuz berdi")
        setPhase('idle')
      }
    }
  }

  // ── Image Generation ─────────────────────────────────
  async function doGenerate(prompt: string, photo: string) {
    console.log('[doGenerate] photo param length:', photo.length)
    console.log('[doGenerate] photo starts with:', photo.substring(0, 50))
    const photoBase64 = photo.includes(',') ? photo.split(',')[1] : photo
    console.log('[doGenerate] photoBase64 length:', photoBase64.length)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, photo: photoBase64 }),
      })
      const data = await res.json()
      if (!res.ok || !data.image) throw new Error(data.error || 'No image')

      if (!mountedRef.current) return
      setImage(`data:image/jpeg;base64,${data.image}`)
      setImageUrl(data.url || null)
      setPhase('result')
      const msg = "Rasmingiz tayyor! QR kodni skanerlang."
      setAiText(msg)
      await speakText(msg)
      startResetTimer()
    } catch {
      if (mountedRef.current) {
        setError("Rasm yaratishda xatolik. Qaytadan urinib ko'ring.")
        setPhase('idle')
      }
    }
  }

  // ── Timer & Reset ────────────────────────────────────
  function startResetTimer() {
    let sec = 30
    setTimer(sec)
    timerRef.current = setInterval(() => {
      sec--
      setTimer(sec)
      if (sec <= 0) doReset()
    }, 1000)
  }

  function doReset() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    closeCamera()
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    try { mediaRecorderRef.current?.stop() } catch { /* */ }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }

    setCount(0)
    setTimer(0)
    setUserText('')
    setError('')
    init()
  }

  function cleanup() {
    if (timerRef.current) clearInterval(timerRef.current)
    closeCamera()
    micStreamRef.current?.getTracks().forEach(t => t.stop())
    try { mediaRecorderRef.current?.stop() } catch { /* */ }
  }

  function delay(ms: number) {
    return new Promise(r => setTimeout(r, ms))
  }

  // ── Render ───────────────────────────────────────────
  const micVisible = phase === 'idle' || phase === 'camera' || phase === 'recording' || phase === 'speaking'
  const cameraVisible = cameraOpen && phase !== 'generating' && phase !== 'result' && phase !== 'loading'

  return (
    <main className="fixed inset-0 bg-black flex flex-col items-center overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,229,255,0.04),transparent_70%)]" />

      {/* Hidden audio element for TTS playback */}
      <audio ref={audioRef} className="hidden" />

      <div className="relative z-10 flex flex-col items-center justify-between h-full w-full max-w-5xl px-6 py-8 md:py-12">

        {/* ─── TOP: AI Message ─── */}
        <div className="flex-shrink-0 text-center min-h-[60px] md:min-h-[100px] flex items-center justify-center px-4">
          {aiText && phase !== 'loading' && (
            <p
              key={aiText}
              className="text-xl sm:text-2xl md:text-4xl font-light text-white leading-relaxed animate-fade-in max-w-3xl"
            >
              {aiText}
            </p>
          )}
        </div>

        {/* ─── CENTER ─── */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full min-h-0">

          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              <p className="text-white/30 text-sm">Yuklanmoqda...</p>
            </div>
          )}

          <div className={`relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl w-full max-w-2xl aspect-video bg-gray-900 ${cameraVisible ? '' : 'hidden'}`}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            {phase === 'countdown' && count > 0 && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm">
                <span className="text-[10rem] font-bold text-white drop-shadow-2xl animate-bounce">{count}</span>
              </div>
            )}
          </div>

          {phase === 'speaking' && (
            <div className="flex items-end justify-center gap-1.5 h-10">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="w-1.5 bg-accent/50 rounded-full animate-wave" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
          )}

          {phase === 'generating' && (
            <div className="flex flex-col items-center gap-6">
              <div className="relative w-24 h-24">
                <div className="absolute inset-0 border-4 border-accent/20 rounded-full" />
                <div className="absolute inset-0 border-4 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-xl text-white/50">Rasm yaratilmoqda...</p>
              <p className="text-sm text-white/20">10-30 soniya kutib turing</p>
            </div>
          )}

          {phase === 'result' && image && (
            <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 animate-fade-in max-h-[70vh]">
              <img src={image} alt="" className="rounded-3xl max-h-[50vh] md:max-h-[60vh] shadow-2xl border border-white/10 object-contain" />
              <div className="flex flex-col items-center gap-3">
                {imageUrl && (
                  <div className="bg-white p-3 rounded-2xl shadow-lg">
                    <QRCodeSVG value={`${typeof window !== 'undefined' ? window.location.origin : ''}${imageUrl}`} size={140} />
                  </div>
                )}
                <p className="text-sm text-white/20">QR kodni skanerlang</p>
                <p className="text-base text-white/30 tabular-nums font-mono">{timer}s</p>
              </div>
            </div>
          )}

          {phase === 'recording' && (
            <div className="flex items-end justify-center gap-[3px] h-16">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="w-1 bg-red-400 rounded-full animate-wave" style={{ animationDelay: `${i * 0.06}s`, animationDuration: `${0.35 + Math.random() * 0.4}s` }} />
              ))}
            </div>
          )}

          {(phase === 'transcribing' || phase === 'processing') && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex gap-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-3 h-3 bg-accent rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <p className="text-sm text-white/20">
                {phase === 'transcribing' ? "Ovoz tanilmoqda..." : "O'ylayapman..."}
              </p>
            </div>
          )}

          {userText && (
            <p className="text-lg text-white/40 italic text-center animate-fade-in">&ldquo;{userText}&rdquo;</p>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-6 py-3 animate-fade-in">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* ─── BOTTOM: Controls ─── */}
        <div className="flex-shrink-0 flex flex-col items-center gap-3 min-h-[140px] md:min-h-[160px] justify-center">
          {micVisible && (
            <>
              <button
                onClick={phase === 'recording' ? stopRecording : startRecording}
                className={`
                  w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-full
                  flex items-center justify-center transition-all duration-300
                  ${phase === 'recording'
                    ? 'bg-red-500/20 border-2 border-red-400 shadow-[0_0_40px_rgba(239,68,68,0.3)] scale-110'
                    : 'bg-accent/10 border-2 border-accent/40 shadow-[0_0_30px_rgba(0,229,255,0.15)] hover:border-accent hover:bg-accent/15 hover:scale-105 active:scale-95'
                  }
                `}
              >
                {phase === 'recording' ? (
                  /* Stop icon */
                  <div className="w-8 h-8 md:w-9 md:h-9 bg-red-400 rounded-md" />
                ) : (
                  /* Mic icon */
                  <svg className="w-8 h-8 md:w-10 md:h-10 text-accent" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                )}
              </button>
              <p className={`text-xs md:text-sm ${phase === 'recording' ? 'text-red-400/60' : 'text-white/25'}`}>
                {phase === 'recording' ? "To'xtatish uchun bosing" : "Bosing va gapiring"}
              </p>
            </>
          )}

          {phase === 'result' && (
            <button
              onClick={doReset}
              className="px-6 py-2.5 rounded-full bg-accent/10 border border-accent/30 text-accent text-sm hover:bg-accent/20 active:scale-95 transition-all"
            >
              Yangi surat
            </button>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </main>
  )
}
