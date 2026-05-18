# Database schema — `app_nomad`

NOMAD persists everything except audio bytes in a Postgres database (Supabase by default). This folder will host the canonical schema dump for OSS users.

## Status

The full schema export is **TODO before the public repo opens**. In the meantime, the easiest way to bootstrap a new instance is:

1. Create a free Supabase project at https://supabase.com
2. Open the SQL editor
3. Run the SQL below (V1 minimal schema — sessions, tags, notes, association tables, user_settings, RLS policies)

## Minimal V1 SQL (to run in Supabase SQL editor)

```sql
-- Schema
CREATE SCHEMA IF NOT EXISTS app_nomad;
GRANT USAGE ON SCHEMA app_nomad TO authenticated, service_role;

-- Sessions: one row per recording
CREATE TABLE app_nomad.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text,
  duration_seconds int,
  input_mode text NOT NULL DEFAULT 'rec',         -- rec | live | import | paste | meet
  status text NOT NULL DEFAULT 'pending',         -- pending | uploading | assembling | uploaded | processing | transcribed | error
  audio_url text,
  storage_key text,                                -- pluggable storage backend key
  original_filename text,
  file_size_bytes bigint,
  engine_used text,
  error_message text,
  transcript text,
  sources jsonb,
  language text DEFAULT 'fr',
  recorded_at timestamptz,                         -- when audio was *recorded*
  created_at timestamptz NOT NULL DEFAULT now(),  -- when row was inserted
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz                          -- soft delete
);

-- Tags
CREATE TABLE app_nomad.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  parent_id uuid REFERENCES app_nomad.tags(id) ON DELETE SET NULL,
  emoji text,
  hue int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE(user_id, name)
);

-- Many-to-many sessions ↔ tags
CREATE TABLE app_nomad.session_tags (
  session_id uuid NOT NULL REFERENCES app_nomad.sessions(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES app_nomad.tags(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,                          -- denormalised for RLS
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, tag_id)
);

-- Free-form notes attached to a session
CREATE TABLE app_nomad.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES app_nomad.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text,
  kind text DEFAULT 'text',                       -- text | photo | drawing | link
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- User preferences (auto_transcribe toggle, future settings)
CREATE TABLE app_nomad.user_settings (
  user_id uuid PRIMARY KEY,
  auto_transcribe boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on every table
ALTER TABLE app_nomad.sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_nomad.tags           ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_nomad.session_tags   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_nomad.notes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_nomad.user_settings  ENABLE ROW LEVEL SECURITY;

-- Strict owner-only policies (role authenticated)
-- Repeat the pattern for each table:
CREATE POLICY sessions_owner_all ON app_nomad.sessions
  FOR ALL TO authenticated
  USING ((auth.uid())::text = user_id::text)
  WITH CHECK ((auth.uid())::text = user_id::text);

CREATE POLICY tags_owner_all ON app_nomad.tags
  FOR ALL TO authenticated
  USING ((auth.uid())::text = user_id::text)
  WITH CHECK ((auth.uid())::text = user_id::text);

CREATE POLICY session_tags_owner_all ON app_nomad.session_tags
  FOR ALL TO authenticated
  USING ((auth.uid())::text = user_id::text)
  WITH CHECK ((auth.uid())::text = user_id::text);

CREATE POLICY notes_owner_all ON app_nomad.notes
  FOR ALL TO authenticated
  USING ((auth.uid())::text = user_id::text)
  WITH CHECK ((auth.uid())::text = user_id::text);

CREATE POLICY user_settings_owner_all ON app_nomad.user_settings
  FOR ALL TO authenticated
  USING ((auth.uid())::text = user_id::text)
  WITH CHECK ((auth.uid())::text = user_id::text);

-- Lock down anon role
REVOKE ALL ON ALL TABLES IN SCHEMA app_nomad FROM anon;

-- Grant the runtime roles the privileges RLS requires
GRANT SELECT, INSERT, UPDATE, DELETE ON app_nomad.sessions       TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_nomad.tags           TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_nomad.session_tags   TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_nomad.notes          TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_nomad.user_settings  TO authenticated, service_role;
```

## Migrations

Live migration files (delta from the schema above) live in [`../migrations/`](../migrations/). Apply them in lexicographic order if you upgrade an existing instance.

## Storage buckets (optional)

If you use the `supabase` storage driver, create two buckets named `nomad-audio` and `nomad-audio-chunks` from the Supabase Storage UI, and run `migrations/0001_rls_strict_storage_buckets.sql` to lock them to the right RLS policies.
