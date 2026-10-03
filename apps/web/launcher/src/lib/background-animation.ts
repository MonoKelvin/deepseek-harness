/** Directory (relative to the app root) holding the numbered frame files. */
const DEFAULT_BASE_PATH = './deepseek-girl-frames'
/** Frames in the sequence. */
const DEFAULT_FRAME_COUNT = 31
/** 1-based frame held while idle (eyes open). */
const DEFAULT_REST_FRAME = 1
/** 1-based inclusive frame range played for one blink. Measured from the source
 *  sequence: 1-10 are the open rest pose, 11-12 close, 13-17 hold closed, 18-20
 *  open, 21-31 return to rest. */
const DEFAULT_BLINK_START = 11
const DEFAULT_BLINK_END = 21
/** Duration of one blink, in milliseconds. */
const DEFAULT_BLINK_DURATION_MS = 620
/** Random idle delay range before the next blink, in milliseconds. */
const DEFAULT_BLINK_MIN_DELAY_MS = 2500
const DEFAULT_BLINK_MAX_DELAY_MS = 6000
/** Longest edge, in pixels, that frames are decoded to. The art renders at up
 *  to ~284 CSS px; 512 stays crisp on HiDPI displays while bounding bitmap
 *  memory (31 frames x 512^2 x 4 B ≈ 32 MB). */
const DEFAULT_MAX_FRAME_SIZE = 512

function clampPoint(value: number): number {
  return Math.max(-1, Math.min(1, value))
}

/** Construction options; every field defaults to the launcher's current art. */
export interface BackgroundAnimationOptions {
  /** Directory prefix for the numbered frames, e.g. `./deepseek-girl-frames`. */
  basePath?: string
  /** Frames in the sequence; files are `frame_001.webp` upward. */
  frameCount?: number
  /** 1-based frame shown while idle. */
  restFrame?: number
  /** 1-based first frame of one blink. */
  blinkStart?: number
  /** 1-based last frame of one blink. */
  blinkEnd?: number
  /** Playback duration of one blink, in milliseconds. */
  blinkDurationMs?: number
  /** Lower bound of the random idle delay between blinks, in milliseconds. */
  blinkMinDelayMs?: number
  /** Upper bound of the random idle delay between blinks, in milliseconds. */
  blinkMaxDelayMs?: number
  /** Longest edge, in pixels, that each frame is decoded to. */
  maxFrameSize?: number
  /** Element whose pointer movement drives the parallax offset. Defaults to the
   *  canvas itself. */
  pointerTarget?: HTMLElement | null
  /** Receives a message when a frame cannot be loaded. */
  onError?: (message: string) => void
}

interface ResolvedOptions {
  basePath: string
  frameCount: number
  restFrame: number
  blinkStart: number
  blinkEnd: number
  blinkDurationMs: number
  blinkMinDelayMs: number
  blinkMaxDelayMs: number
  maxFrameSize: number
  pointerTarget: HTMLElement | null
  onError: ((message: string) => void) | null
}

/**
 * Pointer-reactive background that renders the DeepSeek-girl blink frame
 * sequence onto a canvas.
 *
 * Frames are decoded to ImageBitmaps before the first play so no decode runs
 * mid-animation, the blink frame index is derived from elapsed time so it stays
 * correct at any display refresh rate, and the parallax offset is published as
 * CSS custom properties so the transform stays on the compositor thread. Both
 * the blink and the parallax run regardless of `prefers-reduced-motion`; the
 * parallax is skipped only when the device has no hovering pointer.
 */
export class BackgroundAnimation {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly options: ResolvedOptions
  private readonly pointerEnabled: boolean
  private readonly removeListeners: Array<() => void> = []
  private frames: ImageBitmap[] = []
  private blinkTimer: number | null = null
  private rafHandle: number | null = null
  private lastDrawn: number | null = null
  private disposed = false

  /**
   * @param canvas Canvas the sequence is drawn onto.
   * @param options Overrides for the sequence, timing, and pointer target.
   */
  constructor(canvas: HTMLCanvasElement, options: BackgroundAnimationOptions = {}) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('BackgroundAnimation requires a 2D canvas context')
    this.canvas = canvas
    this.context = context
    this.options = {
      basePath: options.basePath ?? DEFAULT_BASE_PATH,
      frameCount: options.frameCount ?? DEFAULT_FRAME_COUNT,
      restFrame: options.restFrame ?? DEFAULT_REST_FRAME,
      blinkStart: options.blinkStart ?? DEFAULT_BLINK_START,
      blinkEnd: options.blinkEnd ?? DEFAULT_BLINK_END,
      blinkDurationMs: options.blinkDurationMs ?? DEFAULT_BLINK_DURATION_MS,
      blinkMinDelayMs: options.blinkMinDelayMs ?? DEFAULT_BLINK_MIN_DELAY_MS,
      blinkMaxDelayMs: options.blinkMaxDelayMs ?? DEFAULT_BLINK_MAX_DELAY_MS,
      maxFrameSize: options.maxFrameSize ?? DEFAULT_MAX_FRAME_SIZE,
      pointerTarget: options.pointerTarget ?? null,
      onError: options.onError ?? null,
    }
    // The blink and the pointer parallax are both core to the launcher's look,
    // so neither defers to the OS reduced-motion setting; the parallax is only
    // skipped when the device has no hovering pointer.
    this.pointerEnabled = !window.matchMedia('(hover: none)').matches
    // A non-zero backing store before frames load keeps layout stable.
    if (canvas.width === 0 || canvas.height === 0) {
      canvas.width = this.options.maxFrameSize
      canvas.height = this.options.maxFrameSize
    }
  }

  /**
   * Decodes every frame, draws the rest pose, then begins the blink schedule
   * and pointer tracking. Safe to call once; later calls are ignored.
   */
  start(): void {
    if (this.disposed) return
    void this.load().then(() => {
      if (this.disposed) return
      this.drawRest()
      this.canvas.dataset.ready = 'true'
      if (this.pointerEnabled) this.trackPointer()
      this.scheduleBlink()
    }, (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      this.options.onError?.(message)
    })
  }

  /** Cancels timers and animation frames, removes listeners, and frees frames. */
  dispose(): void {
    this.disposed = true
    if (this.blinkTimer !== null) {
      window.clearTimeout(this.blinkTimer)
      this.blinkTimer = null
    }
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = null
    }
    for (const remove of this.removeListeners) remove()
    this.removeListeners.length = 0
    for (const frame of this.frames) frame.close()
    this.frames.length = 0
  }

  private async load(): Promise<void> {
    const { basePath, frameCount, maxFrameSize } = this.options
    const urls = Array.from({ length: frameCount }, (_, index) => `${basePath}/frame_${String(index + 1).padStart(3, '0')}.webp`)
    this.frames = await Promise.all(urls.map(url => this.loadFrame(url, maxFrameSize)))
    const first = this.frames[0]
    if (first) {
      this.canvas.width = first.width
      this.canvas.height = first.height
      this.canvas.style.aspectRatio = `${first.width} / ${first.height}`
    }
  }

  private async loadFrame(url: string, maxSize: number): Promise<ImageBitmap> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url} responded with ${response.status}`)
    const bitmap = await createImageBitmap(await response.blob())
    const longest = Math.max(bitmap.width, bitmap.height)
    if (longest <= maxSize) return bitmap
    const scale = maxSize / longest
    const scaled = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale))
    const context = scaled.getContext('2d')
    if (!context) {
      bitmap.close()
      throw new Error('OffscreenCanvas 2D context unavailable')
    }
    context.drawImage(bitmap, 0, 0, scaled.width, scaled.height)
    const resized = await createImageBitmap(scaled)
    bitmap.close()
    return resized
  }

  private drawFrame(index: number): void {
    const frame = this.frames[index]
    if (!frame) return
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.context.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height)
    this.lastDrawn = index
  }

  private drawRest(): void {
    this.drawFrame(this.options.restFrame - 1)
  }

  private scheduleBlink(): void {
    if (this.disposed) return
    const { blinkMinDelayMs, blinkMaxDelayMs } = this.options
    const delay = blinkMinDelayMs + Math.random() * Math.max(0, blinkMaxDelayMs - blinkMinDelayMs)
    this.blinkTimer = window.setTimeout(() => {
      this.blinkTimer = null
      this.playBlink()
    }, delay)
  }

  private playBlink(): void {
    if (this.disposed) return
    const { blinkStart, blinkEnd, blinkDurationMs } = this.options
    const first = blinkStart - 1
    const span = blinkEnd - blinkStart + 1
    const startedAt = performance.now()
    const step = (now: number) => {
      if (this.disposed) return
      const offset = Math.floor((now - startedAt) / blinkDurationMs * span)
      if (offset >= span) {
        this.rafHandle = null
        this.drawRest()
        this.scheduleBlink()
        return
      }
      const index = first + offset
      if (index !== this.lastDrawn) this.drawFrame(index)
      this.rafHandle = requestAnimationFrame(step)
    }
    this.rafHandle = requestAnimationFrame(step)
  }

  private trackPointer(): void {
    const target = this.options.pointerTarget ?? this.canvas
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const bounds = target.getBoundingClientRect()
      if (bounds.width === 0 || bounds.height === 0) return
      const x = clampPoint((event.clientX - bounds.left) / bounds.width * 2 - 1)
      const y = clampPoint((event.clientY - bounds.top) / bounds.height * 2 - 1)
      this.canvas.style.setProperty('--pointer-x', x.toFixed(3))
      this.canvas.style.setProperty('--pointer-y', y.toFixed(3))
    }
    const onLeave = () => {
      this.canvas.style.removeProperty('--pointer-x')
      this.canvas.style.removeProperty('--pointer-y')
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerleave', onLeave)
    this.removeListeners.push(
      () => target.removeEventListener('pointermove', onMove),
      () => target.removeEventListener('pointerleave', onLeave),
    )
  }
}
