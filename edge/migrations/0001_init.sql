-- Repositories we have analyzed at least once.
CREATE TABLE IF NOT EXISTS repos (
  owner          TEXT NOT NULL,
  name           TEXT NOT NULL,
  default_branch TEXT,
  latest_sha     TEXT,
  stars          INTEGER DEFAULT 0,
  first_seen     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (owner, name)
);

-- One row per analyzed commit. `summary` is the compact JSON the badge and
-- gallery render from (counts + 48-column skyline).
CREATE TABLE IF NOT EXISTS analyses (
  key         TEXT PRIMARY KEY,          -- owner/name@sha
  owner       TEXT NOT NULL,
  name        TEXT NOT NULL,
  sha         TEXT NOT NULL,
  r2_key      TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  analyzed_at INTEGER NOT NULL,
  files       INTEGER NOT NULL,
  lines       INTEGER NOT NULL,
  commits     INTEGER NOT NULL,
  authors     INTEGER NOT NULL,
  burning     INTEGER NOT NULL,
  summary     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS analyses_repo ON analyses (owner, name, analyzed_at DESC);

-- Short links: /s/:id → a viewer path + query string.
CREATE TABLE IF NOT EXISTS shares (
  id         TEXT PRIMARY KEY,
  target     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  hits       INTEGER NOT NULL DEFAULT 0
);

-- Monthly job budget (the app-level spending cap).
CREATE TABLE IF NOT EXISTS usage (
  month TEXT PRIMARY KEY,                -- YYYY-MM
  jobs  INTEGER NOT NULL DEFAULT 0
);
