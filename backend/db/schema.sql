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
  type       VARCHAR(20) NOT NULL DEFAULT 'text',  -- 'text', 'code', or 'draw'
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