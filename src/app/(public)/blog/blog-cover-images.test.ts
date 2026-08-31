import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const blogPageSource = readFileSync(join(process.cwd(), 'src/app/(public)/blog/page.tsx'), 'utf8');
const articlePageSource = readFileSync(
  join(process.cwd(), 'src/app/(public)/blog/[slug]/page.tsx'),
  'utf8',
);

describe('public blog cover images', () => {
  it('uses responsive HD covers on blog cards', () => {
    assert.match(blogPageSource, /from 'next\/image'/u);
    assert.match(blogPageSource, /getBlogCoverImage/u);
    assert.match(blogPageSource, /blog-card__media/u);
    assert.match(blogPageSource, /sizes=/u);
  });

  it('uses the same HD cover source as a full article hero and social preview', () => {
    assert.match(articlePageSource, /from 'next\/image'/u);
    assert.match(articlePageSource, /getBlogCoverImage/u);
    assert.match(articlePageSource, /blog-article__cover/u);
    assert.match(articlePageSource, /images:/u);
  });
});
