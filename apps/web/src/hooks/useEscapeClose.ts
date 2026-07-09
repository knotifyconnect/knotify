import { useEffect } from 'react'

export function isEditableEscapeTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

export function useEscapeClose(
  active: boolean,
  onClose: () => void,
  options: { disabled?: boolean; shouldIgnore?: (event: KeyboardEvent) => boolean } = {}
) {
  const { disabled = false, shouldIgnore } = options

  useEffect(() => {
    if (!active || disabled) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.defaultPrevented || event.isComposing || isEditableEscapeTarget(event.target)) return
      if (shouldIgnore?.(event)) return

      onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, disabled, onClose, shouldIgnore])
}
