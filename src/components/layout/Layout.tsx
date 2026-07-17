import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { useAnalytics } from '../../hooks/useAnalytics'

export function Layout() {
  useAnalytics()

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col bg-surface text-ink overflow-x-hidden w-full max-w-[100vw]">
      <Navbar />
      <main className="flex-1 w-full min-w-0 overflow-x-hidden">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
