import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'a',
  'blockquote',
  'br',
  'code',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
] as const;

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  a: ['href', 'name', 'target', 'rel', 'style'],
  blockquote: ['style'],
  h1: ['style'],
  h2: ['style'],
  h3: ['style'],
  h4: ['style'],
  img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
  li: ['style'],
  ol: ['style'],
  p: ['style'],
  span: ['data-heading-level'],
  code: ['class'],
  pre: ['class'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
  ul: ['style'],
};

export function sanitizeBlogHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...ALLOWED_TAGS],
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedStyles: {
      '*': {
        'text-align': [/^left$/, /^center$/, /^right$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
      img: sanitizeHtml.simpleTransform('img', { loading: 'lazy' }, true),
    },
  });
}
