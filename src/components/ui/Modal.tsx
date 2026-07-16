import { X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ open, onClose, title, children, footer }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 modal-sheet">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative w-full max-w-md bg-surface border border-edge rounded-2xl shadow-2xl animate-fade-in modal-sheet-panel flex flex-col max-h-[min(90dvh,40rem)]"
      >
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-edge shrink-0">
          <h2 id="modal-title" className="text-base sm:text-lg font-semibold text-ink pr-2 truncate">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="shrink-0">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="px-4 sm:px-5 py-4 overflow-y-auto min-h-0 flex-1 overscroll-contain">
          {children}
        </div>
        {footer && (
          <div className="px-4 sm:px-5 py-3 sm:py-4 border-t border-edge flex flex-col-reverse sm:flex-row gap-2 sm:justify-end shrink-0 pb-safe sm:pb-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
