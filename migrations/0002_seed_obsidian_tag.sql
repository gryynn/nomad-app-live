-- 0002_seed_obsidian_tag.sql
--
-- Seed the `obsidian` destination tag (ADR-20): the marker that drives the
-- downstream note pipeline from NOMAD into the vault. Idempotent by design —
-- re-running it is a no-op once the tag carries its distinct identity.
--
-- The tag already exists in production (3 sessions carry it) but with the
-- default emoji (🏷️) and default grey hue, so it is indistinguishable from a
-- test tag. This sets a distinct emoji + hue so it stands out in the tag
-- picker and in the one-gesture quick action.
--
-- No CREATE here: a fresh instance has no user to attach the tag to (tags are
-- per-user), and the UI already creates tags on demand (`createTag`). This
-- migration only normalises the destination tag where it already exists.

UPDATE app_nomad.tags
SET emoji = '📥', hue = '#7C5CBF', updated_at = now()
WHERE name = 'obsidian'
  AND (emoji IS DISTINCT FROM '📥' OR hue IS DISTINCT FROM '#7C5CBF');
