/** Deterministic SVG art for mock NFTs / demo collections */
export function nftArtUrl(seed: string, label: string): string {
  const hue = Math.abs(hash(seed)) % 360
  const hue2 = (hue + 40) % 360
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:hsl(${hue},70%,40%)"/>
      <stop offset="100%" style="stop-color:hsl(${hue2},80%,55%)"/>
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#g)"/>
  <circle cx="200" cy="160" r="70" fill="rgba(255,255,255,0.15)"/>
  <circle cx="200" cy="160" r="40" fill="rgba(0,200,5,0.5)"/>
  <text x="200" y="300" text-anchor="middle" fill="white" font-family="Source Code Pro,monospace" font-size="22" font-weight="700">${escapeXml(label)}</text>
  <text x="200" y="330" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-family="Source Code Pro,monospace" font-size="14">OpenHood</text>
</svg>`.trim()
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string)
  )
}
