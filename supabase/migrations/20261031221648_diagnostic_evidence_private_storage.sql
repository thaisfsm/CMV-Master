alter table public.evidence_files add column if not exists question_key text;
create index if not exists evidence_files_establishment_question_idx on public.evidence_files (establishment_id, question_key, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cmv-evidence', 'cmv-evidence', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "cmv evidence member read" on storage.objects
for select to authenticated
using (bucket_id = 'cmv-evidence' and public.is_org_member((storage.foldername(name))[1]::uuid));

create policy "cmv evidence editor upload" on storage.objects
for insert to authenticated
with check (bucket_id = 'cmv-evidence' and public.is_org_editor((storage.foldername(name))[1]::uuid));

create policy "cmv evidence editor delete" on storage.objects
for delete to authenticated
using (bucket_id = 'cmv-evidence' and public.is_org_editor((storage.foldername(name))[1]::uuid));

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.is_org_editor(uuid) from public, anon;
revoke all on function public.start_initial_workspace(text) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_editor(uuid) to authenticated;
grant execute on function public.start_initial_workspace(text) to authenticated;