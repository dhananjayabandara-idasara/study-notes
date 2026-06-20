#!/usr/bin/env node
/**
 * Idasara Study Notes — manifest builder.
 *
 * Walks ./content and emits ./manifest.js (window.IDASARA_MANIFEST = {...}).
 * Zero dependencies. Run with:  node tools/build-manifest.mjs
 *
 * Convention it understands (everything is auto-discovered — no per-file editing):
 *
 *   content/<grade>/<medium>/<subject>/
 *      _map.html                 -> the subject's "cluster map" overview (optional)
 *      cluster-NN.html           -> a single-page cluster
 *      cluster-NN/               -> a multi-page cluster
 *          index.html            -> the cluster landing page (required for folder clusters)
 *          NN-name.html          -> individual lesson pages
 *      _meta.json                -> OPTIONAL override: { "title", "order", "icon" }
 *
 * Display names come from each page's <title>. To override any auto-derived
 * label/order without touching code, drop a tiny _meta.json in that folder.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const OUT = join(ROOT, 'manifest.js');

/* ---------- display-name dictionaries (fallback is smart title-case) ---------- */

const GRADE_INFO = {
  'grade-06': { title: 'Grade 6', order: 6 },
  'grade-07': { title: 'Grade 7', order: 7 },
  'grade-08': { title: 'Grade 8', order: 8 },
  'grade-09': { title: 'Grade 9', order: 9 },
  'grade-10': { title: 'Grade 10', order: 10 },
  'grade-11': { title: 'Grade 11', order: 11 },
  'ol':       { title: 'O/L', sub: 'Grades 10–11', order: 10.5 },
  'al':       { title: 'A/L', sub: 'Grades 12–13', order: 12.5 },
  'grade-12': { title: 'Grade 12', order: 12 },
  'grade-13': { title: 'Grade 13', order: 13 },
};

const MEDIUM_INFO = {
  english: { title: 'English', order: 1 },
  sinhala: { title: 'Sinhala', order: 2 },
  tamil:   { title: 'Tamil',   order: 3 },
};

const SUBJECT_INFO = {
  science:        { title: 'Science',        icon: '🔬', order: 1 },
  mathematics:    { title: 'Mathematics',    icon: '🔢', order: 2 },
  english:        { title: 'English',        icon: '🔤', order: 3 },
  sinhala:        { title: 'Sinhala',        icon: '✍️', order: 4 },
  tamil:          { title: 'Tamil',          icon: '✍️', order: 5 },
  history:        { title: 'History',        icon: '📜', order: 6 },
  geography:      { title: 'Geography',      icon: '🗺️', order: 7 },
  buddhism:       { title: 'Buddhism',       icon: '🪷', order: 8 },
  islam:          { title: 'Islam',          icon: '🕌', order: 9 },
  christianity:   { title: 'Christianity',   icon: '✝️', order: 10 },
  hinduism:       { title: 'Hinduism',       icon: '🕉️', order: 11 },
  civic:          { title: 'Civic Education', icon: '⚖️', order: 12 },
  health:         { title: 'Health & Physical Education', icon: '🏃', order: 13 },
  ict:            { title: 'ICT',            icon: '💻', order: 14 },
  music:          { title: 'Music',          icon: '🎵', order: 15 },
  art:            { title: 'Art',            icon: '🎨', order: 16 },
  dancing:        { title: 'Dancing',        icon: '💃', order: 17 },
  drama:          { title: 'Drama',          icon: '🎭', order: 18 },
  'practical-technical-skills': { title: 'Practical & Technical Skills', icon: '🛠️', order: 19 },
};

/* ---------- helpers ---------- */

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const listDirs  = (p) => readdirSync(p).filter((n) => isDir(join(p, n))).sort();
const listFiles = (p) => readdirSync(p).filter((n) => !isDir(join(p, n))).sort();

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
}

function readTitle(file) {
  let html = '';
  try { html = readFileSync(file, 'utf8'); } catch { return ''; }
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}

/** Strip Idasara branding + dangling separators so a <title> reads cleanly in a list. */
function cleanTitle(raw) {
  if (!raw) return '';
  let t = raw.replace(/Idasara\s+Academy/gi, '').replace(/Idasara/gi, '').replace(/ඉඩසර\s+ඇකඩමිය/g, '');
  const trimSep = /^[\s·•—\-–|:]+|[\s·•—\-–|:]+$/g;
  t = t.replace(trimSep, '').replace(/\s{2,}/g, ' ').trim();
  return t || raw.trim();
}

/** Turn a slug into a readable label when it isn't in a dictionary. */
function titleCaseSlug(slug) {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Optional per-folder override file. */
function readMeta(dir) {
  const f = join(dir, '_meta.json');
  if (!existsSync(f)) return {};
  try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return {}; }
}

const leadingNum = (name) => { const m = name.match(/(\d+)/); return m ? parseInt(m[1], 10) : 9999; };
const webPath = (abs) => 'content/' + relative(CONTENT, abs).split(/[\\/]/).join('/');

/* ---------- cluster parsing ---------- */

function parseClusterFolder(dir, slug) {
  const indexFile = join(dir, 'index.html');
  const meta = readMeta(dir);
  const lessons = listFiles(dir)
    .filter((n) => /\.html?$/i.test(n) && n.toLowerCase() !== 'index.html')
    .map((n) => ({
      num: leadingNum(n),
      title: cleanTitle(readTitle(join(dir, n))) || titleCaseSlug(n.replace(/\.html?$/i, '')),
      href: webPath(join(dir, n)),
    }))
    .sort((a, b) => a.num - b.num || a.title.localeCompare(b.title));
  return {
    slug,
    type: 'multi',
    num: meta.order ?? leadingNum(slug),
    title: meta.title || cleanTitle(readTitle(indexFile)) || titleCaseSlug(slug),
    href: existsSync(indexFile) ? webPath(indexFile) : (lessons[0]?.href ?? null),
    lessons,
  };
}

function parseClusterFile(file, slug) {
  return {
    slug,
    type: 'single',
    num: leadingNum(slug),
    title: cleanTitle(readTitle(file)) || titleCaseSlug(slug),
    href: webPath(file),
    lessons: [],
  };
}

function parseSubject(dir, slug) {
  const meta = readMeta(dir);
  const info = SUBJECT_INFO[slug] || {};
  const clusters = [];

  // single-page clusters: cluster-*.html (but not _map.html / index.html)
  for (const f of listFiles(dir)) {
    if (!/\.html?$/i.test(f)) continue;
    const base = f.replace(/\.html?$/i, '');
    if (base === '_map' || base === 'index') continue;
    clusters.push(parseClusterFile(join(dir, f), base));
  }
  // multi-page clusters: any subdirectory
  for (const d of listDirs(dir)) {
    if (d.startsWith('_')) continue;
    clusters.push(parseClusterFolder(join(dir, d), d));
  }
  clusters.sort((a, b) => a.num - b.num || a.title.localeCompare(b.title));

  const mapFile = join(dir, '_map.html');
  const map = existsSync(mapFile)
    ? { href: webPath(mapFile), title: cleanTitle(readTitle(mapFile)) || 'Cluster Map' }
    : null;

  return {
    slug,
    title: meta.title || info.title || titleCaseSlug(slug),
    icon: meta.icon || info.icon || '📘',
    order: meta.order ?? info.order ?? 999,
    map,
    clusters,
  };
}

function parseMedium(dir, slug) {
  const meta = readMeta(dir);
  const info = MEDIUM_INFO[slug] || {};
  const subjects = listDirs(dir)
    .filter((d) => !d.startsWith('_'))
    .map((d) => parseSubject(join(dir, d), d))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return {
    slug,
    title: meta.title || info.title || titleCaseSlug(slug),
    order: meta.order ?? info.order ?? 99,
    subjects,
  };
}

function parseGrade(dir, slug) {
  const meta = readMeta(dir);
  const info = GRADE_INFO[slug] || {};
  const mediums = listDirs(dir)
    .filter((d) => !d.startsWith('_'))
    .map((d) => parseMedium(join(dir, d), d))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return {
    slug,
    title: meta.title || info.title || titleCaseSlug(slug),
    sub: meta.sub || info.sub || '',
    order: meta.order ?? info.order ?? 999,
    mediums,
  };
}

/* ---------- build ---------- */

if (!existsSync(CONTENT)) {
  console.error(`✗ No content/ directory found at ${CONTENT}`);
  process.exit(1);
}

const grades = listDirs(CONTENT)
  .filter((d) => !d.startsWith('_'))
  .map((d) => parseGrade(join(CONTENT, d), d))
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

const stats = { grades: 0, mediums: 0, subjects: 0, clusters: 0, lessons: 0 };
for (const g of grades) {
  stats.grades++;
  for (const m of g.mediums) {
    stats.mediums++;
    for (const s of m.subjects) {
      stats.subjects++;
      stats.clusters += s.clusters.length;
      for (const c of s.clusters) stats.lessons += c.lessons.length;
    }
  }
}

const manifest = { generatedAt: new Date().toISOString(), stats, grades };
const banner =
  '/* AUTO-GENERATED by tools/build-manifest.mjs — do not edit by hand. */\n';
writeFileSync(OUT, banner + 'window.IDASARA_MANIFEST = ' + JSON.stringify(manifest, null, 2) + ';\n');

console.log(`✓ manifest.js written`);
console.log(`  grades=${stats.grades} mediums=${stats.mediums} subjects=${stats.subjects} clusters=${stats.clusters} lessons=${stats.lessons}`);
