import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeBlogHtml } from './render';

test('sanitizes rich editorial HTML and hardens external links', () => {
  const html = sanitizeBlogHtml(`
    <h2>Heading</h2><ul><li>Item</li></ul><blockquote>Quote</blockquote>
    <pre><code>const x = 1</code></pre><table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>
    <figure><img src="https://cdn.example/image.jpg" alt="Diagram"><figcaption>Caption</figcaption></figure>
    <a href="https://example.com/path">External</a><a href="/contact" target="_blank">Internal</a>
    <a href="javascript:alert(1)">Unsafe</a><script>alert(1)</script>
  `);
  for (const tag of ['h2', 'ul', 'blockquote', 'pre', 'table', 'figure', 'figcaption'])
    assert.match(html, new RegExp(`<${tag}`));
  assert.match(
    html,
    /href="https:\/\/example\.com\/path" target="_blank" rel="noopener noreferrer"/u,
  );
  assert.match(html, /href="\/contact"/u);
  assert.doesNotMatch(html, /href="\/contact"[^>]*target/u);
  assert.doesNotMatch(html, /javascript:|<script/u);
});
