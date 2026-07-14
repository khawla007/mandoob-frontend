# Legal Pages CMS Migration Design

## Goal

Move Privacy, Terms, PDPL, and Trust Center content from the hardcoded legal route into the existing CMS page editor. Preserve the public URLs `/legal/privacy`, `/legal/terms`, `/legal/pdpl`, and `/legal/trust` while rendering every document with the shared CMS page template.

## Chosen approach

Keep the existing nested legal route as a thin CMS adapter. It will accept only the four supported legal slugs, load the matching published `cms_pages` record, apply the standard CMS visibility rules, and render `PublicCmsPage`. The route will also use the shared CMS metadata and schema serialization helpers.

This avoids redirects and does not broaden the page system to arbitrary nested slugs. Root CMS routes remain unchanged.

## Data migration

Add an idempotent Supabase migration that inserts or updates four active CMS records:

| CMS slug | Public URL | Title |
| --- | --- | --- |
| `privacy` | `/legal/privacy` | Privacy Policy |
| `terms` | `/legal/terms` | Terms & Conditions |
| `pdpl` | `/legal/pdpl` | PDPL Statement |
| `trust` | `/legal/trust` | Trust Center |

Each record will:

- preserve the current document wording and last-updated text;
- contain matching rich-text `content_json` and rendered `content_html`, so opening and resaving it in the editor does not erase content;
- be published immediately with a valid `published_at` timestamp;
- use the normal no-hero CMS heading and body layout;
- include a canonical URL for its preserved `/legal/...` location and suitable metadata;
- remain editable from the existing admin page library.

The migration will update a matching live slug rather than creating duplicates, and will not restore soft-deleted rows.

## Routing and rendering

- Remove the hardcoded `DOCS` content map and dedicated legal JSX rendering.
- Retain one generic `/legal/[slug]` route because nested URLs require a Next.js route entry.
- Allow only `privacy`, `terms`, `pdpl`, and `trust` at this route.
- Load through `getPublishedCmsPageBySlug` and the shared visibility policy.
- Render with `PublicCmsPage`, `buildCmsPageMetadata`, and `serializeSchema`.
- Return the standard 404 for unsupported, missing, draft, scheduled-future, archived, or deleted records.
- Keep the existing footer links unchanged.

## Template behavior

The CMS page system is shared-template based. All migrated pages use the same `PublicCmsPage` structure and public site layout. Editors control rich-text content, optional hero settings, publication status, SEO metadata, schema markup, and supported script slots; they do not select separate React components per page.

## Error handling and safety

- Database failures continue through the existing safe CMS data-layer errors.
- Public content continues through the shared HTML sanitizer.
- JSON-LD continues through the shared safe serializer.
- The route allowlist prevents unrelated CMS pages from appearing below `/legal`.

## Verification

- Add focused route tests covering the legal allowlist, visibility, metadata, and schema serialization.
- Add migration assertions covering all four slugs, URLs, published state, and editable JSON/HTML content.
- Confirm the old hardcoded legal content map no longer exists.
- Run focused tests, the complete test suite, TypeScript compilation, lint, and production build.

## Out of scope

- Changing public URLs or footer destinations.
- Adding arbitrary nested CMS paths.
- Creating a second legal-specific visual template.
- Rewriting or legally reviewing the existing document wording.
