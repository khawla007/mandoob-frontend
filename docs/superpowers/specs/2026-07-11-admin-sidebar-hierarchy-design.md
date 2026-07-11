# Admin Sidebar Hierarchy Design

## Goal

Reorganize the admin dashboard sidebar into clear WordPress-inspired CMS sections. Keep authentication limited to identity, session, security, and privacy controls; place commercial and tenant-facing tools in their own sections.

## Navigation hierarchy

1. **Overview**
   - Overview
2. **Catalog**
   - Cost data
   - Taxonomies
     - Categories
     - Attributes
     - Tags
3. **Editorial**
   - Blog
   - Pages
4. **Business**
   - Leads
   - Finance
   - WhatsApp templates
5. **Tenants**
   - PRO firms
6. **Auth & Security**
   - Users
   - Sessions
   - MFA & Security
   - Audit logs
   - Erasure requests
7. **Account**
   - Settings

## Behavioral constraints

- Preserve all existing routes, icons, translations, active-item behavior, and authorization checks.
- Change only grouping and ordering; do not alter page permissions or introduce new navigation destinations.
- Keep Overview first and Account last.
- Do not place catalog, editorial, business, or tenant-management items under Auth & Security.
- Preserve the existing collapsible Taxonomies submenu.

## Verification

- Add navigation-configuration tests for group order and exact group membership.
- Confirm no business or catalog route remains in Auth & Security.
- Run the focused sidebar tests, TypeScript compilation, and lint checks.
- Inspect the rendered admin sidebar at desktop and collapsed/mobile widths if the local application can be run.

