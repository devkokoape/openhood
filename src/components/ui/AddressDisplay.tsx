import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import clsx from 'clsx'
import { formatAddress, isFullAddress } from '../../lib/address'
import { toast } from 'sonner'

export function AddressDisplay({
  address,
  className,
  mono = true,
  showCopy = true,
  truncate = true,
}: {
  address: string
  className?: string
  mono?: boolean
  showCopy?: boolean
  truncate?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const display =
    truncate && isFullAddress(address) ? formatAddress(address) : address

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      toast.success('Address copied')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy')
    }
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 min-w-0 max-w-full',
        mono && 'font-mono',
        className
      )}
    >
      <span className="truncate" title={address}>
        {display}
      </span>
      {showCopy && isFullAddress(address) && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            void onCopy()
          }}
          className="shrink-0 p-0.5 rounded text-ink-3 hover:text-hood cursor-pointer"
          aria-label="Copy address"
        >
          {copied ? (
            <Check className="w-3 h-3 text-hood" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
      )}
    </span>
  )
}
