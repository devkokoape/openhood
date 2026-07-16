import type { CSSProperties } from 'react'
import { Toaster as Sonner } from 'sonner'
import { useTheme } from '../../context/ThemeContext'

export function AppToaster() {
  const { theme } = useTheme()
  return (
    <Sonner
      theme={theme}
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            'border border-edge bg-surface text-ink shadow-xl font-[inherit]',
          title: 'font-semibold text-ink',
          description: 'text-ink-2 text-sm',
          actionButton: 'bg-hood text-[#0b0e11] font-bold',
          cancelButton: 'bg-surface-3 text-ink',
          closeButton: 'bg-surface border-edge text-ink-2',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--color-surface)',
          '--normal-text': 'var(--color-ink)',
          '--normal-border': 'var(--color-border)',
          '--success-bg': 'var(--color-surface)',
          '--error-bg': 'var(--color-surface)',
        } as CSSProperties
      }
    />
  )
}
