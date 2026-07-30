-- Harden blog taxonomy hierarchy rules.

update public.blog_terms
   set parent_id = null
 where parent_id = id;

update public.blog_terms child
   set parent_id = null
  from public.blog_terms parent
 where child.parent_id = parent.id
   and child.kind <> parent.kind;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'blog_terms_no_self_parent'
      and conrelid = 'public.blog_terms'::regclass
  ) then
    alter table public.blog_terms
      add constraint blog_terms_no_self_parent
      check (parent_id is null or parent_id <> id);
  end if;
end $$;

create index if not exists blog_terms_parent_idx
  on public.blog_terms(parent_id)
  where parent_id is not null;

create or replace function public.enforce_blog_term_parent_kind()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_kind text;
begin
  if new.parent_id is not null then
    select kind
      into parent_kind
      from public.blog_terms
     where id = new.parent_id;

    if parent_kind is not null and parent_kind <> new.kind then
      raise exception 'blog term parent must use the same kind'
        using errcode = '23514';
    end if;
  end if;

  if exists (
    select 1
      from public.blog_terms child
     where child.parent_id = new.id
       and child.kind <> new.kind
  ) then
    raise exception 'blog term children must use the same kind'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists blog_terms_parent_kind_check on public.blog_terms;
create trigger blog_terms_parent_kind_check
  before insert or update of kind, parent_id
  on public.blog_terms
  for each row execute function public.enforce_blog_term_parent_kind();
