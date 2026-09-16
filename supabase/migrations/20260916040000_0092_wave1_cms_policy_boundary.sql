-- Anonymous CMS readers must not evaluate the authenticated-only company
-- access helper. Preserve the public published-read policy and existing grants.
alter policy cms_pages_platform_manage on public.cms_pages
  to authenticated, service_role;
