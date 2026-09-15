-- canvas app schema
-- run with: psql -U postgres -d free_code -f backend/db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- users
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- more secure
  username      VARCHAR(50) UNIQUE NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);

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

CREATE INDEX IF NOT EXISTS idx_blocks_canvas_id ON blocks(canvas_id);

CREATE INDEX IF NOT EXISTS idx_canvases_user_id ON canvases(user_id);

-- blocks (the free-form content saved on a canvas)
CREATE TABLE IF NOT EXISTS blocks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canvas_id  UUID REFERENCES canvases(id) ON DELETE CASCADE,
  type       VARCHAR(20) NOT NULL DEFAULT 'text',  -- 'text', 'code', or 'draw'
  content    TEXT NOT NULL DEFAULT '',
  x          FLOAT NOT NULL DEFAULT 100,
  y          FLOAT NOT NULL DEFAULT 100,
  width      FLOAT NOT NULL DEFAULT 300,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);