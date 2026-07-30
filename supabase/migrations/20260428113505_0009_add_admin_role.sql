-- Adds the `admin` value to app_role enum.
-- Must run as its own migration: PG forbids using a freshly added enum
-- value within the same transaction it was added.
-- Source: user spec — super_admin (singleton) creates/removes admin (many).

alter type public.app_role add value if not exists 'admin' after 'super_admin';
