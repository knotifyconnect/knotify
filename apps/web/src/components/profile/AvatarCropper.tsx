import { useEffect, useMemo, useRef, useState } from 'react'
import { KBtn } from '../../lib/knotify'

const MAX_CROP_SIZE = 260
const OUTPUT_SIZE = 320

type Props = {
  source: string
  onApply: (dataUrl: string) => void
  onCancel: () => void
}

export function AvatarCropper({ source, onApply, onCancel }: Props) {
  const imageRef = useRef<HTMLImageElement | null>(null)
  const cropRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null)
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 })
  const [cropSize, setCropSize] = useState(MAX_CROP_SIZE)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
  }, [source])

  useEffect(() => {
    const crop = cropRef.current
    if (!crop) return
    const measure = () => setCropSize(crop.getBoundingClientRect().width || MAX_CROP_SIZE)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(crop)
    return () => observer.disconnect()
  }, [])

  const baseScale = Math.max(cropSize / naturalSize.width, cropSize / naturalSize.height)
  const rendered = useMemo(() => ({
    width: naturalSize.width * baseScale * zoom,
    height: naturalSize.height * baseScale * zoom,
  }), [baseScale, naturalSize.height, naturalSize.width, zoom])

  function clampOffset(next: { x: number; y: number }, nextZoom = zoom) {
    const width = naturalSize.width * baseScale * nextZoom
    const height = naturalSize.height * baseScale * nextZoom
    const maxX = Math.max(0, (width - cropSize) / 2)
    const maxY = Math.max(0, (height - cropSize) / 2)
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    }
  }

  function changeZoom(nextZoom: number) {
    const value = Math.max(1, Math.min(3, nextZoom))
    setZoom(value)
    setOffset((current) => clampOffset(current, value))
  }

  function applyCrop() {
    const image = imageRef.current
    if (!image) return

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_SIZE
    canvas.height = OUTPUT_SIZE
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const appliedScale = baseScale * zoom
    const sourceSize = cropSize / appliedScale
    const sourceX = (naturalSize.width - sourceSize) / 2 - offset.x / appliedScale
    const sourceY = (naturalSize.height - sourceSize) / 2 - offset.y / appliedScale

    ctx.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE,
    )
    onApply(canvas.toDataURL('image/jpeg', 0.88))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div
        ref={cropRef}
        role="application"
        aria-label="Drag and zoom to crop your profile photo"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          dragRef.current = { x: event.clientX, y: event.clientY, startX: offset.x, startY: offset.y }
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current
          if (!drag) return
          event.preventDefault()
          setOffset(clampOffset({
            x: drag.startX + event.clientX - drag.x,
            y: drag.startY + event.clientY - drag.y,
          }))
        }}
        onPointerUp={() => { dragRef.current = null }}
        onPointerCancel={() => { dragRef.current = null }}
        style={{
          width: 'min(260px, 72vw)',
          height: 'min(260px, 72vw)',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '50%',
          background: 'var(--paper-soft)',
          cursor: 'grab',
          touchAction: 'none',
          boxShadow: '0 0 0 5px var(--paper), 0 0 0 6px var(--rule), var(--lift-2)',
        }}
      >
        <img
          ref={imageRef}
          src={source}
          alt="Crop preview"
          draggable={false}
          onLoad={(event) => {
            setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
          }}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: rendered.width,
            height: rendered.height,
            maxWidth: 'none',
            transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px)`,
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        />
        <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.72)', pointerEvents: 'none' }} />
      </div>

      <label style={{ width: 'min(300px, 100%)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--ink-muted)' }}>
        <span>Face</span>
        <input
          aria-label="Zoom photo"
          type="range"
          min="1"
          max="3"
          step="0.01"
          value={zoom}
          onChange={(event) => changeZoom(Number(event.target.value))}
          style={{ flex: 1, accentColor: 'var(--signal)' }}
        />
        <span>Closer</span>
      </label>

      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-faint)', textAlign: 'center' }}>
        Drag to center your face, then zoom until the circle looks right.
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        <KBtn variant="ghost" size="sm" onClick={onCancel}>Choose another</KBtn>
        <KBtn variant="signal" size="sm" onClick={applyCrop}>Use this crop</KBtn>
      </div>
    </div>
  )
}
