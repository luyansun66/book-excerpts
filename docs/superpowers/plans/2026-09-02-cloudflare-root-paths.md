# Cloudflare Root Deployment Path Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the app deploy cleanly at the Cloudflare Pages root (`https://book-excerpts-2dm.pages.dev/`) by removing every leftover `/book-excerpts/` path and retiring the GitHub Pages pipeline.

**Architecture:** The app is a Vite React PWA. Vite `base` is already `/`; remaining breakage lives in static files that were copied verbatim into the build (`public/`) or hard-coded into CSS. We fix those files, keep paths absolute-at-root, bump the service-worker cache version, and make GitHub → Cloudflare the single deployment path.

**Tech Stack:** React 18 + TypeScript, Vite 6, Tailwind CSS 4, Vitest (already configured via `npm test`), Cloudflare Pages.

**Spec:** Root cause confirmed on 2026-09-02: live CSS still requests `/book-excerpts/fonts/*.woff2`, and live `manifest-pwa.json` / `sw.js` still point at `/book-excerpts/...`. Cloudflare’s fallback answers those missing files with `200 text/html`, so browsers silently fail to decode fonts, and PWA install/offline behavior is wrong. GitHub Pages at `https://luyansun66.github.io/book-excerpts/` is broken by the same base change and is being retired.

## Global Constraints

- Hosting target: Cloudflare Pages root only. All production URLs start with `/`, never `/book-excerpts/`.
- Do not change `vite.config.ts`; `base: '/'` is correct for Cloudflare root.
- Build command stays `npm run build`; output directory stays `dist`.
- Every task keeps the existing `npm test` suite green for the code it touches.
- Commit each task separately with the exact message shown in the task.

---

### Task 1: Fix font paths in `src/styles/fonts.css`

**Files:**
- Create: `tests/fonts-paths.test.ts`
- Modify: `src/styles/fonts.css`

**Interfaces:**
- Consumes: none.
- Produces: `src/styles/fonts.css` with no `/book-excerpts/` prefix; every `@font-face` uses `url('/fonts/<file>.woff2')`.

- [ ] **Step 1: Write the failing test**

Create `tests/fonts-paths.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles/fonts.css'), 'utf8')

describe('fonts.css for Cloudflare root deployment', () => {
  it('does not contain the old /book-excerpts/ prefix', () => {
    expect(css).not.toContain('/book-excerpts/')
  })

  it('loads every subset font from /fonts/', () => {
    const urls = [...css.matchAll(/url\((['"])(\/[^)'"]+\.woff2)\1\)/g)].map((m) => m[2])
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) expect(url.startsWith('/fonts/')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --run tests/fonts-paths.test.ts`

Expected: FAIL — the file contains `/book-excerpts/` and none of the URLs start with `/fonts/`.

- [ ] **Step 3: Replace every font URL prefix**

Use apply_patch. For each of these 8 files, change `url('/book-excerpts/fonts/<file>.woff2')` to `url('/fonts/<file>.woff2')`:

1. `SnellRoundhand.woff2` — occurs twice (normal and bold `@font-face`), so 10 replacements total.
2. `方正北魏楷书简体.woff2` — occurs twice.
3. `SourceHanSerifCN-SemiBold.woff2`
4. `FZLanTingXiHei.woff2`
5. `FZSongHei.woff2`
6. `FZXiaoZhuan.woff2`
7. `FZZhengXianHei.woff2`
8. `HuiWenMingChao.woff2`

Example of the applied change (repeat for every URL above):

```diff
-    url('/book-excerpts/fonts/SnellRoundhand.woff2') format('woff2');
+    url('/fonts/SnellRoundhand.woff2') format('woff2');
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- --run tests/fonts-paths.test.ts`

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/fonts-paths.test.ts src/styles/fonts.css
git commit -m "fix(fonts): use /fonts/ paths for Cloudflare root deployment"
```

---

### Task 2: Fix PWA manifest paths

**Files:**
- Create: `tests/manifest-paths.test.ts`
- Modify: `public/manifest-pwa.json`
- Modify: `public/manifest.json`

**Interfaces:**
- Consumes: none.
- Produces: Both manifests use `start_url: '/'`, `scope: '/'`, and icon `src` values `/icon.svg`, `/icon-180.png`, `/icon-512.png`.

- [ ] **Step 1: Write the failing test**

Create `tests/manifest-paths.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readManifest(file: string): Record<string, any> {
  return JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8'))
}

describe.each(['public/manifest-pwa.json', 'public/manifest.json'])(
  '%s for Cloudflare root deployment',
  (file) => {
    const manifest = readManifest(file)

    it('uses root start_url and scope', () => {
      expect(manifest.start_url).toBe('/')
      expect(manifest.scope).toBe('/')
    })

    it('uses root icon paths', () => {
      expect(manifest.icons.map((i: { src: string }) => i.src)).toEqual([
        '/icon.svg',
        '/icon-180.png',
        '/icon-512.png',
      ])
    })
  },
)
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --run tests/manifest-paths.test.ts`

Expected: FAIL — both manifests still point at `/book-excerpts/`.

- [ ] **Step 3: Update both manifest files**

In `public/manifest-pwa.json` and `public/manifest.json`, apply the same changes:

```diff
-  "start_url": "/book-excerpts/",
-  "scope": "/book-excerpts/",
+  "start_url": "/",
+  "scope": "/",
@@
-      "src": "/book-excerpts/icon.svg",
+      "src": "/icon.svg",
@@
-      "src": "/book-excerpts/icon-180.png",
+      "src": "/icon-180.png",
@@
-      "src": "/book-excerpts/icon-512.png",
+      "src": "/icon-512.png",
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- --run tests/manifest-paths.test.ts`

Expected: PASS (4 tests: 2 files × 2 assertions).

- [ ] **Step 5: Commit**

```bash
git add tests/manifest-paths.test.ts public/manifest-pwa.json public/manifest.json
git commit -m "fix(pwa): point manifest start_url/scope/icons at root for Cloudflare"
```

---

### Task 3: Fix Service Worker precache and bump cache version

**Files:**
- Create: `tests/sw-paths.test.ts`
- Modify: `public/sw.js`

**Interfaces:**
- Consumes: none.
- Produces: `public/sw.js` caches `/`, `/index.html`, `/manifest-pwa.json`, `/icon.svg`, `/icon-180.png`, `/icon-512.png`; cache name bumped to `zhai-lu-v7`.

- [ ] **Step 1: Write the failing test**

Create `tests/sw-paths.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sw = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

describe('Service Worker for Cloudflare root deployment', () => {
  it('does not reference the old /book-excerpts/ paths', () => {
    expect(sw).not.toContain('/book-excerpts/')
  })

  it('precaches root URLs only', () => {
    const block = sw.slice(sw.indexOf('const PRECACHE_URLS'), sw.indexOf('self.addEventListener'))
    expect(block).toContain("'/'")
    expect(block).toContain("'/index.html'")
    expect(block).toContain("'/manifest-pwa.json'")
    expect(block).toContain("'/icon.svg'")
    expect(block).toContain("'/icon-180.png'")
    expect(block).toContain("'/icon-512.png'")
  })

  it('uses a fresh cache version to invalidate old caches', () => {
    expect(sw).toMatch(/const CACHE_NAME = 'zhai-lu-v7';/)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --run tests/sw-paths.test.ts`

Expected: FAIL — old URLs are present and cache version is `v6`.

- [ ] **Step 3: Update `public/sw.js`**

Change the cache name:

```diff
-const CACHE_NAME = 'zhai-lu-v6';
+const CACHE_NAME = 'zhai-lu-v7';
```

Replace the precache array:

```diff
 const PRECACHE_URLS = [
-  '/book-excerpts/',
-  '/book-excerpts/index.html',
-  '/book-excerpts/manifest-pwa.json',
-  '/book-excerpts/icon.svg',
-  '/book-excerpts/icon-180.png',
-  '/book-excerpts/icon-512.png',
+  '/',
+  '/index.html',
+  '/manifest-pwa.json',
+  '/icon.svg',
+  '/icon-180.png',
+  '/icon-512.png',
 ];
```

Leave every other handler unchanged.

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- --run tests/sw-paths.test.ts`

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add tests/sw-paths.test.ts public/sw.js
git commit -m "fix(pwa): precache root URLs and bump SW cache to v7"
```

---

### Task 4: Update project docs/scripts and retire GitHub Pages

**Files:**
- Create: `tests/docs-paths.test.ts`
- Modify: `README.md`
- Modify: `preview.sh`
- Delete: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: nothing at runtime.
- Produces: `README.md` documents Cloudflare as the single host; `preview.sh` prints root URLs; GitHub Pages workflow no longer exists.

- [ ] **Step 1: Write the failing test**

Create `tests/docs-paths.test.ts`:

```ts
// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8')
const preview = readFileSync(resolve(ROOT, 'preview.sh'), 'utf8')

describe('docs point to Cloudflare root', () => {
  it('README advertises the Cloudflare URL and no longer the GitHub Pages one', () => {
    expect(readme).toContain('https://book-excerpts-2dm.pages.dev/')
    expect(readme).not.toContain('https://luyansun66.github.io/book-excerpts/')
  })

  it('README OCR section documents Cloudflare Pages environment variables', () => {
    expect(readme).toContain('Workers & Pages')
    expect(readme).toContain('Environment variables')
  })

  it('preview.sh prints root URLs', () => {
    expect(preview).not.toContain('/book-excerpts/')
  })

  it('GitHub Pages workflow has been removed', () => {
    expect(existsSync(resolve(ROOT, '.github/workflows/deploy.yml'))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- --run tests/docs-paths.test.ts`

Expected: FAIL — README/preview still reference GitHub Pages paths, and the workflow file exists.

- [ ] **Step 3: Update `README.md`**

In the OCR section, replace the GitHub Pages secret instructions with Cloudflare instructions:

```markdown
Cloudflare Pages 构建时，在项目 `Settings → Environment variables` 中配置
`VITE_OCR_ACCESS_TOKEN` 与 `VITE_OCR_TOKEN_EXPIRES`（Production 分支都要勾选），
重新部署后自动注入。
```

In the build/deploy section, replace the current text with:

```markdown
## 构建部署

```bash
npm run build
```

构建产物在 `dist/` 目录。Cloudflare Pages 已通过 Git 关联本仓库，
推送 `main` 分支后会自动执行 `npm run build` 并部署 `dist/`。
```

Replace the online link:

```markdown
## 在线体验

https://book-excerpts-2dm.pages.dev/
```

- [ ] **Step 4: Update `preview.sh`**

Change the two echo lines:

```diff
-echo "本机访问: http://localhost:4173/book-excerpts/"
+echo "本机访问: http://localhost:4173/"
@@
-  echo "手机访问: http://${IP}:4173/book-excerpts/"
+  echo "手机访问: http://${IP}:4173/"
```

- [ ] **Step 5: Delete the GitHub Pages workflow**

```bash
git rm .github/workflows/deploy.yml
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`

Expected: PASS — all four test files (fonts, manifest, sw, docs) pass.

- [ ] **Step 7: Commit**

```bash
git add tests/docs-paths.test.ts README.md preview.sh
git commit -m "chore: point docs and preview at Cloudflare root, remove GitHub Pages workflow"
```

Note: after pushing, also disable Pages in GitHub repo settings (`Settings → Pages → None`) so the retired workflow cannot leave a stale site.

---

### Task 5: Push and verify Cloudflare auto-deploy

**Files:** none (Cloudflare dashboard + remote verification).

- [ ] **Step 1: Push the branch to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Verify Cloudflare Pages project settings**

In Cloudflare Dashboard → Workers & Pages → `book-excerpts-2dm` → Settings → Builds & deployments, confirm:

- Production branch: `main`
- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Connected repository: `luyansun66/book-excerpts`

If the project is not Git-connected, connect it (this is what makes pushes auto-deploy). If it was created by Direct Upload, pushes will NOT deploy; use `npx wrangler pages deploy dist --project-name=book-excerpts-2dm` manually instead.

- [ ] **Step 3: Confirm the new deployment went live**

Run:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://book-excerpts-2dm.pages.dev/
```

Expected: `200`

```bash
curl -sS https://book-excerpts-2dm.pages.dev/manifest-pwa.json | grep -E '"start_url"|"scope"'
```

Expected:

```json
  "start_url": "/",
  "scope": "/",
```

```bash
CSS=$(curl -sS https://book-excerpts-2dm.pages.dev/ | sed -n 's/.*href="\([^"]*\.css\)".*/\1/p')
curl -sS "https://book-excerpts-2dm.pages.dev${CSS}" | grep -c '/book-excerpts'
```

Expected: `0`

```bash
curl -sS -I https://book-excerpts-2dm.pages.dev/fonts/SnellRoundhand.woff2 | grep -i '^content-type:'
```

Expected: `content-type: font/woff2`

```bash
curl -sS https://book-excerpts-2dm.pages.dev/sw.js | grep -E "CACHE_NAME|'/index.html'"
```

Expected: `const CACHE_NAME = 'zhai-lu-v7';` and `'/index.html'`.

- [ ] **Step 4: Manual PWA smoke test**

In an incognito/private browser window:

1. Open `https://book-excerpts-2dm.pages.dev/` and confirm the bookshelf renders with custom fonts.
2. Open a share card and confirm custom fonts (e.g. SnellRoundhand) are applied.
3. Use “Add to Home Screen”, reopen from the home screen, and verify it starts at `/`.
4. Reload the app once online, switch to airplane mode, and reload again to verify offline still works.
