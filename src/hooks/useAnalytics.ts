/**
 * Track route changes for admin visit analytics.
 */
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { trackPageView } from '../lib/analytics'
import { useTheme } from '../context/ThemeContext'
import { hasIndexerUrl } from '../lib/indexerApi'

export function useAnalytics() {
  const location = useLocation()
  const { address, isConnected } = useAccount()
  const { theme } = useTheme()
  const last = useRef('')

  useEffect(() => {
    if (!hasIndexerUrl()) return
    const path = `${location.pathname}${location.search || ''}`
    const key = `${path}|${address || ''}`
    if (last.current === key) return
    last.current = key
    trackPageView({
      path,
      page: location.pathname,
      wallet: isConnected && address ? address : null,
      theme,
    })
  }, [location.pathname, location.search, address, isConnected, theme])
}
