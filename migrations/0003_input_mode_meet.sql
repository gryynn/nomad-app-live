-- MEET (micro + system audio) saves sessions with input_mode = 'meet', which
-- the original check constraint rejected: every MEET save failed at session
-- creation, then fell back to a plain upload that could not be relabelled.
-- Applied on prod 2026-09-30.
begin;
alter table app_nomad.sessions drop constraint if exists sessions_input_mode_check;
alter table app_nomad.sessions add constraint sessions_input_mode_check
  check (input_mode = any (array['rec', 'live', 'import', 'paste', 'meet']));
commit;
