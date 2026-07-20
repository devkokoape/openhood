/**
 * Marketplace-tier animated icons — subtle continuous motion.
 * Lucide shapes + CSS (no extra deps). Honors prefers-reduced-motion via CSS.
 */
import clsx from 'clsx'
import type { ReactNode } from 'react'
import {
  Activity,
  Compass,
  Flame,
  Layers,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react'

type Size = 'sm' | 'md' | 'lg'

const sizeClass: Record<Size, string> = {
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
}

interface BaseProps {
  className?: string
  size?: Size
  /** Pause continuous motion */
  paused?: boolean
  strokeWidth?: number
}

function IconMotion({
  anim,
  className,
  size = 'md',
  paused,
  children,
}: BaseProps & { anim: string; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center',
        sizeClass[size],
        !paused && anim,
        className
      )}
      aria-hidden
    >
      {children}
    </span>
  )
}

/** Discover — compass needle sweeps */
export function AnimatedCompass({
  className,
  size = 'md',
  paused,
  strokeWidth = 2.25,
}: BaseProps) {
  return (
    <IconMotion anim="icon-compass" className={className} size={size} paused={paused}>
      <Compass className="w-full h-full" strokeWidth={strokeWidth} />
    </IconMotion>
  )
}

/** Trending / hot — soft flame flicker */
export function AnimatedFlame({
  className,
  size = 'md',
  paused,
  strokeWidth = 2.25,
}: BaseProps) {
  return (
    <IconMotion anim="icon-flame" className={className} size={size} paused={paused}>
      <Flame className="w-full h-full" strokeWidth={strokeWidth} />
    </IconMotion>
  )
}

/** Degen / power — electric pulse */
export function AnimatedZap({
  className,
  size = 'md',
  paused,
  strokeWidth = 2.5,
}: BaseProps) {
  return (
    <IconMotion anim="icon-zap" className={className} size={size} paused={paused}>
      <Zap className="w-full h-full" strokeWidth={strokeWidth} />
    </IconMotion>
  )
}

/** Notable / rankings — trophy gleam */
export function AnimatedTrophy({
  className,
  size = 'md',
  paused,
  strokeWidth = 2.25,
}: BaseProps) {
  return (
    <IconMotion anim="icon-trophy" className={className} size={size} paused={paused}>
      <Trophy className="w-full h-full" strokeWidth={strokeWidth} />
    </IconMotion>
  )
}

/** Brand mark — layered stacks breathe */
export function AnimatedLayers({
  className,
  size = 'md',
  paused,
  strokeWidth = 2.5,
}: BaseProps) {
  return (
    <IconMotion anim="icon-layers" className={className} size={size} paused={paused}>
      <Layers className="w-full h-full" strokeWidth={strokeWidth} />
    </IconMotion>
  )
}

/** Sparkles — twinkle for featured / mint */
export function AnimatedSparkles({
  className,
  size = 'md',
  paused,
  strokeWidth = 2.25,
}: BaseProps) {
  return (
    <IconMotion anim="icon-sparkles" className={className} size={size} paused={paused}>
      <Sparkles className="w-full h-full" strokeWidth={strokeWidth} />
    </IconMotion>
  )
}

/** Activity — live pulse for feeds / rankings */
export function AnimatedActivity({
  className,
  size = 'md',
  paused,
  strokeWidth = 2.25,
}: BaseProps) {
  return (
    <IconMotion anim="icon-activity" className={className} size={size} paused={paused}>
      <Activity className="w-full h-full" strokeWidth={strokeWidth} />
    </IconMotion>
  )
}

/**
 * Soft badge shell around an animated icon (section headers).
 * Hover slightly boosts motion via CSS.
 */
export function AnimatedIconBadge({
  children,
  className,
  tone = 'default',
}: {
  children: ReactNode
  className?: string
  tone?: 'default' | 'hood' | 'solid-hood' | 'danger'
}) {
  return (
    <div
      className={clsx(
        'icon-badge shrink-0 flex items-center justify-center',
        'w-9 h-9 rounded-xl border',
        tone === 'default' && 'bg-surface-2 border-edge text-hood',
        tone === 'hood' &&
          'bg-gradient-to-br from-hood/25 to-hood/5 border-hood/20 text-hood',
        tone === 'solid-hood' &&
          'bg-gradient-to-br from-hood to-[#00a804] border-hood/30 text-[var(--color-on-hood,#0b0e11)] shadow-md shadow-hood/25',
        tone === 'danger' &&
          'bg-[rgba(255,80,0,0.12)] border-[rgba(255,80,0,0.2)] text-[var(--color-danger)]',
        className
      )}
    >
      {children}
    </div>
  )
}
