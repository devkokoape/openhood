import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useMarketplace } from '../../context/MarketplaceContext'
import type { OfferType } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  collectionId: string
  nftId?: string
  /** Only pass "collection" from the collection page. NFT pages use item only. */
  defaultType?: OfferType
  collectionName?: string
  nftName?: string
  floorPrice?: number
  /** When true, this modal is collection-offer only (collection page). */
  collectionOfferOnly?: boolean
}

export function OfferModal({
  open,
  onClose,
  collectionId,
  nftId,
  defaultType = nftId ? 'item' : 'collection',
  collectionName,
  nftName,
  floorPrice,
  collectionOfferOnly = false,
}: Props) {
  const { makeOffer, user, connected, connect } = useMarketplace()
  const type: OfferType = collectionOfferOnly ? 'collection' : 'item'
  const defaultPrice = (fp?: number) => {
    if (fp == null || fp <= 0) return ''
    const v = fp * 0.9
    return String(v >= 0.01 ? +v.toFixed(4) : +v.toPrecision(4))
  }
  const [price, setPrice] = useState(defaultPrice(floorPrice))
  const [quantity, setQuantity] = useState('1')
  const [days, setDays] = useState('7')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (open) {
      setDone(false)
      setPrice(defaultPrice(floorPrice))
      setQuantity('1')
    }
  }, [open, floorPrice])

  // silence unused when item-only
  void defaultType

  const submit = () => {
    if (!connected) {
      connect()
      return
    }
    const p = parseFloat(price)
    if (!p || p <= 0 || Number.isNaN(p)) {
      toast.error('Enter a valid offer price in ETH')
      return
    }
    if (type === 'collection') {
      const q = parseInt(quantity, 10)
      if (!q || q < 1) {
        toast.error('Quantity must be at least 1')
        return
      }
    }
    const expiresAt = new Date(Date.now() + parseInt(days, 10) * 86400_000).toISOString()
    try {
      makeOffer({
        type,
        collectionId,
        nftId: type === 'item' ? nftId : undefined,
        offerer: user || 'unknown',
        price: p,
        quantity: type === 'collection' ? parseInt(quantity, 10) || 1 : undefined,
        expiresAt,
      })
      setDone(true)
    } catch {
      connect()
    }
  }

  const handleClose = () => {
    setDone(false)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        done
          ? 'Offer placed'
          : collectionOfferOnly
            ? 'Collection offer'
            : 'Make an offer'
      }
      footer={
        done ? (
          <Button onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!price || parseFloat(price) <= 0}>
              Place offer
            </Button>
          </>
        )
      }
    >
      {done ? (
        <p className="text-sm text-ink-2">
          Your {type === 'collection' ? 'collection' : 'item'} offer of{' '}
          <span className="text-hood font-semibold">{price} ETH</span> has been submitted.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-ink-2">
            {collectionOfferOnly ? (
              <>
                Collection offer on{' '}
                <span className="text-ink font-medium">{collectionName ?? 'collection'}</span>
              </>
            ) : (
              <>
                Offering on <span className="text-ink font-medium">{nftName}</span>
              </>
            )}
          </div>

          <label className="block">
            <span className="text-xs font-medium text-ink-3 uppercase tracking-wide">
              Offer price (ETH)
            </span>
            <input
              type="number"
              step="0.001"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 w-full h-11 px-3 rounded-xl bg-surface-2 border border-edge text-ink focus:outline-none focus:border-hood"
              placeholder="0.00"
            />
            {floorPrice != null && (
              <span className="text-xs text-ink-3 mt-1 block">
                Floor: {floorPrice} ETH ·{' '}
                {((parseFloat(price || '0') / floorPrice) * 100 || 0).toFixed(0)}% of floor
              </span>
            )}
          </label>

          {collectionOfferOnly && (
            <label className="block">
              <span className="text-xs font-medium text-ink-3 uppercase tracking-wide">
                Quantity (max items)
              </span>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 w-full h-11 px-3 rounded-xl bg-surface-2 border border-edge text-ink focus:outline-none focus:border-hood"
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs font-medium text-ink-3 uppercase tracking-wide">Expires in</span>
            <select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="mt-1 w-full h-11 px-3 rounded-xl bg-surface-2 border border-edge text-ink focus:outline-none focus:border-hood"
            >
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </label>
        </div>
      )}
    </Modal>
  )
}
