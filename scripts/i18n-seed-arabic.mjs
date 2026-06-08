#!/usr/bin/env node
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const EN_DIR = path.join(ROOT, 'src/messages/en');
const AR_DIR = path.join(ROOT, 'src/messages/ar');
const REVIEW_PATH = path.join(AR_DIR, '_review.json');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const providerFlag = [...args].find((a) => a.startsWith('--provider='));
const provider = providerFlag?.split('=')[1] ?? 'deepl';

if (!['deepl', 'openai'].includes(provider)) {
  console.error(`Unknown provider: ${provider}. Use deepl or openai.`);
  process.exit(2);
}

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const hasPlural = (s) => /\{[^}]+,\s*plural\s*,/.test(s);

function flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

function inflate(flat) {
  const root = {};
  for (const [k, v] of Object.entries(flat)) {
    const parts = k.split('.');
    let cursor = root;
    for (let i = 0; i < parts.length - 1; i++) {
      cursor[parts[i]] ??= {};
      cursor = cursor[parts[i]];
    }
    cursor[parts.at(-1)] = v;
  }
  return root;
}

function tokenizeVars(s) {
  const map = [];
  const masked = s.replace(/\{[^}]+\}/g, (m) => {
    const token = `__VAR_${map.length}__`;
    map.push(m);
    return token;
  });
  return { masked, map };
}

function restoreVars(s, map) {
  return s.replace(/__VAR_(\d+)__/g, (_, i) => map[Number(i)] ?? '');
}

async function translateDeepL(text) {
  const key = process.env.DEEPL_API_KEY;
  if (!key) throw new Error('DEEPL_API_KEY missing');
  const r = await fetch('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: [text], target_lang: 'AR', source_lang: 'EN' }),
  });
  if (!r.ok) throw new Error(`DeepL ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.translations[0].text;
}

async function translateOpenAI(text) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'You are a professional marketing translator. Translate the user message from English to Modern Standard Arabic for a UAE business audience. Preserve tokens of the form __VAR_N__ exactly. Output the translation only, no quotes, no commentary.',
        },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${await r.text()}`);
  const data = await r.json();
  return data.choices[0].message.content.trim();
}

const translate = provider === 'deepl' ? translateDeepL : translateOpenAI;

async function loadReview() {
  try {
    return JSON.parse(await readFile(REVIEW_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function listNamespaces() {
  const files = await readdir(EN_DIR);
  return files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
}

async function main() {
  const review = await loadReview();
  const namespaces = await listNamespaces();
  let total = 0;
  let touched = 0;

  for (const ns of namespaces) {
    const en = JSON.parse(await readFile(path.join(EN_DIR, `${ns}.json`), 'utf8'));
    const ar = JSON.parse(
      await readFile(path.join(AR_DIR, `${ns}.json`), 'utf8').catch(() => '{}'),
    );
    const enFlat = flatten(en);
    const arFlat = flatten(ar);

    for (const [key, value] of Object.entries(enFlat)) {
      if (typeof value !== 'string') continue;
      total += 1;
      const reviewKey = `${ns}.${key}`;
      const sourceHash = sha(value);
      const entry = review[reviewKey];
      if (entry?.sourceHash === sourceHash && entry?.status !== 'manual_placeholder' && arFlat[key])
        continue;

      const { masked, map } = tokenizeVars(value);
      let translated = arFlat[key] ?? '';
      const status = hasPlural(value) ? 'auto_plural' : 'auto';

      if (dryRun) {
        console.log(`[dry-run] ${reviewKey} -> would translate via ${provider}`);
      } else {
        const raw = await translate(masked);
        translated = restoreVars(raw, map);
        arFlat[key] = translated;
      }

      review[reviewKey] = {
        status,
        translatedAt: new Date().toISOString(),
        sourceHash,
      };
      touched += 1;
    }

    if (!dryRun) {
      await writeFile(
        path.join(AR_DIR, `${ns}.json`),
        JSON.stringify(inflate(arFlat), null, 2) + '\n',
      );
    }
  }

  if (!dryRun) {
    await writeFile(REVIEW_PATH, JSON.stringify(review, null, 2) + '\n');
  }

  console.log(
    `Done. Total keys: ${total}. Touched: ${touched}. Mode: ${dryRun ? 'dry-run' : 'live'}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
