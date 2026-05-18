-- =============================================================================
-- NOMAD — Full schema dump for app_nomad
-- Generated 2026-05-18, applies to any OSS Supabase project.
--
-- HOW TO APPLY
--   1. Open your Supabase project → SQL editor.
--   2. Paste this whole file and run it once.
--      (Or: `psql "$DATABASE_URL" -f schema.sql`)
--
-- The script is idempotent: it can be re-run safely. It only creates schema,
-- tables, indexes, triggers, RLS policies and grants — no seed data, no
-- per-user defaults.
--
-- AUTH MODEL
--   user_id is stored as TEXT and is expected to equal `auth.uid()::text`
--   (Supabase Auth). RLS enforces ownership for the `authenticated` role.
--   The `service_role` (used by edge functions / backend) bypasses RLS.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Schema + extensions
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app_nomad;

-- pgcrypto provides gen_random_uuid(); Supabase enables it in the `extensions`
-- schema by default, this is just a safety net.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

GRANT USAGE ON SCHEMA app_nomad TO authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 2. Trigger functions
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_nomad.tg_session_attachments_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION app_nomad.tg_user_settings_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;


-- -----------------------------------------------------------------------------
-- 3. Tables
-- -----------------------------------------------------------------------------

-- 3.1 sessions: one recording / import / paste / live capture per row.
CREATE TABLE IF NOT EXISTS app_nomad.sessions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               text NOT NULL,
  title                 text,
  input_mode            text NOT NULL DEFAULT 'rec',
  status                text NOT NULL DEFAULT 'pending',
  duration_seconds      integer,
  audio_url             text,
  storage_key           text,
  original_filename     text,
  file_size_bytes       bigint,
  mix_mode              text DEFAULT 'mono',
  sources               jsonb DEFAULT '[]'::jsonb,
  transcript            text,
  transcript_segments   jsonb,
  transcript_words      integer,
  language              text DEFAULT 'fr',
  engine_used           text,
  marks                 jsonb DEFAULT '[]'::jsonb,
  summary               text,
  error_message         text,
  offline_created       boolean DEFAULT false,
  synced_at             timestamptz,
  recorded_at           timestamptz DEFAULT now(),
  deleted_at            timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  CONSTRAINT sessions_input_mode_check
    CHECK (input_mode = ANY (ARRAY['rec','live','import','paste'])),
  CONSTRAINT sessions_mix_mode_check
    CHECK (mix_mode = ANY (ARRAY['mono','stereo_split','multi_track'])),
  CONSTRAINT sessions_status_check
    CHECK (status = ANY (ARRAY[
      'pending','recording','assembling','uploaded',
      'processing','transcribed','done','error'
    ]))
);

-- 3.2 notes: free-text annotations attached to a session.
CREATE TABLE IF NOT EXISTS app_nomad.notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES app_nomad.sessions(id) ON DELETE CASCADE,
  user_id     text NOT NULL,
  content     text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- 3.3 tags: hierarchical user tags (parent_id self-FK), optionally linked to
-- an external Mirai item (mirai_item_id is informational, no FK).
CREATE TABLE IF NOT EXISTS app_nomad.tags (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         text NOT NULL,
  name            text NOT NULL,
  emoji           text,
  hue             text,
  parent_id       uuid REFERENCES app_nomad.tags(id) ON DELETE SET NULL,
  mirai_item_id   uuid,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 3.4 session_tags: many-to-many session <-> tag.
CREATE TABLE IF NOT EXISTS app_nomad.session_tags (
  session_id  uuid NOT NULL REFERENCES app_nomad.sessions(id) ON DELETE CASCADE,
  tag_id      uuid NOT NULL REFERENCES app_nomad.tags(id)     ON DELETE CASCADE,
  user_id     text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  PRIMARY KEY (session_id, tag_id)
);

-- 3.5 session_attachments: photos / videos / screenshots / docs attached to
-- a session. Soft-deletable via deleted_at.
CREATE TABLE IF NOT EXISTS app_nomad.session_attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid NOT NULL REFERENCES app_nomad.sessions(id) ON DELETE CASCADE,
  user_id             text NOT NULL,
  kind                text NOT NULL DEFAULT 'photo',
  storage_provider    text NOT NULL DEFAULT 'supabase',
  storage_path        text NOT NULL,
  public_url          text,
  mime_type           text,
  size_bytes          bigint,
  audio_timestamp_ms  integer,
  wall_clock_ts       timestamptz NOT NULL DEFAULT now(),
  caption             text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CONSTRAINT session_attachments_kind_check
    CHECK (kind = ANY (ARRAY['photo','video','screenshot','document'])),
  CONSTRAINT session_attachments_storage_provider_check
    CHECK (storage_provider = ANY (ARRAY['supabase','nextcloud','local']))
);

-- 3.6 user_settings: per-user preferences (UUID PK = auth.uid()).
CREATE TABLE IF NOT EXISTS app_nomad.user_settings (
  user_id           uuid PRIMARY KEY,
  auto_transcribe   boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- 4. Indexes (non-PK)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sessions_created
  ON app_nomad.sessions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user_status
  ON app_nomad.sessions (user_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_not_deleted
  ON app_nomad.sessions (deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notes_session
  ON app_nomad.notes (session_id);

CREATE INDEX IF NOT EXISTS idx_tags_parent
  ON app_nomad.tags (parent_id);
CREATE INDEX IF NOT EXISTS idx_tags_user
  ON app_nomad.tags (user_id);

CREATE INDEX IF NOT EXISTS idx_session_tags_tag
  ON app_nomad.session_tags (tag_id);

CREATE INDEX IF NOT EXISTS idx_session_attachments_session_id
  ON app_nomad.session_attachments (session_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_attachments_user_id
  ON app_nomad.session_attachments (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_attachments_wall_clock
  ON app_nomad.session_attachments (wall_clock_ts DESC);


-- -----------------------------------------------------------------------------
-- 5. Triggers
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_session_attachments_set_updated_at
  ON app_nomad.session_attachments;
CREATE TRIGGER trg_session_attachments_set_updated_at
  BEFORE UPDATE ON app_nomad.session_attachments
  FOR EACH ROW
  EXECUTE FUNCTION app_nomad.tg_session_attachments_set_updated_at();

DROP TRIGGER IF EXISTS user_settings_set_updated_at
  ON app_nomad.user_settings;
CREATE TRIGGER user_settings_set_updated_at
  BEFORE UPDATE ON app_nomad.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION app_nomad.tg_user_settings_set_updated_at();


-- -----------------------------------------------------------------------------
-- 6. Row Level Security
--    All policies key off `user_id = auth.uid()::text` (or ::uuid for
--    user_settings). service_role bypasses RLS so the backend can read all
--    rows. anon has no access (handled by grants in section 7).
-- -----------------------------------------------------------------------------
ALTER TABLE app_nomad.sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_nomad.notes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_nomad.tags                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_nomad.session_tags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_nomad.session_attachments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_nomad.user_settings        ENABLE ROW LEVEL SECURITY;

-- sessions: owner full access on non-deleted rows; soft-deleted readable only.
DROP POLICY IF EXISTS sessions_owner_all              ON app_nomad.sessions;
DROP POLICY IF EXISTS sessions_owner_softdeleted_select ON app_nomad.sessions;
CREATE POLICY sessions_owner_all ON app_nomad.sessions
  FOR ALL TO authenticated
  USING       (auth.uid()::text = user_id AND deleted_at IS NULL)
  WITH CHECK  (auth.uid()::text = user_id);
CREATE POLICY sessions_owner_softdeleted_select ON app_nomad.sessions
  FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id AND deleted_at IS NOT NULL);

-- notes
DROP POLICY IF EXISTS notes_owner_all ON app_nomad.notes;
CREATE POLICY notes_owner_all ON app_nomad.notes
  FOR ALL TO authenticated
  USING       (auth.uid()::text = user_id)
  WITH CHECK  (auth.uid()::text = user_id);

-- tags
DROP POLICY IF EXISTS tags_owner_all ON app_nomad.tags;
CREATE POLICY tags_owner_all ON app_nomad.tags
  FOR ALL TO authenticated
  USING       (auth.uid()::text = user_id)
  WITH CHECK  (auth.uid()::text = user_id);

-- session_tags
DROP POLICY IF EXISTS session_tags_owner_all ON app_nomad.session_tags;
CREATE POLICY session_tags_owner_all ON app_nomad.session_tags
  FOR ALL TO authenticated
  USING       (auth.uid()::text = user_id)
  WITH CHECK  (auth.uid()::text = user_id);

-- session_attachments: same soft-delete pattern as sessions.
DROP POLICY IF EXISTS session_attachments_owner_all              ON app_nomad.session_attachments;
DROP POLICY IF EXISTS session_attachments_owner_softdeleted_select ON app_nomad.session_attachments;
CREATE POLICY session_attachments_owner_all ON app_nomad.session_attachments
  FOR ALL TO authenticated
  USING       (auth.uid()::text = user_id AND deleted_at IS NULL)
  WITH CHECK  (auth.uid()::text = user_id);
CREATE POLICY session_attachments_owner_softdeleted_select ON app_nomad.session_attachments
  FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id AND deleted_at IS NOT NULL);

-- user_settings (PK is uuid, cast for safety).
DROP POLICY IF EXISTS user_settings_owner_select ON app_nomad.user_settings;
DROP POLICY IF EXISTS user_settings_owner_insert ON app_nomad.user_settings;
DROP POLICY IF EXISTS user_settings_owner_update ON app_nomad.user_settings;
DROP POLICY IF EXISTS user_settings_owner_delete ON app_nomad.user_settings;
CREATE POLICY user_settings_owner_select ON app_nomad.user_settings
  FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id::text);
CREATE POLICY user_settings_owner_insert ON app_nomad.user_settings
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id::text);
CREATE POLICY user_settings_owner_update ON app_nomad.user_settings
  FOR UPDATE TO authenticated
  USING       (auth.uid()::text = user_id::text)
  WITH CHECK  (auth.uid()::text = user_id::text);
CREATE POLICY user_settings_owner_delete ON app_nomad.user_settings
  FOR DELETE TO authenticated
  USING (auth.uid()::text = user_id::text);


-- -----------------------------------------------------------------------------
-- 7. Grants
--    anon: no access. authenticated: CRUD (gated by RLS). service_role: full.
-- -----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA app_nomad FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON app_nomad.sessions             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_nomad.notes                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_nomad.tags                 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_nomad.session_tags         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_nomad.session_attachments  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_nomad.user_settings        TO authenticated;

GRANT ALL ON ALL TABLES    IN SCHEMA app_nomad TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA app_nomad TO service_role;

-- Future objects created in this schema inherit the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA app_nomad
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA app_nomad
  GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA app_nomad
  GRANT ALL ON SEQUENCES TO service_role;

-- =============================================================================
-- End of schema.sql
-- =============================================================================
