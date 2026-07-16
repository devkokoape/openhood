import type { Activity, Collection, MintDrop, Nft, Offer } from '../types'
import { nftArtUrl } from './art'

export function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString()
}

export function daysFromNow(d: number): string {
  return new Date(Date.now() + d * 86400_000).toISOString()
}

export function buildMintDrops(
  collections: Collection[],
  currentUser: string
): MintDrop[] {
  const openSea = collections.filter((c) => c.source === 'opensea')
  const demo = collections.find((c) => c.id === 'col-open-pixels') || collections[0]
  const c0 = openSea[0] || demo
  const c1 = openSea[1] || c0

  return [
    {
      id: 'mint-1',
      slug: 'hood-genesis',
      name: 'Hood Genesis',
      description: 'First public mint on OpenHood Degen Mode.',
      image: nftArtUrl('mint-hood-genesis', 'HG'),
      banner: nftArtUrl('mint-hood-genesis-banner', 'Hood Genesis'),
      collectionId: demo.id,
      price: 0.02,
      supply: 2222,
      minted: 1480,
      maxPerWallet: 10,
      status: 'live',
      startsAt: hoursAgo(48),
      endsAt: daysFromNow(5),
      chain: 'Robinhood Chain',
      founder: currentUser,
    },
    {
      id: 'mint-2',
      slug: 'os-live-mint',
      name: `${c0.name} Mint`,
      description: `Live mint surface for ${c0.name} (OpenSea Robinhood Chain).`,
      image: c0.image,
      banner: c0.banner,
      collectionId: c0.id,
      price: Math.max(0.0001, c0.floorPrice),
      supply: Math.min(c0.items || 1000, 10000),
      minted: Math.floor((c0.items || 1000) * 0.35),
      maxPerWallet: 5,
      status: 'live',
      startsAt: hoursAgo(12),
      endsAt: daysFromNow(2),
      chain: 'Robinhood Chain',
      founder: c0.founder,
    },
    {
      id: 'mint-3',
      slug: 'os-upcoming',
      name: `${c1.name} WL`,
      description: 'Upcoming whitelist mint on Robinhood Chain.',
      image: c1.image,
      banner: c1.banner,
      collectionId: c1.id,
      price: Math.max(0.0001, c1.floorPrice * 1.1),
      supply: 3333,
      minted: 0,
      maxPerWallet: 3,
      status: 'upcoming',
      startsAt: daysFromNow(2),
      endsAt: daysFromNow(7),
      chain: 'Robinhood Chain',
      founder: c1.founder,
    },
  ]
}

export function buildOffers(
  collections: Collection[],
  nfts: Nft[],
  currentUser: string
): Offer[] {
  const c0 = collections[0]
  const c1 = collections[1] || c0
  const demo = collections.find((c) => c.id === 'col-open-pixels') || c0
  const n0 = nfts.find((n) => n.collectionId === c0.id && n.listed)
  const n1 = nfts.find((n) => n.collectionId === c1.id && n.listed)

  return [
    {
      id: 'off-1',
      type: 'item',
      collectionId: c0.id,
      nftId: n0?.id,
      offerer: '0xWhale…4b12',
      price: +(c0.floorPrice * 0.9).toPrecision(6),
      expiresAt: daysFromNow(3),
      createdAt: hoursAgo(2),
    },
    {
      id: 'off-2',
      type: 'collection',
      collectionId: c0.id,
      offerer: '0xWhale…4b12',
      price: +(c0.floorPrice * 0.85).toPrecision(6),
      quantity: 5,
      expiresAt: daysFromNow(7),
      createdAt: hoursAgo(5),
    },
    {
      id: 'off-3',
      type: 'collection',
      collectionId: c1.id,
      offerer: currentUser,
      price: +(c1.floorPrice * 0.95).toPrecision(6),
      quantity: 3,
      expiresAt: daysFromNow(5),
      createdAt: hoursAgo(1),
    },
    {
      id: 'off-4',
      type: 'item',
      collectionId: c1.id,
      nftId: n1?.id,
      offerer: '0xArtist…e8d0',
      price: +(c1.floorPrice * 1.05).toPrecision(6),
      expiresAt: daysFromNow(2),
      createdAt: hoursAgo(8),
    },
    {
      id: 'off-5',
      type: 'collection',
      collectionId: demo.id,
      offerer: '0xWhale…4b12',
      price: +(demo.floorPrice * 0.8).toPrecision(6),
      quantity: 20,
      expiresAt: daysFromNow(14),
      createdAt: hoursAgo(12),
    },
  ]
}

/** Demo activity feed scaled from OpenSea collection floors */
export function buildActivities(collections: Collection[], nfts: Nft[]): Activity[] {
  const acts: Activity[] = []
  let i = 0
  const buyers = [
    '0xOpenHood…7a3f',
    '0xWhale…4b12',
    '0xArtist…e8d0',
    '0xFounder…9c21',
    '0xAnon…22bb',
  ]
  const sellers = ['0xAnon…11aa', '0xArtist…e8d0', '0xFounder…9c21', '0xWhale…4b12']

  for (const col of collections) {
    const colNfts = nfts.filter((n) => n.collectionId === col.id)
    if (colNfts.length === 0) continue

    const saleCount = Math.min(6, Math.max(3, Math.round((col.intervals?.sales1d || 20) / 80)))
    for (let k = 0; k < saleCount; k++) {
      const nft = colNfts[k % colNfts.length]
      acts.push({
        id: `act-sale-${i++}`,
        type: 'sale',
        collectionId: col.id,
        nftId: nft.id,
        from: sellers[k % sellers.length],
        to: buyers[k % buyers.length],
        price: +(col.floorPrice * (0.92 + k * 0.03)).toPrecision(6),
        timestamp: hoursAgo(0.2 + k * 1.4 + (i % 7) * 0.3),
      })
    }

    acts.push({
      id: `act-list-${i++}`,
      type: 'listing',
      collectionId: col.id,
      nftId: colNfts[0].id,
      from: buyers[0],
      price: col.floorPrice,
      timestamp: hoursAgo(0.8 + (i % 5)),
    })

    acts.push({
      id: `act-mint-${i++}`,
      type: 'mint',
      collectionId: col.id,
      from: buyers[i % buyers.length],
      to: buyers[i % buyers.length],
      price: +(col.floorPrice * 0.5).toPrecision(6),
      timestamp: hoursAgo(0.4 + (i % 9)),
    })
  }

  acts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return acts
}
