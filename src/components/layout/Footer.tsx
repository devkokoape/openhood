import { Layers, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { OPENSEA_DOCS } from '../../lib/opensea'
import { MARKETPLACE_EXPLORER } from '../../lib/marketplace'

const product = [
  { to: '/', label: 'Discover' },
  { to: '/collections', label: 'Collections' },
  { to: '/rankings', label: 'Rankings' },
  { to: '/activity', label: 'Activity' },
]

const trade = [
  { to: '/degen', label: 'Degen Mode' },
  { to: '/degen/mints', label: 'Mint pages' },
  { to: '/degen/bulk', label: 'Bulk buy' },
  { to: '/profile', label: 'Profile' },
]

const resources = [
  {
    href: OPENSEA_DOCS.robinhoodChain,
    label: 'OpenSea · Robinhood',
  },
  {
    href: MARKETPLACE_EXPLORER,
    label: 'Block explorer',
  },
  {
    href: 'https://docs.robinhood.com/chain',
    label: 'Robinhood Chain docs',
  },
  {
    href: 'https://github.com/devkokoape/openhood',
    label: 'GitHub',
  },
]

// Admin is intentionally not linked in the public footer.

export function Footer() {
  return (
    <footer className="mt-auto border-t border-edge bg-surface-2 pb-safe">
      {/* Top brand strip */}
      <div className="border-b border-edge">
        <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 py-8 sm:py-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-12 gap-8 lg:gap-6">
            {/* Brand */}
            <div className="col-span-2 sm:col-span-4 lg:col-span-4">
              <Link to="/" className="inline-flex items-center gap-2.5 group">
                <div className="w-9 h-9 rounded-xl bg-hood flex items-center justify-center shadow-md shadow-hood/20">
                  <Layers className="w-4 h-4 text-[#0b0e11]" strokeWidth={2.5} />
                </div>
                <div>
                  <div className="font-extrabold text-lg tracking-tight text-ink group-hover:text-hood transition-colors">
                    Open<span className="text-hood">Hood</span>
                  </div>
                  <div className="text-[11px] text-ink-3 font-medium">
                    NFT marketplace · Robinhood Chain
                  </div>
                </div>
              </Link>
              <p className="mt-4 text-sm text-ink-2 leading-relaxed max-w-sm">
                Trade Robinhood Chain NFTs with live OpenSea analytics. Mint, list, and auction
                on the OpenHood testnet marketplace.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-edge bg-surface text-[11px] font-semibold text-ink-3">
                <span className="w-1.5 h-1.5 rounded-full bg-hood" />
                Powered by OpenSea + Robinhood Chain
              </div>
            </div>

            {/* Product */}
            <div className="lg:col-span-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-3 mb-3">
                Marketplace
              </h3>
              <ul className="space-y-2">
                {product.map((l) => (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      className="text-sm text-ink-2 hover:text-hood transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Trade */}
            <div className="lg:col-span-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-3 mb-3">
                Trade
              </h3>
              <ul className="space-y-2">
                {trade.map((l) => (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      className="text-sm text-ink-2 hover:text-hood transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources */}
            <div className="col-span-2 sm:col-span-2 lg:col-span-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-3 mb-3">
                Resources
              </h3>
              <ul className="space-y-2">
                {resources.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-hood transition-colors"
                    >
                      {l.label}
                      <ExternalLink className="w-3 h-3 opacity-50" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="mx-auto max-w-[1920px] px-2 sm:px-3 lg:px-4 py-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <p className="text-[11px] sm:text-xs text-ink-3">
          © {new Date().getFullYear()} OpenHood. Not affiliated with Robinhood Markets, Inc.
        </p>
        <p className="text-[11px] sm:text-xs text-ink-3">
          Stats via OpenSea API · Testnet marketplace for demo purposes
        </p>
      </div>
    </footer>
  )
}
