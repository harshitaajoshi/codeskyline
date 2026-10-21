/** CODE in the grotesque, Skyline in the italic serif: the two voices of the site in one word. */
export function Wordmark({ size = 15, onClick }: { size?: number; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag onClick={onClick} className={`inline-flex items-baseline leading-none ${onClick ? 'hover:opacity-80' : ''}`} style={{ fontSize: size }}>
      <span className="font-display font-black tracking-[-0.03em] uppercase">Code</span>
      <span className="font-serif text-amber italic" style={{ fontSize: size * 1.34, marginLeft: size * 0.08 }}>
        Skyline
      </span>
    </Tag>
  )
}
