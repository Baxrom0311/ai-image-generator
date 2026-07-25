'use client'

import { useState } from 'react'

interface KeyboardProps {
  onSubmit: (text: string) => void
  onClose: () => void
}

const ROWS_LOWER = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'o\''],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'g\''],
  ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'],
  ['sh', 'ch', 'space', 'ng', 'send'],
]

const ROWS_UPPER = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', 'O\''],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'G\''],
  ['shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'backspace'],
  ['Sh', 'Ch', 'space', 'Ng', 'send'],
]

export default function Keyboard({ onSubmit, onClose }: KeyboardProps) {
  const [text, setText] = useState('')
  const [upper, setUpper] = useState(false)

  const rows = upper ? ROWS_UPPER : ROWS_LOWER

  function handleKey(key: string) {
    switch (key) {
      case 'backspace':
        setText(t => t.slice(0, -1))
        break
      case 'space':
        setText(t => t + ' ')
        break
      case 'shift':
        setUpper(u => !u)
        break
      case 'send':
        if (text.trim()) { onSubmit(text.trim()); setText('') }
        break
      default:
        setText(t => t + key)
        if (upper) setUpper(false)
    }
  }

  function getKeyWidth(key: string) {
    if (key === 'space') return 'flex-[3]'
    if (key === 'send') return 'flex-[2]'
    if (key === 'backspace') return 'flex-[1.5]'
    if (key === 'shift') return 'flex-[1.5]'
    return 'flex-1'
  }

  function getKeyStyle(key: string) {
    if (key === 'send') return 'bg-accent/20 border-accent/40 text-accent'
    if (key === 'shift') return upper ? 'bg-accent/15 border-accent/30 text-accent' : 'bg-white/8 border-white/10 text-white/50'
    if (key === 'backspace') return 'bg-white/8 border-white/10 text-white/50'
    if (key === 'space') return 'bg-white/5 border-white/10 text-white/30'
    return 'bg-white/8 border-white/12 text-white/90 hover:bg-white/15 active:bg-white/20'
  }

  function renderKeyLabel(key: string) {
    if (key === 'backspace') return (
      <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.374-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.21-.211.497-.33.795-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.795-.33z" />
      </svg>
    )
    if (key === 'shift') return (
      <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
      </svg>
    )
    if (key === 'space') return ''
    if (key === 'send') return (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
      </svg>
    )
    return key
  }

  return (
    <div className="w-full animate-fade-in">
      {/* Input field */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 min-h-[52px] flex items-center">
          <p className="text-white/90 text-lg truncate">
            {text || <span className="text-white/25">Yozing...</span>}
            <span className="inline-block w-0.5 h-5 bg-accent ml-0.5 animate-pulse align-middle" />
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/30 hover:bg-white/10 active:scale-95 transition-all shrink-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Keys */}
      <div className="space-y-2">
        {rows.map((row, ri) => (
          <div key={ri} className="flex gap-1.5 justify-center">
            {row.map((key) => (
              <button
                key={key}
                onClick={() => handleKey(key)}
                className={`
                  ${getKeyWidth(key)} h-14 md:h-16 rounded-xl border
                  flex items-center justify-center text-lg md:text-xl
                  active:scale-95 transition-all duration-100
                  ${getKeyStyle(key)}
                `}
              >
                {renderKeyLabel(key)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
