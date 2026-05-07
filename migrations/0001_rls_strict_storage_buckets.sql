-- Migration : RLS strict on storage.objects for nomad-audio* buckets
--
-- ⚠️  PRÉ-REQUIS :
-- Cette migration ne doit être appliquée QU'APRÈS que la branche
-- feat/storage-backend-abstraction (commit 349f9a4) soit en production.
-- Avant ça, le frontend uploadait des chunks directement vers Supabase Storage
-- avec la clé anon — appliquer cette migration avant casserait les uploads.
--
-- Une fois feat/storage-backend-abstraction mergée :
-- - Les chunks passent par POST /api/upload/chunk (backend, service_role).
-- - L'audio assemblé passe aussi par le backend.
-- - Le frontend ne touche plus storage.objects directement.
-- - Donc on peut serrer les policies sans casser l'app.
--
-- À appliquer :
--   psql "$SUPABASE_DB_URL" -f migrations/0001_rls_strict_storage_buckets.sql

-- Drop all current ultra-permissive policies
DROP POLICY IF EXISTS "Allow audio uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow chunk uploads anon" ON storage.objects;
DROP POLICY IF EXISTS "Allow upload for anon" ON storage.objects;
DROP POLICY IF EXISTS "Allow chunk reads anon" ON storage.objects;
DROP POLICY IF EXISTS "Allow read for anon" ON storage.objects;
DROP POLICY IF EXISTS "Allow chunk deletes anon" ON storage.objects;

-- Strict policies: only the owner (auth.uid() = owner) can SELECT/UPDATE/DELETE
-- INSERT requires auth and writes owner = auth.uid() automatically.
-- The backend uses service_role which bypasses RLS — these only constrain
-- direct frontend access (which is no longer used post-storage-abstraction).

CREATE POLICY "nomad_audio_owner_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id IN ('nomad-audio', 'nomad-audio-chunks')
    AND owner = auth.uid()
  );

CREATE POLICY "nomad_audio_owner_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id IN ('nomad-audio', 'nomad-audio-chunks')
    AND owner = auth.uid()
  );

CREATE POLICY "nomad_audio_owner_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id IN ('nomad-audio', 'nomad-audio-chunks')
    AND owner = auth.uid()
  )
  WITH CHECK (
    bucket_id IN ('nomad-audio', 'nomad-audio-chunks')
    AND owner = auth.uid()
  );

CREATE POLICY "nomad_audio_owner_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id IN ('nomad-audio', 'nomad-audio-chunks')
    AND owner = auth.uid()
  );

-- Verification query (run after applying):
--   SELECT policyname, cmd, roles, qual, with_check
--   FROM pg_policies
--   WHERE schemaname = 'storage'
--     AND (qual::text ILIKE '%nomad-audio%' OR with_check::text ILIKE '%nomad-audio%')
--   ORDER BY cmd, policyname;
