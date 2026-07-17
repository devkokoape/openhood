import type { Activity, Collection, MintDrop, Nft, Offer, UserProfile } from '../types'
import { collectionsFromOpenSeaSnapshot } from '../lib/opensea'
import { nftArtUrl } from './art'
import {
  buildActivities,
  buildMintDrops,
  buildOffers,
  daysFromNow,
  hoursAgo,
} from './seedMarket'

export { nftArtUrl, hoursAgo, daysFromNow }

export const CURRENT_USER = '0xOpenHood…7a3f'

export const profiles: Record<string, UserProfile> = {
  [CURRENT_USER]: {
    address: CURRENT_USER,
    displayName: 'You',
    avatar: nftArtUrl('you', 'YOU'),
    bio: 'Trading on Robinhood Chain · OpenHood collector · OpenSea stats powered',
    joinedAt: '2026-03-12',
    twitter: 'openhood_user',
    website: 'https://openhood.app',
  },
  '0xFounder…9c21': {
    address: '0xFounder…9c21',
    displayName: 'HoodLabs',
    avatar: nftArtUrl('founder', 'HL'),
    bio: 'Building the next wave of onchain culture on Robinhood Chain.',
    joinedAt: '2026-01-05',
    twitter: 'hoodlabs',
    website: 'https://hoodlabs.xyz',
  },
  '0xWhale…4b12': {
    address: '0xWhale…4b12',
    displayName: 'ChainWhale',
    avatar: nftArtUrl('whale', 'CW'),
    bio: 'Floor sniper · bulk buyer',
    joinedAt: '2026-02-18',
  },
  '0xArtist…e8d0': {
    address: '0xArtist…e8d0',
    displayName: 'PixelMint',
    avatar: nftArtUrl('artist', 'PM'),
    bio: 'Digital art on RH Chain',
    joinedAt: '2026-04-01',
  },
}

/** Real Robinhood Chain collections + stats from OpenSea Analytics API */
const openSeaCollections = collectionsFromOpenSeaSnapshot()

const demoOpenPixels: Collection = {
  id: 'col-open-pixels',
  name: 'Open Pixels',
  slug: 'open-pixels',
  description:
    '24×24 pixel avatars for the OpenHood community. Demo collection you can edit as founder.',
  image: nftArtUrl('open-pixels', 'OP'),
  banner: nftArtUrl('open-pixels-banner', 'Open Pixels'),
  floorPrice: 0.03,
  volume24h: 12.8,
  volumeTotal: 420,
  items: 8888,
  owners: 5200,
  founder: CURRENT_USER,
  website: 'https://openpixels.hood',
  twitter: 'openpixels',
  verified: true,
  source: 'demo',
  chain: 'robinhood',
  salesTotal: 2100,
  intervals: {
    volume1d: 12.8,
    sales1d: 48,
    volume7d: 90,
    sales7d: 320,
    volume30d: 280,
    sales30d: 900,
    volumeTotal: 420,
    salesTotal: 2100,
  },
}

export let collections: Collection[] = [...openSeaCollections, demoOpenPixels]

const BACKGROUNDS = ['Midnight', 'Emerald', 'Grid', 'Neon', 'Void', 'Gold Wash']
const EYES = ['Laser', 'Calm', 'Glitch', 'Diamond', 'Bloodshot', 'Closed']
const ACCESSORIES = ['Hood Cap', 'Gold Chain', 'None', 'Visor', 'Crown', 'Feather']
const MOUTHS = ['Grin', 'Smirk', 'Open', 'Fangs', 'Pipe']
const BODIES = ['Classic', 'Robot', 'Ghost', 'Pixel', 'Ape']

function pickTrait(arr: string[], seed: number, rareEvery: number, rareIndex: number): string {
  if (seed % rareEvery === 0) return arr[rareIndex % arr.length]
  return arr[seed % arr.length]
}

function makeTraits(seed: number): { trait_type: string; value: string }[] {
  return [
    { trait_type: 'Background', value: pickTrait(BACKGROUNDS, seed, 11, 4) },
    { trait_type: 'Eyes', value: pickTrait(EYES, seed * 3 + 1, 7, 3) },
    { trait_type: 'Accessory', value: pickTrait(ACCESSORIES, seed * 5 + 2, 13, 4) },
    { trait_type: 'Mouth', value: pickTrait(MOUTHS, seed * 7 + 3, 9, 3) },
    { trait_type: 'Body', value: pickTrait(BODIES, seed * 11 + 4, 17, 2) },
  ]
}

function makeNfts(): Nft[] {
  const list: Nft[] = []
  const owners = [
    CURRENT_USER,
    '0xWhale…4b12',
    '0xArtist…e8d0',
    '0xFounder…9c21',
    '0xAnon…11aa',
    '0xAnon…22bb',
  ]

  collections.forEach((col, ci) => {
    for (let i = 1; i <= 18; i++) {
      const seed = ci * 100 + i
      const id = `${col.id}-nft-${i}`
      const listed = i % 3 !== 0
      const priceJitter = ((seed * 17) % 100) / 1000
      const price = listed
        ? +(col.floorPrice * (0.95 + (i % 5) * 0.08 + priceJitter)).toPrecision(6)
        : undefined
      const useOsImage = col.source === 'opensea' && i <= 2
      list.push({
        id,
        tokenId: i + ci * 100,
        name: `${col.name} #${i + ci * 100}`,
        collectionId: col.id,
        image: useOsImage ? col.image : nftArtUrl(id, `#${i + ci * 100}`),
        owner: owners[(ci + i) % owners.length],
        listed,
        price,
        lastSale: +(col.floorPrice * (0.8 + (i % 4) * 0.05)).toPrecision(6),
        traits: makeTraits(seed),
      })
    }
  })

  const byCol = new Map<string, Nft[]>()
  for (const n of list) {
    const arr = byCol.get(n.collectionId) || []
    arr.push(n)
    byCol.set(n.collectionId, arr)
  }
  for (const [, group] of byCol) {
    const scores = group.map((nft) => {
      const counts = new Map<string, number>()
      for (const n of group) {
        for (const t of n.traits || []) {
          const k = `${t.trait_type}::${t.value}`
          counts.set(k, (counts.get(k) || 0) + 1)
        }
      }
      let score = 0
      for (const t of nft.traits || []) {
        score += 1 / (counts.get(`${t.trait_type}::${t.value}`) || 1)
      }
      return { nft, score }
    })
    scores.sort((a, b) => b.score - a.score || a.nft.tokenId - b.nft.tokenId)
    scores.forEach((s, idx) => {
      s.nft.rarityRank = idx + 1
    })
  }

  return list
}

export let nfts: Nft[] = makeNfts()
export let mintDrops: MintDrop[] = buildMintDrops(collections, CURRENT_USER)
export let offers: Offer[] = buildOffers(collections, nfts, CURRENT_USER)
export let activities: Activity[] = buildActivities(collections, nfts)

export function getCollection(idOrSlug: string): Collection | undefined {
  return collections.find((c) => c.id === idOrSlug || c.slug === idOrSlug)
}

export function getNft(id: string): Nft | undefined {
  return nfts.find((n) => n.id === id)
}

export function getNftsByCollection(collectionId: string): Nft[] {
  return nfts.filter((n) => n.collectionId === collectionId)
}

export function getNftsByOwner(address: string): Nft[] {
  return nfts.filter((n) => n.owner === address)
}

export function formatPrice(n?: number): string {
  if (n == null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(2)}K`
  if (n >= 1) return n.toFixed(3)
  if (n >= 0.01) return n.toFixed(4)
  if (n >= 0.0001) return n.toFixed(5)
  if (n === 0) return '0'
  return n.toPrecision(3)
}

export { formatAddress } from '../lib/address'

export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function updateCollectionLinks(
  id: string,
  links: { website?: string; twitter?: string; discord?: string; description?: string }
): boolean {
  const idx = collections.findIndex((c) => c.id === id)
  if (idx < 0) return false
  collections = [
    ...collections.slice(0, idx),
    { ...collections[idx], ...links },
    ...collections.slice(idx + 1),
  ]
  return true
}

export function patchCollection(id: string, patch: Partial<Collection>): boolean {
  const idx = collections.findIndex((c) => c.id === id)
  if (idx < 0) return false
  collections = [
    ...collections.slice(0, idx),
    { ...collections[idx], ...patch },
    ...collections.slice(idx + 1),
  ]
  return true
}

export function addOffer(offer: Omit<Offer, 'id' | 'createdAt'>): Offer {
  const o: Offer = {
    ...offer,
    id: `off-${Date.now()}`,
    createdAt: new Date().toISOString(),
  }
  offers = [o, ...offers]
  activities = [
    {
      id: `act-${Date.now()}`,
      type: offer.type === 'collection' ? 'collection_offer' : 'offer',
      collectionId: offer.collectionId,
      nftId: offer.nftId,
      from: offer.offerer,
      price: offer.price,
      timestamp: new Date().toISOString(),
    },
    ...activities,
  ]
  return o
}

export function buyNft(nftId: string, buyer: string): boolean {
  const idx = nfts.findIndex((n) => n.id === nftId)
  if (idx < 0 || !nfts[idx].listed || !nfts[idx].price) return false
  const nft = nfts[idx]
  const price = nft.price!
  nfts = [
    ...nfts.slice(0, idx),
    { ...nft, owner: buyer, listed: false, price: undefined, lastSale: price },
    ...nfts.slice(idx + 1),
  ]
  activities = [
    {
      id: `act-${Date.now()}`,
      type: 'sale',
      collectionId: nft.collectionId,
      nftId: nft.id,
      from: nft.owner,
      to: buyer,
      price,
      timestamp: new Date().toISOString(),
    },
    ...activities,
  ]
  return true
}

export function bulkBuy(nftIds: string[], buyer: string): number {
  let count = 0
  for (const id of nftIds) {
    if (buyNft(id, buyer)) count++
  }
  return count
}

export function listNft(nftId: string, price: number): boolean {
  const idx = nfts.findIndex((n) => n.id === nftId)
  if (idx < 0) return false
  const nft = nfts[idx]
  nfts = [...nfts.slice(0, idx), { ...nft, listed: true, price }, ...nfts.slice(idx + 1)]
  activities = [
    {
      id: `act-${Date.now()}`,
      type: 'listing',
      collectionId: nft.collectionId,
      nftId: nft.id,
      from: nft.owner,
      price,
      timestamp: new Date().toISOString(),
    },
    ...activities,
  ]
  return true
}

export function getMintDrop(idOrSlug: string): MintDrop | undefined {
  return mintDrops.find((m) => m.id === idOrSlug || m.slug === idOrSlug)
}

export function mintFromDrop(slug: string, buyer: string, quantity: number): number {
  const idx = mintDrops.findIndex((m) => m.slug === slug || m.id === slug)
  if (idx < 0) return 0
  const drop = mintDrops[idx]
  if (drop.status !== 'live') return 0
  const remaining = drop.supply - drop.minted
  const qty = Math.min(Math.max(1, quantity), drop.maxPerWallet, remaining)
  if (qty <= 0) return 0

  mintDrops = [
    ...mintDrops.slice(0, idx),
    {
      ...drop,
      minted: drop.minted + qty,
      status: drop.minted + qty >= drop.supply ? 'ended' : drop.status,
    },
    ...mintDrops.slice(idx + 1),
  ]

  const collectionId = drop.collectionId || 'col-open-pixels'
  const baseId = Date.now()
  for (let i = 0; i < qty; i++) {
    const tokenId = drop.minted + i + 1
    const id = `minted-${drop.slug}-${baseId}-${i}`
    nfts = [
      {
        id,
        tokenId,
        name: `${drop.name} #${tokenId}`,
        collectionId,
        image: nftArtUrl(id, `#${tokenId}`),
        owner: buyer,
        listed: false,
        traits: [
          { trait_type: 'Drop', value: drop.name },
          { trait_type: 'Origin', value: 'Degen Mint' },
        ],
      },
      ...nfts,
    ]
  }

  activities = [
    {
      id: `act-${baseId}`,
      type: 'mint',
      collectionId,
      from: buyer,
      to: buyer,
      price: drop.price * qty,
      timestamp: new Date().toISOString(),
    },
    ...activities,
  ]

  return qty
}
