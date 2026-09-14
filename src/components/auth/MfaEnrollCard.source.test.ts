import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('MFA enrollment uses semantic theme tokens and exposes busy states', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/auth/MfaEnrollCard.tsx'), 'utf8');
  assert.doesNotMatch(source, /bg-zinc|text-red|focus:border-black|bg-black|text-white/u);
  assert.match(source, /aria-busy=\{busy === 'verifying'\}/u);
  assert.match(source, /aria-busy=\{busy === 'cancelling'\}/u);
  assert.match(source, /onClick=\{startEnrollment\}[\s\S]*?className="[^"]*min-h-11/u);
  assert.match(source, /name="code"[\s\S]*?className="[^"]*min-h-11/u);
  assert.match(
    source,
    /href="\/mfa\/challenge"[^>]*className="btn btn--authenticated-accent w-full justify-center"/u,
  );
  assert.doesNotMatch(source, /href="\/mfa\/challenge"[^>]*className="[^"]*btn--accent(?:\s|")/u);
});
