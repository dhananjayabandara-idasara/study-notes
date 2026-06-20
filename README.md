# Idasara Study Notes 📚

An automated, searchable web portal hosting self-contained HTML study notes for
**Grades 6–13** across **English, Sinhala and Tamil** mediums.

> **We empower · We free · We augment.**

The site is just static HTML — no third-party services, no tracking, nothing leaves
GitHub. Every study page is fully self-contained, so it loads fast even on a weak
connection. A small build step scans the `content/` folder and generates the
navigation automatically, so **adding notes never requires editing code**.

🔗 **Live site:** https://dhananjayabandara-idasara.github.io/study-notes/

---

## How it works

```
index.html              ← the branded portal (search + Grade → Medium → Subject → Cluster)
manifest.js             ← AUTO-GENERATED navigation index (do not edit by hand)
tools/build-manifest.mjs← scans content/ and writes manifest.js (zero dependencies)
.github/workflows/      ← rebuilds manifest.js + deploys to Pages on every push
.nojekyll               ← makes Pages serve _map.html and other files as-is
content/                ← all the study notes live here (see convention below)
```

When you push, GitHub Actions runs the build script and republishes the site in
about a minute. You do **not** run anything locally and you do **not** touch code.

---

## Folder convention (this is the whole "API")

```
content/<grade>/<medium>/<subject>/
    _map.html                 the subject's "cluster map" overview page   (optional)
    cluster-01.html           a single-page cluster (everything on one page)
    cluster-02/               a multi-page cluster (a folder)
        index.html            the cluster's landing page                  (required in a folder)
        01-topic.html         individual lesson pages (number them to order them)
        02-topic.html
```

**Slugs** (lowercase, no spaces):

| Level   | Use these slugs |
|---------|-----------------|
| grade   | `grade-06` `grade-07` `grade-08` `grade-09` `ol` (Grades 10–11) `al` (Grades 12–13) |
| medium  | `english` `sinhala` `tamil` |
| subject | `science` `mathematics` `english` `sinhala` `tamil` `history` `geography` `buddhism` `islam` `christianity` `hinduism` `civic` `health` `ict` `music` `art` `dancing` `drama` `practical-technical-skills` |

A new subject not in the list still works — its name is just title-cased automatically.

### Page titles
The portal shows each page's `<title>` (with "Idasara" trimmed off). Give every
file a clear `<title>` and it appears correctly in the menu and in search.

---

## Adding new notes (zero-code workflow)

1. Save your finished HTML page.
2. Drop it into the right `content/<grade>/<medium>/<subject>/` folder, named
   `cluster-NN.html` (single page) **or** put it in a `cluster-NN/` folder as
   `index.html` + numbered lessons.
3. Commit & push.

That's it — in ~60 seconds the new grade / medium / subject / cluster appears in the
menu and search on the live site.

### Optional: override a label or order
Drop a `_meta.json` into any folder to override what the build script inferred —
no code change needed:

```json
{ "title": "Practical & Technical Skills", "order": 3, "icon": "🛠️" }
```

---

## Previewing locally

`manifest.js` works from `file://`, so you can usually just open `index.html`.
For a closer match to the live site (and to test new content):

```bash
node tools/build-manifest.mjs      # regenerate the menu
python3 -m http.server             # then open http://localhost:8000
```

---

## One-time setup (already done, kept here for reference)

GitHub → repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
After that, every push deploys automatically.
