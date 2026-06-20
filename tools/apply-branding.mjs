#!/usr/bin/env node
/**
 * Idasara Study Notes — branding injector.
 *
 * Adds, to every user-visible page (index.html + content/**.html):
 *   1. a logo brand card in the top-right of the page's <header>
 *      (circular logo + "ඉඩසර ඇකඩමිය" + "Idasara Digital (Pvt) Ltd.")
 *   2. a "© Idasara Digital (Pvt) Ltd." line in the <footer>
 *
 * The logo (assets/idasara-logo.jpeg) is embedded as a base64 data URI so each
 * page stays fully self-contained (no external request, works at any URL/host,
 * even offline). One asset file is the source of truth; this script reuses it
 * everywhere.
 *
 * Idempotent: re-running never double-injects. Pages that already carry their
 * own branding (e.g. a hand-made `header-brand-box` or an existing copyright)
 * are left as-is — only their broken local logo path is repaired.
 *
 * Run: node tools/apply-branding.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = join(ROOT, 'assets', 'idasara-logo.jpeg');

if (!existsSync(LOGO)) { console.error(`✗ logo not found at ${LOGO}`); process.exit(1); }
const DATA_URI = 'data:image/jpeg;base64,' + readFileSync(LOGO).toString('base64');

const STYLE = `<style id="idsa-brand-style">
.idsa-host{position:relative}
@media(min-width:601px){.idsa-host{padding-right:172px !important}}
.idsa-badge{position:absolute;top:14px;right:14px;z-index:60;display:flex;align-items:center;gap:9px;
  background:#fff;border:1px solid #ece3d2;border-radius:12px;padding:6px 11px 6px 7px;
  box-shadow:0 4px 14px rgba(0,0,0,.16)}
.idsa-badge .ring{width:40px;height:40px;border-radius:50%;overflow:hidden;background:#fff;
  border:2px solid #c8962a;flex:none;display:flex;align-items:center;justify-content:center}
.idsa-badge .ring img{width:100%;height:100%;object-fit:cover;display:block}
.idsa-badge .txt{display:flex;flex-direction:column;line-height:1.18}
.idsa-badge .si{font-size:.72rem;font-weight:800;color:#0f2747}
.idsa-badge .en{font-size:.58rem;color:#5c6b7a;white-space:nowrap}
@media(max-width:600px){.idsa-badge{top:8px;right:8px;padding:4px;gap:0}.idsa-badge .txt{display:none}
  .idsa-badge .ring{width:34px;height:34px}}
.idsa-copy{margin-top:14px;padding-top:12px;border-top:1px dashed rgba(120,120,120,.35);
  font-size:.75rem;opacity:.85;text-align:center}
@media print{.idsa-badge{position:static;margin:0 0 10px auto;box-shadow:none}}
</style>`;

const BADGE =
  `<div class="idsa-badge"><span class="ring"><img src="${DATA_URI}" alt="Idasara Academy logo"></span>` +
  `<span class="txt"><span class="si">ඉඩසර ඇකඩමිය</span>` +
  `<span class="en">Idasara Digital (Pvt) Ltd.</span></span></div>`;

const COPY_INNER = `&copy; 2025-2026 Idasara Digital (Pvt) Ltd. All Rights Reserved.`;
const COPY = `<div class="idsa-copy">${COPY_INNER}</div>`;

/** Add the idsa-host class to the first <header ...> opening tag. */
function tagHeader(html) {
  return html.replace(/<header\b([^>]*)>/i, (m, attrs) => {
    if (/class\s*=\s*"/i.test(attrs)) return `<header${attrs.replace(/class\s*=\s*"([^"]*)"/i, 'class="$1 idsa-host"')}>`;
    return `<header${attrs} class="idsa-host">`;
  });
}

function insertBefore(html, needle, snippet) {
  const i = html.lastIndexOf(needle);
  if (i < 0) return null;
  return html.slice(0, i) + snippet + '\n' + html.slice(i);
}

function brand(html) {
  const hasOwnBrandBox = /header-brand-box/i.test(html);
  const hasOurBadge = /idsa-badge/i.test(html);
  const hasCopyright = /idsa-copy|All Rights Reserved/i.test(html);
  const changes = [];

  // 1. Always repair a broken/local logo reference to the embedded data URI.
  if (/src="[^"]*idasara-logo\.jpe?g"/i.test(html)) {
    html = html.replace(/src="[^"]*idasara-logo\.jpe?g"/gi, `src="${DATA_URI}"`);
    changes.push('logo-fixed');
  }

  const willBadge = !hasOwnBrandBox && !hasOurBadge && /<header\b/i.test(html);
  const willCopy = !hasCopyright;

  // 2. Inject scoped style once (only if we will inject badge or copyright).
  if ((willBadge || willCopy) && !/id="idsa-brand-style"/i.test(html)) {
    const out = insertBefore(html, '</head>', STYLE);
    if (out) html = out;
  }

  // 3. Brand card in the header.
  if (willBadge) {
    html = tagHeader(html);
    const out = insertBefore(html, '</header>', BADGE);
    if (out) { html = out; changes.push('badge'); }
  }

  // 4. Copyright in the footer (fallback: before </body>).
  if (willCopy) {
    let out = insertBefore(html, '</footer>', COPY);
    if (!out) out = insertBefore(html, '</body>', `<footer>${COPY}</footer>`);
    if (out) { html = out; changes.push('copyright'); }
  } else if (/<div class="idsa-copy">/i.test(html)) {
    // Self-heal: keep an already-injected copyright's wording canonical.
    const norm = html.replace(/(<div class="idsa-copy">)[\s\S]*?(<\/div>)/i, `$1${COPY_INNER}$2`);
    if (norm !== html) { html = norm; changes.push('copy-text'); }
  }

  return { html, changes };
}

/* ---- walk targets: index.html + content/**.html ---- */
function htmlFiles(dir, acc) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) htmlFiles(p, acc);
    else if (extname(n).toLowerCase() === '.html') acc.push(p);
  }
  return acc;
}

// Only the self-contained study pages under content/ are auto-branded (logo
// embedded as a data URI). The portal index.html has a distinct layout and is
// branded by hand (it already loads manifest.js, so it references the asset
// file directly rather than embedding it).
const targets = [];
if (existsSync(join(ROOT, 'content'))) htmlFiles(join(ROOT, 'content'), targets);

let touched = 0, skipped = 0;
for (const f of targets) {
  const before = readFileSync(f, 'utf8');
  const { html, changes } = brand(before);
  const rel = f.replace(ROOT + '/', '');
  if (changes.length && html !== before) { writeFileSync(f, html); touched++; console.log(`  ✓ ${rel}  [${changes.join(', ')}]`); }
  else { skipped++; }
}
console.log(`\n✓ branding applied — ${touched} updated, ${skipped} already current (of ${targets.length} pages)`);
