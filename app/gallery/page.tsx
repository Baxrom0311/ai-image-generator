'use client'

import { useEffect, useState } from 'react'

interface Photo {
  id: string
  prompt: string
  created_at: string
}

export default function Gallery() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/photos')
      .then(r => r.json())
      .then(data => { setPhotos(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              <span className="text-[#ff6b35]">Qovun</span>
              <span className="text-white/30 mx-2">|</span>
              <span className="text-[#00e5ff]">Gallery</span>
            </h1>
            <p className="text-white/30 text-sm mt-1">{photos.length} ta rasm</p>
          </div>
          <a href="/" className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm hover:bg-white/10 transition-all">
            Booth
          </a>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#00e5ff] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : photos.length === 0 ? (
          <p className="text-center text-white/20 py-20">Hali rasmlar yo&apos;q</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {photos.map(photo => (
              <div key={photo.id} className="group relative rounded-2xl overflow-hidden bg-white/5 border border-white/10 hover:border-[#00e5ff]/30 transition-all">
                <a href={`/api/image/${photo.id}`} target="_blank" rel="noopener noreferrer">
                  <img
                    src={`/api/image/${photo.id}`}
                    alt={photo.prompt}
                    className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </a>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8">
                  <p className="text-xs text-white/60 line-clamp-2">{photo.prompt}</p>
                  <p className="text-[10px] text-white/25 mt-1">
                    {new Date(photo.created_at).toLocaleString('uz-UZ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
