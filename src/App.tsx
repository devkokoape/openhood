import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { MarketplaceProvider } from './context/MarketplaceContext'
import { WalletProvider } from './components/wallet/WalletProvider'
import { Layout } from './components/layout/Layout'
import { Home } from './pages/Home'
import { CollectionsPage } from './pages/CollectionsPage'
import { CollectionPage } from './pages/CollectionPage'
import { NftDetailPage } from './pages/NftDetailPage'
import { ActivityPage } from './pages/ActivityPage'
import { BulkBuyPage } from './pages/BulkBuyPage'
import { ProfilePage } from './pages/ProfilePage'
import { EditCollectionPage } from './pages/EditCollectionPage'
import { DegenShell } from './components/degen/DegenShell'
import { DegenOverview } from './pages/DegenOverview'
import { DegenMintsPage } from './pages/DegenMintsPage'
import { MintPage } from './pages/MintPage'
import { RankingsPage } from './pages/RankingsPage'

export default function App() {
  return (
    <ThemeProvider>
      <WalletProvider>
        <MarketplaceProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || undefined}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="collections" element={<CollectionsPage />} />
                <Route path="rankings" element={<RankingsPage />} />
                <Route path="collection/:slug" element={<CollectionPage />} />
                <Route path="collection/:slug/edit" element={<EditCollectionPage />} />
                <Route path="nft/:id" element={<NftDetailPage />} />
                <Route path="activity" element={<ActivityPage />} />

                <Route path="degen" element={<DegenShell />}>
                  <Route index element={<DegenOverview />} />
                  <Route path="mints" element={<DegenMintsPage />} />
                  <Route path="mint/:slug" element={<MintPage />} />
                  <Route path="bulk" element={<BulkBuyPage />} />
                </Route>

                <Route path="bulk" element={<Navigate to="/degen/bulk" replace />} />

                <Route path="profile" element={<ProfilePage />} />
                <Route path="profile/:address" element={<ProfilePage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </MarketplaceProvider>
      </WalletProvider>
    </ThemeProvider>
  )
}
