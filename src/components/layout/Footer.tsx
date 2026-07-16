import { Layers } from 'lucide-react'
import { Link } from 'react-router-dom'

export function Footer() {
  return (
    <footer className="border-t border-edge mt-auto bg-surface-2">
      <div className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-5 py-8 flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-hood flex items-center justify-center">
            <Layers className="w-3.5 h-3.5 text-[#0b0e11]" />
          </div>
          <div>
            <div className="font-bold text-ink">
              Open<span className="text-hood">Hood</span>
            </div>
            <p className="text-xs text-ink-3">NFT marketplace on Robinhood Chain</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-ink-2">
          <Link to="/" className="hover:text-hood">
            Discover
          </Link>
          <Link to="/collections" className="hover:text-hood">
            Collections
          </Link>
          <Link to="/rankings" className="hover:text-hood">
            Rankings
          </Link>
          <Link to="/degen" className="hover:text-hood">
            Degen Mode
          </Link>
          <Link to="/activity" className="hover:text-hood">
            Activity
          </Link>
          <Link to="/profile" className="hover:text-hood">
            Profile
          </Link>
        </div>
        <p className="text-xs text-ink-3">Demo UI · Mock data · Built for Robinhood Chain</p>
      </div>
    </footer>
  )
}
