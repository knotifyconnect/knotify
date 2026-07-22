const KEYBOARD_THRESHOLD_PX = 120

type VisualViewportState = {
  height: number
  offsetTop: number
  keyboardOpen: boolean
}

function isTextEntryElement(element: Element | null) {
  return element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
    || (element instanceof HTMLElement && element.isContentEditable)
}

function applyVisualViewportState(root: HTMLElement, state: VisualViewportState) {
  root.style.setProperty('--visual-viewport-height', `${state.height}px`)
  root.style.setProperty('--visual-viewport-offset-top', `${state.offsetTop}px`)
  root.dataset.virtualKeyboard = state.keyboardOpen ? 'open' : 'closed'
}

/**
 * Keep fixed application chrome aligned with the part of the screen that is
 * actually visible. On iOS the software keyboard pans and shrinks the visual
 * viewport without moving the layout viewport, so CSS viewport units and
 * position: fixed alone cannot keep headers, composers, and dialogs in place.
 */
export function installVisualViewportContract() {
  const root = document.documentElement
  const viewport = window.visualViewport
  let animationFrame = 0
  let unobscuredHeight = Math.round(viewport?.height ?? window.innerHeight)

  const commit = () => {
    const height = Math.round(viewport?.height ?? window.innerHeight)
    const offsetTop = Math.max(0, Math.round(viewport?.offsetTop ?? 0))
    const textEntryFocused = isTextEntryElement(document.activeElement)
    if (!textEntryFocused) unobscuredHeight = height

    // Chromium can resize the layout viewport when interactive-widget is set,
    // while iOS only resizes/pans the visual viewport. Compare against both
    // baselines so the same keyboard signal works in either model.
    const obscuredHeight = Math.max(
      unobscuredHeight - height,
      window.innerHeight - height - offsetTop,
      0,
    )
    const keyboardOpen = textEntryFocused && obscuredHeight >= KEYBOARD_THRESHOLD_PX

    applyVisualViewportState(root, { height, offsetTop, keyboardOpen })
  }

  const schedule = () => {
    window.cancelAnimationFrame(animationFrame)
    animationFrame = window.requestAnimationFrame(commit)
  }

  commit()
  window.addEventListener('resize', schedule)
  window.addEventListener('orientationchange', schedule)
  document.addEventListener('focusin', schedule)
  document.addEventListener('focusout', schedule)
  viewport?.addEventListener('resize', schedule)
  viewport?.addEventListener('scroll', schedule)

  return () => {
    window.cancelAnimationFrame(animationFrame)
    window.removeEventListener('resize', schedule)
    window.removeEventListener('orientationchange', schedule)
    document.removeEventListener('focusin', schedule)
    document.removeEventListener('focusout', schedule)
    viewport?.removeEventListener('resize', schedule)
    viewport?.removeEventListener('scroll', schedule)
    root.style.removeProperty('--visual-viewport-height')
    root.style.removeProperty('--visual-viewport-offset-top')
    delete root.dataset.virtualKeyboard
  }
}
