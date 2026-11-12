-- canvas app schema
-- run with: psql -U postgres -d free_code -f backend/db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- users
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- more secure
  username      VARCHAR(50) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NULL,
  password_hash TEXT NULL,
  is_guest      BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- guest accounts: brings databases created before guests existed up to date
-- (CREATE TABLE IF NOT EXISTS above skips tables that already exist).
-- Safe to re-run.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- canvases (the session / shared room)
CREATE TABLE IF NOT EXISTS canvases (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(255) NOT NULL DEFAULT 'Untitled',
  share_id   VARCHAR(12) UNIQUE NOT NULL,  -- short slug e.g. "xk92p"
  is_public  BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canvases_user_id ON canvases(user_id);

-- blocks (the free-form content saved on a canvas)
CREATE TABLE IF NOT EXISTS blocks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id  UUID REFERENCES canvases(id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL DEFAULT 'text',  -- 'text', 'code', 'draw', 'image', 'shape' or 'arrow'
  language   VARCHAR(20) NOT NULL DEFAULT 'javascript',  -- see LANGUAGES in sandbox.ts
  content    TEXT NOT NULL DEFAULT '',
  x          FLOAT NOT NULL DEFAULT 100,
  y          FLOAT NOT NULL DEFAULT 100,
  width      FLOAT NOT NULL DEFAULT 300,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocks_canvas_id ON blocks(canvas_id);

-- per-block language: brings databases created before it existed up to date. Safe to re-run.
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS language VARCHAR(20) NOT NULL DEFAULT 'javascript';

-- optional web link attached to a block (right-click > Add link). Safe to re-run.
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS link TEXT;

-- text block sizing, set by dragging its handles (and pasted text's wrap).
-- wrap_width: where its lines wrap; NULL means they don't (the block grows
-- with its longest line). font_size: in px; NULL means the default. Safe to re-run.
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS wrap_width FLOAT;
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS font_size FLOAT;

-- guest cleanup: when a guest last used the app, refreshed at most hourly
-- (middleware/auth). Guests idle for 15 days are deleted with everything
-- they own (cleanup.ts). Safe to re-run.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP NOT NULL DEFAULT NOW();

-- a block's id in the browser it was uploaded from (local-…), so uploading
-- the same block again — a retry after a lost response — is a no-op instead
-- of a duplicate. NULL for blocks made on the server. Safe to re-run.
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS client_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_client_id ON blocks(canvas_id, client_id) WHERE client_id IS NOT NULL;

-- a text block's color (right-click > properties panel); NULL means the
-- theme's default text color. Safe to re-run.
ALTER TABLE blocks ADD COLUMN IF NOT EXISTS color VARCHAR(32);

-- AI architecture diagrams: the model the AI drew a canvas's diagram from
-- (sections, edges; the shape is architecture.schema.ts), and the repo and
-- commit it was read from. Later steps use it as context: a section's chat
-- needs the whole model and which files belong to the section, which the
-- diagram's shapes alone don't hold. Each generation is a new row, so the
-- latest is the current one; older ones are pruned (models/architectures.ts).
-- created_by is who asked for it; it outlives them, since the canvas may be
-- someone else's. Safe to re-run.
CREATE TABLE IF NOT EXISTS architectures (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id  UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  repo_url   TEXT NOT NULL CHECK (length(repo_url) <= 500),
  commit_sha CHAR(40) NOT NULL CHECK (commit_sha ~ '^[0-9a-f]{40}$'),
  model      JSONB NOT NULL CHECK (jsonb_typeof(model) = 'object'),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_architectures_canvas ON architectures(canvas_id, created_at DESC);
