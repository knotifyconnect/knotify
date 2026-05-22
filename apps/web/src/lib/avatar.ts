/**
 * Local SVG avatar generator — replaces all placehold.co calls
 */
const PALETTES = [
  { bg: '#E8E0D5', text: '#5C4A36' },
  { bg: '#F5E6D3', text: '#8B4513' },
  { bg: '#E0EAE8', text: '#1F6B5E' },
  { bg: '#F0E8F0', text: '#5C2A4F' },
  { bg: '#FAECD8', text: '#C8941F' },
  { bg: '#F5E8E6', text: '#D8442B' },
  { bg: '#E6EBF5', text: '#2B4ABA' },
  { bg: '#E8F0E8', text: '#2A6B2A' },
]

function hash(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h * 31) + name.charCodeAt(i)) >>> 0
  return h
}

export function avatarUrl(name: string | null | undefined, size = 80): string {
  const label = (name ?? '?').charAt(0).toUpperCase()
  const palette = PALETTES[hash(name ?? '?') % PALETTES.length]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${size / 2}" fill="${palette.bg}"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="Fraunces,Georgia,serif" font-style="italic" font-size="${Math.round(size * 0.38)}" font-weight="500" fill="${palette.text}">${label}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
