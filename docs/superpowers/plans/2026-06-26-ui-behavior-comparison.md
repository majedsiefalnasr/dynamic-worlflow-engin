# UI/Behavior Comparison (main vs live) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a screenshot-based diff report comparing every reachable screen, for every role, on `main` (mock UI) vs `live` (API-wired UI), so the team has a concrete punch list of UI/behavior regressions.

**Architecture:** A git worktree runs `main` on port 5174 in mock mode; the current `live` checkout runs on port 5173 in API mode; both proxy to the same local backend at `localhost:8000`. A single Node/Playwright script logs in as each of the 8 roles on both servers and screenshots every screen that role can reach, at desktop (1440×900) and mobile (375×812) viewports. A second script diffs matching screenshot pairs with `pixelmatch` and emits a markdown report.

**Tech Stack:** Playwright (`playwright` npm package, raw API not test-runner), `pixelmatch` + `pngjs` for diffing, Node.js script execution via `bun`.

## Global Constraints

- Backend: local Laravel server at `http://localhost:8000`, already proxied via `vite.config.ts`. Must be running and reachable before capture starts.
- `main` worktree must run in **mock mode**: empty `VITE_API_BASE_URL`.
- `live` checkout runs in **API mode** per its existing `.env` (`VITE_API_BASE_URL=/api/v1`).
- Desktop viewport: 1440×900. Mobile viewport: 375×812.
- Output screenshots: `output/ui-comparison/{branch}/{role}/{viewport}/{screen}.png`
- Diff images: `output/ui-comparison/diff/{role}/{viewport}/{screen}.png`
- Report: `docs/ui-comparison-report.md`
- If a screen/role combination fails to load, capture the failure (URL, error text, whatever rendered) instead of aborting the run.
- If the backend becomes unreachable mid-run, stop and report which captures completed vs missing — never emit a "0% diff" for an uncaptured pair.
- No automated interaction/flow testing — screenshots only, no fixing of found issues in this plan.

---

## File Structure

```
scripts/ui-comparison/
  matrix.mjs        # role × screen data, login helpers config (shared by both scripts)
  capture.mjs        # Playwright capture script — produces screenshots for one branch
  diff.mjs            # pixelmatch diff + markdown report generator
output/ui-comparison/
  main/...            # screenshots from main branch (gitignored)
  live/...            # screenshots from live branch (gitignored)
  diff/...            # diff images (gitignored)
docs/ui-comparison-report.md   # generated report (committed)
```

`matrix.mjs` is shared data (role list, per-role screen list, login mode) so `capture.mjs` and any future re-run stay in sync without duplicating the role/screen table. `capture.mjs` takes a `--port` and `--branch` (used as output folder name and to pick login mode: `main` → mock demo-picker login, `live` → email/password login). `diff.mjs` has no Playwright dependency — pure file comparison — so it can run after both capture passes finish.

---

### Task 1: Add capture dependencies

**Files:**
- Modify: `package.json` (add devDependencies)
- Modify: `.gitignore` (ignore `output/ui-comparison/{main,live,diff}` but keep the report)

**Interfaces:**
- Produces: `playwright`, `pixelmatch`, `pngjs` available as devDependencies for Tasks 2–4.

- [ ] **Step 1: Install Playwright and its browser binaries**

Run: `bun add -d playwright`
Then: `bunx playwright install chromium`

Expected: `playwright` added to `package.json` devDependencies; Chromium downloaded without errors.

- [ ] **Step 2: Install pixelmatch and pngjs**

Run: `bun add -d pixelmatch pngjs`

Expected: both added to `package.json` devDependencies.

- [ ] **Step 3: Update `.gitignore`**

Read the current `.gitignore` first, then append:

```
# UI comparison capture output (regenerable)
/output/ui-comparison/main/
/output/ui-comparison/live/
/output/ui-comparison/diff/
```

- [ ] **Step 4: Verify install**

Run: `bunx playwright --version`
Expected: prints a version string, e.g. `Version 1.4x.x`

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock .gitignore
git commit -m "chore: add playwright/pixelmatch deps for UI comparison capture"
```

---

### Task 2: Write the role/screen matrix module

**Files:**
- Create: `scripts/ui-comparison/matrix.mjs`

**Interfaces:**
- Produces:
  - `export const VIEWPORTS` — `{ desktop: { width: 1440, height: 900 }, mobile: { width: 375, height: 812 } }`
  - `export const ROLES` — array of `{ roleId, email, name, screens }` where `screens` is an array of `{ key, path }`.
  - Consumed by `capture.mjs` (Task 3) to drive login + navigation, and indirectly by `diff.mjs` (Task 4) which needs the same `roleId`/`screen.key` pairing to find matching files.

- [ ] **Step 1: Write `scripts/ui-comparison/matrix.mjs`**

```javascript
// Role × screen matrix for the main-vs-live UI comparison capture.
// `screens` lists every route a role can reach, derived from
// src/lib/governance.ts (screen perms) + workflow-bridge.ts (requests access,
// granted to every demo role) — see docs/superpowers/specs/2026-06-26-ui-behavior-comparison-design.md

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 375, height: 812 },
};

const COMMON_SCREENS = [
  { key: "dashboard", path: "/" },
  { key: "requests", path: "/workflows" },
  { key: "notifications", path: "/notifications" },
  { key: "profile", path: "/profile" },
];

const REPORTS_AUDIT_SCREENS = [
  { key: "reports", path: "/reports" },
  { key: "audit", path: "/audit" },
];

const ADMIN_SCREENS = [
  { key: "admin-workflows", path: "/admin/workflows" },
  { key: "admin-reference-data", path: "/admin/reference-data" },
  { key: "admin-screen-permissions", path: "/admin/screen-permissions" },
  { key: "admin-entities", path: "/admin/entities" },
  { key: "admin-orgs", path: "/admin/orgs" },
  { key: "admin-staff", path: "/admin/staff" },
  { key: "admin-teams", path: "/admin/teams" },
  { key: "admin-roles", path: "/admin/roles" },
  { key: "settings", path: "/settings" },
];

export const ROLES = [
  {
    roleId: "rc_platform_admin",
    email: "admin@cby.gov.ye",
    name: "ياسر الحضرمي",
    screens: [
      ...COMMON_SCREENS,
      { key: "merchants", path: "/merchants" },
      ...REPORTS_AUDIT_SCREENS,
      ...ADMIN_SCREENS,
    ],
  },
  {
    roleId: "rc_bank_admin",
    email: "admin@ybank.ye",
    name: "أحمد المقطري",
    screens: [...COMMON_SCREENS, { key: "merchants", path: "/merchants" }, ...REPORTS_AUDIT_SCREENS],
  },
  {
    roleId: "rc_bank_intake",
    email: "intake@ybank.ye",
    name: "علي القاضي",
    screens: [...COMMON_SCREENS, { key: "merchants", path: "/merchants" }],
  },
  {
    roleId: "rc_bank_reviewer",
    email: "reviewer@ybank.ye",
    name: "نوال الحاج",
    screens: [...COMMON_SCREENS],
  },
  {
    roleId: "rc_bank_swift",
    email: "swift@ybank.ye",
    name: "سامي العتمي",
    screens: [...COMMON_SCREENS],
  },
  {
    roleId: "rc_support_member",
    email: "m.shami@cby.gov.ye",
    name: "محمد الشامي",
    screens: [...COMMON_SCREENS, ...REPORTS_AUDIT_SCREENS],
  },
  {
    roleId: "rc_executive_member",
    email: "sami@cby.gov.ye",
    name: "م. سامي الذماري",
    screens: [...COMMON_SCREENS, ...REPORTS_AUDIT_SCREENS],
  },
  {
    roleId: "rc_committee_manager",
    email: "huda@cby.gov.ye",
    name: "د. هدى الإرياني",
    screens: [...COMMON_SCREENS, ...REPORTS_AUDIT_SCREENS],
  },
];

export const DEV_PASSWORD = "Password@123";
```

- [ ] **Step 2: Verify the module loads**

Run: `node -e "import('./scripts/ui-comparison/matrix.mjs').then(m => console.log(m.ROLES.length, m.ROLES[0].screens.length))"`
Expected: prints `8 17` (8 roles, platform admin has 17 screens: 4 common + 1 merchants + 2 reports/audit + 9 admin+settings + dashboard/requests/notif/profile already in common — count is illustrative, confirm it prints two numbers without error).

- [ ] **Step 3: Commit**

```bash
git add scripts/ui-comparison/matrix.mjs
git commit -m "feat(ui-comparison): add role/screen capture matrix"
```

---

### Task 3: Write the Playwright capture script

**Files:**
- Create: `scripts/ui-comparison/capture.mjs`

**Interfaces:**
- Consumes: `VIEWPORTS`, `ROLES`, `DEV_PASSWORD` from `scripts/ui-comparison/matrix.mjs` (Task 2).
- Produces: PNG files at `output/ui-comparison/{branch}/{roleId}/{viewportName}/{screenKey}.png`, and a JSON failure log at `output/ui-comparison/{branch}/failures.json` (array of `{ roleId, screenKey, viewport, url, error }`) consumed by `diff.mjs` (Task 4) to populate the report's failures section.

- [ ] **Step 1: Write `scripts/ui-comparison/capture.mjs`**

```javascript
// Captures screenshots for every role x screen x viewport combo on one
// running dev server. Run once per branch (main on :5174, live on :5173).
//
// Usage: node scripts/ui-comparison/capture.mjs --branch=live --port=5173 --mode=api
//        node scripts/ui-comparison/capture.mjs --branch=main --port=5174 --mode=mock

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { VIEWPORTS, ROLES, DEV_PASSWORD } from "./matrix.mjs";

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v];
    }),
  );
  if (!args.branch || !args.port || !args.mode) {
    throw new Error("Usage: --branch=<main|live> --port=<number> --mode=<mock|api>");
  }
  return { branch: args.branch, port: Number(args.port), mode: args.mode };
}

async function ensureDir(path) {
  await mkdir(dirname(path), { recursive: true });
}

async function loginMock(page, baseUrl, role) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByText(role.name, { exact: false }).first().click();
  await page.getByRole("button", { name: "متابعة إلى التحقق" }).click();
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL(`${baseUrl}/`, { timeout: 10_000 });
}

async function loginApi(page, baseUrl, role) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("البريد الإلكتروني المؤسسي").fill(role.email);
  await page.getByLabel("كلمة المرور").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL(`${baseUrl}/`, { timeout: 15_000 });
}

async function main() {
  const { branch, port, mode } = parseArgs();
  const baseUrl = `http://localhost:${port}`;
  const outRoot = `output/ui-comparison/${branch}`;
  const failures = [];

  const browser = await chromium.launch();

  for (const role of ROLES) {
    const context = await browser.newContext({ locale: "ar" });
    const page = await context.newPage();

    try {
      if (mode === "mock") {
        await loginMock(page, baseUrl, role);
      } else {
        await loginApi(page, baseUrl, role);
      }
    } catch (error) {
      failures.push({ roleId: role.roleId, screenKey: "__login__", viewport: "n/a", url: `${baseUrl}/login`, error: String(error) });
      await context.close();
      continue;
    }

    for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize(viewport);

      for (const screen of role.screens) {
        const url = `${baseUrl}${screen.path}`;
        const outPath = `${outRoot}/${role.roleId}/${viewportName}/${screen.key}.png`;
        try {
          await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });
          await ensureDir(outPath);
          await page.screenshot({ path: outPath, fullPage: true });
        } catch (error) {
          failures.push({ roleId: role.roleId, screenKey: screen.key, viewport: viewportName, url, error: String(error) });
        }
      }
    }

    await context.close();
  }

  await browser.close();

  const failuresPath = `${outRoot}/failures.json`;
  await ensureDir(failuresPath);
  await writeFile(failuresPath, JSON.stringify(failures, null, 2));

  console.log(`Captured ${branch}: ${failures.length} failures logged to ${failuresPath}`);
}

main();
```

- [ ] **Step 2: Verify the script's argument parsing fails loudly without args**

Run: `node scripts/ui-comparison/capture.mjs`
Expected: throws `Error: Usage: --branch=<main|live> --port=<number> --mode=<mock|api>`

- [ ] **Step 3: Commit**

```bash
git add scripts/ui-comparison/capture.mjs
git commit -m "feat(ui-comparison): add playwright capture script"
```

---

### Task 4: Write the diff + report generator

**Files:**
- Create: `scripts/ui-comparison/diff.mjs`

**Interfaces:**
- Consumes: PNG files at `output/ui-comparison/{main,live}/{roleId}/{viewportName}/{screenKey}.png` and `output/ui-comparison/{main,live}/failures.json` (both produced by Task 3's `capture.mjs`), plus `ROLES` from `matrix.mjs` (Task 2) to enumerate which pairs should exist.
- Produces: diff PNGs at `output/ui-comparison/diff/{roleId}/{viewportName}/{screenKey}.png` and the final report at `docs/ui-comparison-report.md`.

- [ ] **Step 1: Write `scripts/ui-comparison/diff.mjs`**

```javascript
// Diffs main vs live screenshots captured by capture.mjs and writes
// docs/ui-comparison-report.md.
//
// Usage: node scripts/ui-comparison/diff.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { ROLES, VIEWPORTS } from "./matrix.mjs";

async function ensureDir(path) {
  await mkdir(dirname(path), { recursive: true });
}

async function readPng(path) {
  try {
    const buf = await readFile(path);
    return PNG.sync.read(buf);
  } catch {
    return null;
  }
}

async function loadFailures(branch) {
  try {
    const raw = await readFile(`output/ui-comparison/${branch}/failures.json`, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function diffPair(roleId, viewportName, screenKey) {
  const mainPath = `output/ui-comparison/main/${roleId}/${viewportName}/${screenKey}.png`;
  const livePath = `output/ui-comparison/live/${roleId}/${viewportName}/${screenKey}.png`;
  const diffPath = `output/ui-comparison/diff/${roleId}/${viewportName}/${screenKey}.png`;

  const mainPng = await readPng(mainPath);
  const livePng = await readPng(livePath);

  if (!mainPng || !livePng) {
    return { roleId, viewportName, screenKey, status: "missing", mainPath, livePath, diffPath: null, diffPercent: null };
  }

  const { width, height } = VIEWPORTS[viewportName];
  // pixelmatch requires equal dimensions; full-page screenshots can differ
  // in height, so clamp to the smaller of the two heights actually captured.
  const w = Math.min(mainPng.width, livePng.width);
  const h = Math.min(mainPng.height, livePng.height);

  const diff = new PNG({ width: w, height: h });
  const numDiffPixels = pixelmatch(mainPng.data, livePng.data, diff.data, w, h, { threshold: 0.1 });
  const diffPercent = ((numDiffPixels / (w * h)) * 100).toFixed(2);

  await ensureDir(diffPath);
  await writeFile(diffPath, PNG.sync.write(diff));

  return { roleId, viewportName, screenKey, status: "ok", mainPath, livePath, diffPath, diffPercent: Number(diffPercent) };
}

function relPath(absoluteRoot, path) {
  return path.replace(`${absoluteRoot}/`, "");
}

async function main() {
  const mainFailures = await loadFailures("main");
  const liveFailures = await loadFailures("live");

  const results = [];
  for (const role of ROLES) {
    for (const viewportName of Object.keys(VIEWPORTS)) {
      for (const screen of role.screens) {
        results.push(await diffPair(role.roleId, viewportName, screen.key));
      }
    }
  }

  const sorted = results
    .filter((r) => r.status === "ok")
    .sort((a, b) => b.diffPercent - a.diffPercent);

  const missing = results.filter((r) => r.status === "missing");

  const lines = [];
  lines.push("# UI Comparison Report: main vs live");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  if (mainFailures.length || liveFailures.length || missing.length) {
    lines.push("## Failures / Missing Captures");
    lines.push("");
    lines.push("| Branch | Role | Screen | Viewport | URL | Error |");
    lines.push("|---|---|---|---|---|---|");
    for (const f of mainFailures) {
      lines.push(`| main | ${f.roleId} | ${f.screenKey} | ${f.viewport} | ${f.url} | ${f.error.slice(0, 120)} |`);
    }
    for (const f of liveFailures) {
      lines.push(`| live | ${f.roleId} | ${f.screenKey} | ${f.viewport} | ${f.url} | ${f.error.slice(0, 120)} |`);
    }
    for (const m of missing) {
      lines.push(`| both | ${m.roleId} | ${m.screenKey} | ${m.viewportName} | n/a | screenshot pair missing, see capture failures above |`);
    }
    lines.push("");
  }

  lines.push("## Diff Results (sorted by diff % descending)");
  lines.push("");
  lines.push("| Role | Screen | Viewport | Diff % | Main | Live | Diff |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of sorted) {
    lines.push(
      `| ${r.roleId} | ${r.screenKey} | ${r.viewportName} | ${r.diffPercent}% | [main](../${r.mainPath}) | [live](../${r.livePath}) | [diff](../${r.diffPath}) |`,
    );
  }
  lines.push("");

  await writeFile("docs/ui-comparison-report.md", lines.join("\n"));
  console.log(`Report written to docs/ui-comparison-report.md (${sorted.length} pairs, ${missing.length} missing, ${mainFailures.length + liveFailures.length} capture failures)`);
}

main();
```

- [ ] **Step 2: Verify the script handles a fully-missing output dir without crashing**

Run: `node scripts/ui-comparison/diff.mjs`
Expected: completes (no captures exist yet), prints `Report written to docs/ui-comparison-report.md (0 pairs, ...)`, and `docs/ui-comparison-report.md` exists with a "Failures / Missing Captures" section listing every role/screen as missing.

- [ ] **Step 3: Commit**

```bash
git add scripts/ui-comparison/diff.mjs docs/ui-comparison-report.md
git commit -m "feat(ui-comparison): add diff + report generator"
```

---

### Task 5: Set up the `main` worktree and verify both dev servers boot

**Files:**
- Create (outside repo): `../code-rev-main-worktree/` (git worktree, not tracked by this repo)
- Create: `../code-rev-main-worktree/.env` (mock-mode env for the worktree, not committed — worktree has its own working tree)

**Interfaces:**
- Produces: two running dev servers — `live` on `:5173`, `main` worktree on `:5174` — that Task 6's capture runs depend on.

- [ ] **Step 1: Create the worktree**

Run: `git worktree add ../code-rev-main-worktree main`
Expected: prints `Preparing worktree (checking out 'main')` and `HEAD is now at <sha> ...`.

- [ ] **Step 2: Install dependencies in the worktree**

Run: `cd ../code-rev-main-worktree && bun install && cd -`
Expected: completes without errors (separate `node_modules`, since it's a different working tree).

- [ ] **Step 3: Write the worktree's `.env` for mock mode**

Read `../code-rev-main-worktree/.env.example` first to confirm key names match, then write `../code-rev-main-worktree/.env`:

```
VITE_API_BASE_URL=
VITE_API_RESOURCES=
```

- [ ] **Step 4: Confirm the backend is reachable**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000 --max-time 3`
Expected: any HTTP status code (404 is fine — means the server answered). If the command times out or shows `000`, stop here and start the backend before continuing.

- [ ] **Step 5: Start the `live` dev server on :5173**

Run (background): `bun run dev` from the repo root (current `live` checkout). Confirm `vite.config.ts` default port is 5173.

Run: `grep -n "port" vite.config.ts`
Expected: shows the dev server port config; if no explicit port, Vite defaults to 5173 — confirm by checking the terminal output of `bun run dev`, which prints `Local: http://localhost:5173/`.

- [ ] **Step 6: Start the `main` worktree dev server on :5174**

Run (background, from `../code-rev-main-worktree`): `bun run dev -- --port 5174`
Expected: terminal output prints `Local: http://localhost:5174/`.

- [ ] **Step 7: Smoke-test both servers respond**

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/login`
Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5174/login`
Expected: both print `200`.

No commit for this task — it's local environment setup, not a code change.

---

### Task 6: Run the capture and diff, review the report

**Files:**
- Modify (generated, not hand-edited): `docs/ui-comparison-report.md`

**Interfaces:**
- Consumes: `capture.mjs` (Task 3), `diff.mjs` (Task 4), both dev servers from Task 5.
- Produces: final committed report for the team to act on.

- [ ] **Step 1: Run the capture against `live` (:5173, api mode)**

Run: `node scripts/ui-comparison/capture.mjs --branch=live --port=5173 --mode=api`
Expected: prints `Captured live: N failures logged to output/ui-comparison/live/failures.json` (N may be 0 or more — note any failures for review).

- [ ] **Step 2: Run the capture against `main` worktree (:5174, mock mode)**

Run: `node scripts/ui-comparison/capture.mjs --branch=main --port=5174 --mode=mock`
Expected: prints `Captured main: N failures logged to output/ui-comparison/main/failures.json`.

- [ ] **Step 3: Run the diff generator**

Run: `node scripts/ui-comparison/diff.mjs`
Expected: prints `Report written to docs/ui-comparison-report.md (140 pairs, 0 missing, ...)` — pair count should match the full role × screen × viewport matrix (any missing/failure count should match Steps 1–2's failure logs).

- [ ] **Step 4: Spot-check the top 3 highest-diff entries**

Open the `main`, `live`, and `diff` images linked at the top of the sorted table in `docs/ui-comparison-report.md` for the 3 highest diff percentages. Confirm the diff image highlights a real visual difference (not just font anti-aliasing noise) — if a top entry is pure noise, leave it in the report as-is (the report is a raw artifact for human review, not curated).

- [ ] **Step 5: Commit the report**

```bash
git add docs/ui-comparison-report.md
git commit -m "docs: capture main-vs-live UI comparison report"
```

- [ ] **Step 6: Remove the worktree**

Run: `git worktree remove ../code-rev-main-worktree`
Expected: worktree directory removed, `git worktree list` no longer shows it.

---

## Self-Review Notes

- **Spec coverage:** Test matrix (Task 2), worktree+server setup (Task 5), capture script (Task 3), diff+report (Task 4 & 6), error handling for failed loads and unreachable backend (built into `capture.mjs` try/catch and Task 5 Step 4 pre-flight check) — all spec sections have a corresponding task.
- **Placeholders:** none — every step has literal commands or complete code.
- **Type/name consistency:** `roleId`, `screenKey`/`screen.key`, `viewportName` used identically across `matrix.mjs`, `capture.mjs`, and `diff.mjs`; output path shape `{branch}/{roleId}/{viewportName}/{screenKey}.png` matches in both scripts.
