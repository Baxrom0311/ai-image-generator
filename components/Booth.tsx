'use client'

import { useState, useRef, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import Keyboard from './Keyboard'

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

const GREETING = 'Assalomu alaykum! Qovun sayliga xush kelibsiz! Esda qolarli va qiziqarli rasmga tushishga tayyormisiz? Siz bugun qanday qahramon bo\'lmoqchisiz?'

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
  const [showKeyboard, setShowKeyboard] = useState(false)

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

  async function init() {
    setPhase('loading')
    setError('')
    setAiText('')
    setImage(null)
    setImageUrl(null)
    setUserText('')
    historyRef.current = []
    photoRef.current = null

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
        setPhase('speaking')
        await Promise.all([speakText(data.message), openCamera()])
        if (mountedRef.current) setPhase('camera')
        break

      case 'capture':
        setPhase('speaking')
        await speakText(data.message)
        if (!mountedRef.current) return
        await doCapture()
        break

      case 'generate':
        if (data.enhancedPrompt && photoRef.current) {
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

  // ── Audio Recording ──────────────────────────────────
  async function startRecording() {
    setError('')
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      micStreamRef.current = stream
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus' : 'audio/webm',
      })
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        micStreamRef.current?.getTracks().forEach(t => t.stop())
        micStreamRef.current = null
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        if (blob.size < 1000) {
          if (mountedRef.current) setPhase(streamRef.current ? 'camera' : 'idle')
          return
        }
        const buffer = await blob.arrayBuffer()
        const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''))

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
      setError("Mikrofonga ruxsat berilmadi.")
    }
  }

  function stopRecording() { mediaRecorderRef.current?.stop() }

  // ── Text Input (virtual keyboard) ────────────────────
  async function sendText(text: string) {
    if (!text) return
    setShowKeyboard(false)
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }

    setUserText(text)
    setPhase('processing')
    try {
      const aiRes = await chatAPI(text)
      if (mountedRef.current) {
        setUserText('')
        await handleAI(aiRes)
      }
    } catch {
      if (mountedRef.current) {
        setError("Xatolik yuz berdi. Qaytadan urinib ko'ring.")
        setPhase(streamRef.current ? 'camera' : 'idle')
      }
    }
  }

  // ── TTS ──────────────────────────────────────────────
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
        audio.onended = () => { URL.revokeObjectURL(audioUrl); resolve() }
        audio.onerror = () => { URL.revokeObjectURL(audioUrl); resolve() }
        audio.play().catch(() => resolve())
      })
    } catch { /* TTS not critical */ }
  }

  // ── Camera ───────────────────────────────────────────
  async function openCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      setCameraOpen(true)
      await new Promise(r => setTimeout(r, 50))
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
    } catch { setError("Kameraga ruxsat berilmadi.") }
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
    const photoBase64 = photo.includes(',') ? photo.split(',')[1] : photo
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, photo: photoBase64 }),
      })
      const data = await res.json()
      if (!res.ok || !data.image) throw new Error(data.error || 'No image')

      if (!mountedRef.current) return
      setImage(`data:image/png;base64,${data.image}`)
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

  function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

  // ── Render ───────────────────────────────────────────
  const micVisible = phase === 'idle' || phase === 'camera' || phase === 'recording' || phase === 'speaking'
  const cameraVisible = cameraOpen && phase !== 'generating' && phase !== 'result' && phase !== 'loading'

  return (
    <main className="fixed inset-0 kiosk-bg flex flex-col items-center overflow-hidden">
      <audio ref={audioRef} className="hidden" />

      {/* ── Header ── */}
      <div className="relative z-10 flex items-center justify-center pt-6 pb-2 md:pt-8 md:pb-4">
        <h1 className="text-lg md:text-xl font-medium tracking-widest uppercase">
          <span className="text-melon">Qovun</span>
          <span className="text-white/40 mx-2">|</span>
          <span className="text-accent">Photo Booth</span>
        </h1>
      </div>

      <div className="relative z-10 flex flex-col items-center justify-between flex-1 w-full max-w-5xl px-6 pb-8">

        {/* ─── AI Message ─── */}
        <div className="flex-shrink-0 text-center min-h-[60px] md:min-h-[80px] flex items-center justify-center px-4 py-3">
          {aiText && phase !== 'loading' && (
            <div key={aiText} className="animate-fade-in">
              <p className="text-xl sm:text-2xl md:text-3xl font-light text-white/90 leading-relaxed max-w-3xl">
                {aiText}
              </p>
            </div>
          )}
        </div>

        {/* ─── CENTER ─── */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full min-h-0">

          {phase === 'loading' && (
            <div className="flex flex-col items-center gap-5 animate-fade-in">
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full border-2 border-melon/20" />
                <div className="absolute inset-0 rounded-full border-2 border-melon border-t-transparent animate-spin" />
                <div className="absolute inset-2 rounded-full border-2 border-accent/20" />
                <div className="absolute inset-2 rounded-full border-2 border-accent border-b-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
              </div>
              <p className="text-white/30 text-sm tracking-wider">Yuklanmoqda...</p>
            </div>
          )}

          {/* Camera */}
          <div className={`relative rounded-2xl overflow-hidden camera-frame w-full max-w-2xl aspect-video bg-gray-900/50 ${cameraVisible ? '' : 'hidden'}`}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            {/* Corner brackets */}
            <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-accent/50 rounded-tl-lg" />
            <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-accent/50 rounded-tr-lg" />
            <div className="absolute bottom-3 left-3 w-8 h-8 border-b-2 border-l-2 border-accent/50 rounded-bl-lg" />
            <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-accent/50 rounded-br-lg" />
            {phase === 'countdown' && count > 0 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm">
                <span className="text-[12rem] font-bold text-white drop-shadow-2xl animate-bounce">{count}</span>
              </div>
            )}
          </div>

          {/* Speaking wave */}
          {phase === 'speaking' && !cameraVisible && (
            <div className="flex items-end justify-center gap-1 h-12">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full animate-wave"
                  style={{
                    animationDelay: `${i * 0.08}s`,
                    background: `linear-gradient(to top, #00e5ff, #ff6b35)`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Generating */}
          {phase === 'generating' && (
            <div className="flex flex-col items-center gap-6 animate-fade-in">
              <div className="relative w-28 h-28">
                <div className="absolute inset-0 rounded-full border-[3px] border-melon/15" />
                <div className="absolute inset-0 rounded-full border-[3px] border-melon border-t-transparent animate-spin" />
                <div className="absolute inset-3 rounded-full border-[3px] border-accent/15" />
                <div className="absolute inset-3 rounded-full border-[3px] border-accent border-b-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                {/* Center icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className="w-8 h-8 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                </div>
              </div>
              <div className="text-center">
                <p className="text-lg text-white/50 font-light">Rasm yaratilmoqda...</p>
                <p className="text-xs text-white/20 mt-1">AI sizning rasmingizni o'zgartirmoqda</p>
              </div>
            </div>
          )}

          {/* Result */}
          {phase === 'result' && image && (
            <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10 animate-slide-up max-h-[70vh]">
              <img src={image} alt="" className="rounded-2xl max-h-[50vh] md:max-h-[60vh] result-glow object-contain" />
              <div className="flex flex-col items-center gap-4">
                {imageUrl && (
                  <div className="glass rounded-2xl p-4">
                    <div className="bg-white p-3 rounded-xl">
                      <QRCodeSVG value={`${typeof window !== 'undefined' ? window.location.origin : ''}${imageUrl}`} size={140} />
                    </div>
                    <p className="text-xs text-white/30 text-center mt-3">Skanerlang va yuklab oling</p>
                  </div>
                )}
                <div className="flex items-center gap-2 text-white/30">
                  <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  <span className="text-sm tabular-nums font-mono">{timer}s</span>
                </div>
              </div>
            </div>
          )}

          {/* Recording */}
          {phase === 'recording' && (
            <div className="flex items-end justify-center gap-[3px] h-16">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full animate-wave"
                  style={{
                    animationDelay: `${i * 0.05}s`,
                    animationDuration: `${0.35 + Math.random() * 0.4}s`,
                    background: 'linear-gradient(to top, #ef4444, #f97316)',
                  }}
                />
              ))}
            </div>
          )}

          {/* Processing / Transcribing */}
          {(phase === 'transcribing' || phase === 'processing') && (
            <div className="flex flex-col items-center gap-4 animate-fade-in">
              <div className="flex gap-2">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rounded-full animate-bounce"
                    style={{
                      animationDelay: `${i * 0.15}s`,
                      background: i === 1 ? '#ff6b35' : '#00e5ff',
                    }}
                  />
                ))}
              </div>
              <p className="text-sm text-white/25">
                {phase === 'transcribing' ? "Ovoz tanilmoqda..." : "O'ylayapman..."}
              </p>
            </div>
          )}

          {/* User text */}
          {userText && (
            <div className="glass rounded-xl px-5 py-3 animate-fade-in">
              <p className="text-base text-white/50 italic text-center">&ldquo;{userText}&rdquo;</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="glass rounded-xl px-6 py-3 border-red-500/20 animate-fade-in">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* ─── BOTTOM: Controls ─── */}
        <div className="flex-shrink-0 flex flex-col items-center gap-2 justify-end w-full max-w-2xl pb-2">

          {micVisible && (
            <>
              {/* Mic + Keyboard toggle */}
              <div className="flex items-center gap-4">
                {/* Keyboard toggle */}
                <button
                  onClick={() => setShowKeyboard(v => !v)}
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full border flex items-center justify-center active:scale-95 transition-all ${showKeyboard ? 'bg-accent/15 border-accent/30 text-accent' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2 6a2 2 0 012-2h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    <path strokeLinecap="round" d="M6 8h1M10 8h1M14 8h1M18 8h1M6 12h1M10 12h1M14 12h1M18 12h1M8 16h8" />
                  </svg>
                </button>

                {/* Mic button */}
                <div className="relative">
                  {phase === 'recording' && (
                    <>
                      <div className="absolute inset-0 rounded-full bg-red-500/20 animate-pulse-ring" />
                      <div className="absolute inset-0 rounded-full bg-red-500/10 animate-pulse-ring" style={{ animationDelay: '0.5s' }} />
                    </>
                  )}
                  {phase !== 'recording' && phase === 'idle' && !showKeyboard && (
                    <div className="absolute inset-0 rounded-full bg-accent/10 animate-pulse-ring" />
                  )}
                  <button
                    onClick={phase === 'recording' ? stopRecording : startRecording}
                    className={`
                      relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full
                      flex items-center justify-center transition-all duration-300
                      ${phase === 'recording'
                        ? 'bg-red-500/15 border-2 border-red-400 mic-glow-recording scale-110'
                        : 'bg-accent/10 border-2 border-accent/40 mic-glow hover:border-accent hover:bg-accent/15 hover:scale-105 active:scale-95'
                      }
                    `}
                  >
                    {phase === 'recording' ? (
                      <div className="w-6 h-6 md:w-7 md:h-7 bg-red-400 rounded-md" />
                    ) : (
                      <svg className="w-7 h-7 md:w-9 md:h-9 text-accent" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
                        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Spacer */}
                <div className="w-12 sm:w-14" />
              </div>

              {!showKeyboard && (
                <p className={`text-xs ${phase === 'recording' ? 'text-red-400/60' : 'text-white/20'}`}>
                  {phase === 'recording' ? "To'xtatish uchun bosing" : "Gapiring yoki yozing"}
                </p>
              )}

              {/* Inline keyboard */}
              {showKeyboard && (
                <div className="w-full mt-1">
                  <Keyboard onSubmit={sendText} onClose={() => setShowKeyboard(false)} />
                </div>
              )}
            </>
          )}

          {phase === 'result' && (
            <button
              onClick={doReset}
              className="px-8 py-3 rounded-full glass border-accent/20 text-accent text-sm font-medium hover:bg-accent/10 active:scale-95 transition-all"
            >
              Yangi surat
            </button>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <span className="fixed bottom-3 right-4 text-sm text-white/20 tracking-wider z-20">by Bakhromdev</span>
    </main>
  )
}
