import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom'

let nextTooltipId = 0
const delay = 120
const padding = 8
const overflowOptions = { boundary: [], rootBoundary: 'viewport' as const, padding }

/**
 * Delegate plain-text tooltips without attaching state to individual triggers.
 * @param root Element containing the data-tooltip triggers.
 * @returns Disposer for the tooltip node, listeners, timers, and active observers.
 */
export function installTooltips(root: HTMLElement): () => void {
  const document = root.ownerDocument
  const tooltip = document.createElement('div')
  do {
    tooltip.id = `launcher-tooltip-${++nextTooltipId}`
  } while (document.getElementById(tooltip.id))
  tooltip.className = 'launcher-tooltip'
  tooltip.setAttribute('role', 'tooltip')
  tooltip.hidden = true
  Object.assign(tooltip.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: 'max-content',
    boxSizing: 'border-box',
    overflow: 'auto',
  })
  document.body.append(tooltip)

  let activeTarget: Element | null = null
  let hoveredTarget: Element | null = null
  let focusedTarget: Element | null = null
  let tooltipHovered = false
  let showTimer: ReturnType<typeof setTimeout> | undefined
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let stopPositioning: (() => void) | undefined
  let observer: MutationObserver | undefined
  let restoreDescription: (() => void) | undefined
  let positionVersion = 0
  let disposed = false

  function findTarget(value: EventTarget | null): Element | null {
    if (!(value instanceof Element) || tooltip.contains(value)) return null
    const target = value.closest('[data-tooltip]')
    return target && root.contains(target) ? target : null
  }

  function isTooltip(value: EventTarget | null): boolean {
    return value instanceof Node && tooltip.contains(value)
  }

  function textFor(target: Element): string | null {
    const text = target.getAttribute('data-tooltip')
    return target.isConnected && root.contains(target) && text?.trim() ? text : null
  }

  function clearHideTimer() {
    clearTimeout(hideTimer)
    hideTimer = undefined
  }

  function hide() {
    clearTimeout(showTimer)
    showTimer = undefined
    clearHideTimer()
    positionVersion += 1
    observer?.disconnect()
    observer = undefined
    stopPositioning?.()
    stopPositioning = undefined
    restoreDescription?.()
    restoreDescription = undefined
    activeTarget = null
    tooltipHovered = false
    tooltip.hidden = true
    tooltip.style.visibility = 'hidden'
    tooltip.textContent = ''
  }

  function updatePosition() {
    const target = activeTarget
    if (!target || tooltip.hidden) return
    if (!textFor(target) || target.getClientRects().length === 0) {
      hide()
      return
    }
    const version = ++positionVersion
    const isCurrent = () => !disposed && !tooltip.hidden && activeTarget === target
      && target.isConnected && root.contains(target) && positionVersion === version

    void computePosition(target, tooltip, {
      strategy: 'fixed',
      placement: 'top',
      middleware: [
        offset(6),
        flip(overflowOptions),
        shift({ ...overflowOptions, crossAxis: true }),
        size({
          ...overflowOptions,
          apply({ availableWidth, availableHeight }) {
            if (!isCurrent()) return
            const viewport = document.defaultView?.visualViewport
            const width = viewport?.width ?? document.documentElement.clientWidth
            const height = viewport?.height ?? document.documentElement.clientHeight
            Object.assign(tooltip.style, {
              maxWidth: `${Math.max(0, Math.min(320, width - padding * 2, availableWidth))}px`,
              maxHeight: `${Math.max(0, Math.min(height - padding * 2, availableHeight))}px`,
            })
          },
        }),
      ],
    }).then(({ x, y, placement }) => {
      if (!isCurrent()) return
      Object.assign(tooltip.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' })
      tooltip.dataset.placement = placement
    }).catch((error) => {
      if (!isCurrent()) return
      hide()
      console.error('Failed to position launcher tooltip', error)
    })
  }

  function describe(target: Element) {
    const original = target.getAttribute('aria-describedby')
    const describedBy = `${original ? `${original} ` : ''}${tooltip.id}`
    target.setAttribute('aria-describedby', describedBy)
    restoreDescription = () => {
      const current = target.getAttribute('aria-describedby')
      if (current === describedBy) {
        if (original === null) target.removeAttribute('aria-describedby')
        else target.setAttribute('aria-describedby', original)
        return
      }
      // Preserve descriptions added by the app while the tooltip was open.
      const remaining = current?.split(/\s+/).filter((id) => id && id !== tooltip.id).join(' ')
      if (remaining) target.setAttribute('aria-describedby', remaining)
      else target.removeAttribute('aria-describedby')
    }
  }

  function show(target: Element) {
    clearHideTimer()
    if (disposed || activeTarget === target) return
    hide()
    if (!textFor(target)) return
    activeTarget = target
    showTimer = setTimeout(() => {
      showTimer = undefined
      const text = textFor(target)
      if (disposed || activeTarget !== target || !text) {
        hide()
        return
      }
      tooltip.textContent = text
      tooltip.scrollTop = 0
      tooltip.scrollLeft = 0
      Object.assign(tooltip.style, {
        visibility: 'hidden',
        maxWidth: 'min(320px, calc(100vw - 16px))',
        maxHeight: 'calc(100vh - 16px)',
      })
      tooltip.hidden = false
      describe(target)
      observer = new MutationObserver(() => {
        const nextText = textFor(target)
        if (!nextText) {
          hide()
        } else if (tooltip.textContent !== nextText) {
          tooltip.textContent = nextText
          updatePosition()
        }
      })
      observer.observe(target, { attributes: true, attributeFilter: ['data-tooltip'] })
      observer.observe(document.documentElement, { childList: true, subtree: true })
      const cleanup = autoUpdate(target, tooltip, updatePosition, { animationFrame: true })
      if (activeTarget === target && !tooltip.hidden) stopPositioning = cleanup
      else cleanup()
    }, delay)
  }

  function release() {
    if (tooltipHovered) {
      clearHideTimer()
      return
    }
    const remaining = hoveredTarget ?? focusedTarget
    if (remaining) {
      show(remaining)
    } else if (tooltip.hidden) {
      hide()
    } else if (hideTimer === undefined) {
      // Keep the six-pixel gap traversable when moving onto long tooltip text.
      hideTimer = setTimeout(hide, delay)
    }
  }

  function onPointerOver(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    if (isTooltip(event.target)) {
      tooltipHovered = true
      clearHideTimer()
      return
    }
    const target = findTarget(event.target)
    if (target === findTarget(event.relatedTarget)) return
    hoveredTarget = target
    if (target) show(target)
  }

  function onPointerOut(event: PointerEvent) {
    if (event.pointerType === 'touch') return
    if (findTarget(event.target) === findTarget(event.relatedTarget) && !isTooltip(event.target)) return
    tooltipHovered = isTooltip(event.relatedTarget)
    hoveredTarget = findTarget(event.relatedTarget)
    release()
  }

  function onFocusIn(event: FocusEvent) {
    const target = findTarget(event.target)
    if (target === findTarget(event.relatedTarget)) return
    focusedTarget = target
    if (target) show(target)
  }

  function onFocusOut(event: FocusEvent) {
    const target = findTarget(event.relatedTarget)
    if (findTarget(event.target) === target) return
    focusedTarget = target
    release()
  }

  function dismiss() {
    hoveredTarget = null
    focusedTarget = null
    hide()
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') dismiss()
  }

  document.addEventListener('pointerover', onPointerOver, true)
  document.addEventListener('pointerout', onPointerOut, true)
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('focusout', onFocusOut, true)
  document.addEventListener('click', dismiss, true)
  document.addEventListener('keydown', onKeyDown, true)
  document.defaultView?.addEventListener('blur', dismiss)

  return () => {
    disposed = true
    dismiss()
    document.removeEventListener('pointerover', onPointerOver, true)
    document.removeEventListener('pointerout', onPointerOut, true)
    document.removeEventListener('focusin', onFocusIn, true)
    document.removeEventListener('focusout', onFocusOut, true)
    document.removeEventListener('click', dismiss, true)
    document.removeEventListener('keydown', onKeyDown, true)
    document.defaultView?.removeEventListener('blur', dismiss)
    tooltip.remove()
  }
}
