/**
 * The city of github.com/owner/repo lives at /owner/repo: swap the host and
 * you are there. Older /r/owner/repo links, a trailing .git, deep GitHub
 * paths (/tree/main/src, /pull/12) and a pasted github.com/ prefix all
 * resolve to the same city. The worker mirrors this in edge/src/route.ts.
 */
export const RESERVED = new Set(['api', 'badge', 's', 'og', 'assets', 'samples'])

const SEG = /^[\w.-]+$/

export interface RepoPath {
  owner: string
  name: string
  /** The canonical path, /owner/name. */
  path: string
}

export function repoFromPath(pathname: string): RepoPath | null {
  let parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'r') parts = parts.slice(1)
  else if (/^(www\.)?github\.com$/i.test(parts[0] ?? '')) parts = parts.slice(1)
  const [owner, raw] = parts
  if (!owner || !raw || RESERVED.has(owner)) return null
  const name = raw.replace(/\.git$/, '')
  if (!SEG.test(owner) || !SEG.test(name)) return null
  return { owner, name, path: `/${owner}/${name}` }
}

export const cityPath = (owner: string, name: string) => `/${owner}/${name}`
