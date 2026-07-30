-- Adds general profile fields used by the Super Admin / Admin / Pro
-- profile settings form: title, bio, timezone, date_format.
-- Existing avatar_url, locale, username columns already added in earlier
-- migrations.

alter table public.profiles
  add column if not exists title text,
  add column if not exists bio text,
  add column if not exists timezone text not null default 'Asia/Dubai',
  add column if not exists date_format text not null default 'YYYY-MM-DD';

alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles drop constraint if exists profiles_title_len;
alter table public.profiles drop constraint if exists profiles_date_format_enum;

alter table public.profiles
  add constraint profiles_bio_len check (bio is null or char_length(bio) <= 500),
  add constraint profiles_title_len check (title is null or char_length(title) <= 100),
  add constraint profiles_date_format_enum check (date_format in ('YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY'));
