/** The little we need from GitHub before cloning: size, visibility, HEAD. */
export interface RepoInfo {
  owner: string
  name: string
  defaultBranch: string
  sizeKB: number
  stars: number
  sha: string
  isPrivate: boolean
  archived: boolean
}

const UA = 'codeskyline (+https://github.com/harshitaajoshi/codeskyline)'

export class GitHubError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

export async function resolveRepo(owner: string, name: string, token?: string): Promise<RepoInfo> {
  const headers: Record<string, string> = { 'User-Agent': UA, Accept: 'application/vnd.github+json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const r = await fetch(`https://api.github.com/repos/${owner}/${name}`, { headers })
  if (r.status === 404) throw new GitHubError('repository not found (private repos are not supported)', 404)
  if (r.status === 403 || r.status === 429) throw new GitHubError('GitHub API rate limit reached, try again in a minute', 429)
  if (!r.ok) throw new GitHubError(`GitHub API error ${r.status}`, 502)
  const j = (await r.json()) as {
    default_branch: string
    size: number
    private: boolean
    archived: boolean
    stargazers_count: number
    owner: { login: string }
    name: string
  }
  const b = await fetch(`https://api.github.com/repos/${owner}/${name}/commits/${encodeURIComponent(j.default_branch)}`, {
    headers: { ...headers, Accept: 'application/vnd.github.sha' },
  })
  if (!b.ok) throw new GitHubError(`could not resolve ${j.default_branch}`, 502)
  const sha = (await b.text()).trim()
  return {
    owner: j.owner.login,
    name: j.name,
    defaultBranch: j.default_branch,
    sizeKB: j.size,
    stars: j.stargazers_count,
    sha,
    isPrivate: j.private,
    archived: j.archived,
  }
}

const repoUrl = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?(?:[?#].*)?$/i
const bare = /^([\w.-]+)\/([\w.-]+)$/

/** Accepts a GitHub URL or "owner/name". */
export function parseRepoInput(s: string): { owner: string; name: string } | null {
  const t = s.trim()
  const m = repoUrl.exec(t) ?? bare.exec(t)
  if (!m) return null
  const owner = m[1]!
  const name = m[2]!
  if (owner.startsWith('.') || name.startsWith('.')) return null
  return { owner, name }
}
