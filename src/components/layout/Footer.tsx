import { Layers } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="border-t border-edge mt-auto bg-surface-2 pb-safe">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-5 py-6 sm:py-8 flex flex-col md:flex-row gap-5 md:items-center md:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-md bg-hood flex items-center justify-center shrink-0">
            <Layers className="w-3.5 h-3.5 text-[#0b0e11]" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-ink">
              Open<span className="text-hood">Hood</span>
            </div>
            <p className="text-xs text-ink-3">NFT marketplace on Robinhood Chain</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-2">
          <Link to="/" className="hover:text-hood py-1">
            Discover
          </Link>
          <Link to="/collections" className="hover:text-hood py-1">
            Collections
          </Link>
          <Link to="/rankings" className="hover:text-hood py-1">
            Rankings
          </Link>
          <Link to="/degen" className="hover:text-hood py-1">
            Degen
          </Link>
          <Link to="/activity" className="hover:text-hood py-1">
            Activity
          </Link>
          <Link to="/profile" className="hover:text-hood py-1">
            Profile
          </Link>
        </div>
        <p className="text-xs text-ink-3">
          Live OpenSea · Robinhood Chain · OpenHood testnet market
        </p>
      </div>
    </footer>
  )
}
