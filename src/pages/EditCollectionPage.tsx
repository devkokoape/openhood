import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMarketplace } from '../context/MarketplaceContext'
import { Button } from '../components/ui/Button'

export function EditCollectionPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { collections, user, updateCollection } = useMarketplace()
  const collection = collections.find((c) => c.slug === slug || c.id === slug)

  const [website, setWebsite] = useState(collection?.website || '')
  const [twitter, setTwitter] = useState(collection?.twitter || '')
  const [discord, setDiscord] = useState(collection?.discord || '')
  const [description, setDescription] = useState(collection?.description || '')
  const [saved, setSaved] = useState(false)

  if (!collection) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center text-ink-2">
        Collection not found.
      </div>
    )
  }

  if (user !== collection.founder) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <p className="text-ink-2">Only the collection founder can edit links.</p>
        <Link to={`/collection/${collection.slug}`} className="text-hood text-sm mt-3 inline-block">
          Back to collection
        </Link>
      </div>
    )
  }

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    updateCollection(collection.id, {
      website: website || undefined,
      twitter: twitter.replace(/^@/, '') || undefined,
      discord: discord || undefined,
      description,
    })
    setSaved(true)
    setTimeout(() => navigate(`/collection/${collection.slug}`), 800)
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 animate-fade-in">
      <Link
        to={`/collection/${collection.slug}`}
        className="text-sm text-ink-3 hover:text-hood mb-4 inline-block"
      >
        ← {collection.name}
      </Link>
      <h1 className="text-2xl font-bold text-ink">Edit collection links</h1>
      <p className="text-sm text-ink-2 mt-1">
        Founders can update public links and description for their collection.
      </p>

      <form onSubmit={save} className="mt-8 space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-ink-3 uppercase tracking-wide">Website</span>
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://…"
            className="mt-1 w-full h-11 px-3 rounded-xl bg-surface-2 border border-edge text-ink focus:outline-none focus:border-hood"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-3 uppercase tracking-wide">
            X / Twitter handle
          </span>
          <input
            value={twitter}
            onChange={(e) => setTwitter(e.target.value)}
            placeholder="username"
            className="mt-1 w-full h-11 px-3 rounded-xl bg-surface-2 border border-edge text-ink focus:outline-none focus:border-hood"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-3 uppercase tracking-wide">Discord</span>
          <input
            value={discord}
            onChange={(e) => setDiscord(e.target.value)}
            placeholder="https://discord.gg/…"
            className="mt-1 w-full h-11 px-3 rounded-xl bg-surface-2 border border-edge text-ink focus:outline-none focus:border-hood"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-ink-3 uppercase tracking-wide">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="mt-1 w-full px-3 py-2 rounded-xl bg-surface-2 border border-edge text-ink focus:outline-none focus:border-hood resize-y"
          />
        </label>

        <div className="flex gap-2 pt-2">
          <Button type="submit" fullWidth disabled={saved}>
            {saved ? 'Saved!' : 'Save changes'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
