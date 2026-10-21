/** "code" in the grotesque and "skyline" in the italic serif, lowercase, one size. */
export function Wordmark({ size = 15, onClick }: { size?: number; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag onClick={onClick} className={`inline-flex items-baseline leading-none ${onClick ? 'hover:opacity-80' : ''}`} style={{ fontSize: size }}>
      <span className="font-display font-bold tracking-[-0.03em]">code</span>
      <span className="font-serif text-amber italic" style={{ marginLeft: '0.06em' }}>
        skyline
      </span>
    </Tag>
  )
}
