/**
 * The mark: three towers, the tallest on fire. The word: "code" in the
 * grotesque and "skyline" in the italic serif, both in small caps at one size.
 */
export function Wordmark({ size = 15, onClick }: { size?: number; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag onClick={onClick} className={`inline-flex items-center gap-[0.55em] leading-none ${onClick ? 'hover:opacity-80' : ''}`} style={{ fontSize: size }}>
      <Mark size={size * 1.25} />
      <span style={{ fontVariantCaps: 'small-caps' }} className="inline-flex items-baseline">
        <span className="font-display font-black tracking-[-0.02em]">code</span>
        <span className="font-serif text-amber italic" style={{ marginLeft: '0.08em' }}>
          skyline
        </span>
      </span>
    </Tag>
  )
}

export function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      {/* three towers */}
      <rect x="1.5" y="10" width="4.2" height="9" fill="currentColor" />
      <rect x="7.9" y="5.5" width="4.2" height="13.5" fill="currentColor" />
      <rect x="14.3" y="8" width="4.2" height="11" fill="currentColor" />
      {/* windows, cut out */}
      <rect x="2.6" y="12" width="1" height="1" fill="#0c0c0c" />
      <rect x="9" y="8" width="1" height="1" fill="#0c0c0c" />
      <rect x="9" y="11" width="1" height="1" fill="#0c0c0c" />
      <rect x="15.4" y="10" width="1" height="1" fill="#0c0c0c" />
      <rect x="15.4" y="13" width="1" height="1" fill="#0c0c0c" />
      {/* the flame */}
      <path d="M10 .6c-1.3 1.3-1.9 2.2-1.9 3.1 0 1 .8 1.7 1.9 1.7s1.9-.7 1.9-1.7c0-.9-.6-1.8-1.9-3.1Z" fill="#e7633b" />
    </svg>
  )
}
