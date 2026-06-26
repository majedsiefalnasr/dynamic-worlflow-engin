# UI/Behavior Comparison Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing screenshot-diff tool to capture tabs, dialogs, and inner pages, and add scripted validation probes that compare error/success text between `main` (mock) and `live` (API) branches.

**Architecture:** Extends `matrix.mjs` with `interactions` (click targets for sub-state screenshots) and `probes` (form test cases with expected outcomes). `capture.mjs` walks these after the base screenshot. `diff.mjs` gains a probes-diff pass producing a new "Behavior Probe Results" report section.

**Tech Stack:** Playwright (raw API), pixelmatch, pngjs — already installed.

## Global Constraints

- Backend: local Laravel at `http://localhost:8000`. Both branches proxy `/api` to it via `vite.config.ts`.
- Viewports: desktop `{ width: 1440, height: 900 }`, mobile `{ width: 375, height: 812 }`.
- Output paths: `output/ui-comparison/{branch}/{role}/{viewport}/{screen}.png` (existing), `output/ui-comparison/{branch}/{role}/{viewport}/{screen}__{subState}.png` (new sub-states).
- Probe results: `output/ui-comparison/{branch}/probes.json`.
- Report: `docs/ui-comparison-report.md` (extended with probe results section).
- Error handling: single interaction/probe failure is logged, never aborts the run. Missing probe results on either side = "missing" status, never fabricated as a match.
- Cleanup after valid-submit probes: delete the created record using the UI's delete action where available; log a warning if cleanup fails, naming the exact record values used.
- Mock-mode navigation: use `gotoClientSide` (pushState + popstate) for all in-page navigation — never `page.goto` after initial login (which would wipe in-memory auth).
- Probes run at **desktop viewport only** — no need to repeat the same validation logic test at mobile size (screenshots still capture both viewports for sub-states).
- Each screen's interactions/probes are executed by role `rc_platform_admin` only (the admin has access to all screens). Other roles get base-screen screenshots from round 1 but not the interaction/probe pass — this keeps run time manageable while covering 100% of the form surface.

---

### Task 1: Extend matrix with interactions and probes

**Files:**
- Modify: `scripts/ui-comparison/matrix.mjs`

**Interfaces:**
- Consumes: nothing new
- Produces: each screen object in `ROLES[*].screens` may now have optional `interactions: Array<{ key: string, type: "tab" | "dialog", trigger: string }>` and optional `probes: Array<{ id: string, setup: Array<{action: string, ...}>, expect: { kind: "invalid" | "valid", text?: string, cleanup?: Array<{action: string, ...}> } }>`.

- [ ] **Step 1: Add interaction and probe definitions to admin-workflows screen**

Replace the `admin-workflows` entry in `ADMIN_SCREENS` with a richer definition.

Also update `COMMON_SCREENS` to add a requests probe:

```js
const COMMON_SCREENS = [
  { key: "dashboard", path: "/" },
  {
    key: "requests",
    path: "/workflows",
    probes: [
      {
        id: "requests-new",
        setup: [
          { action: "click", trigger: "طلب جديد" },
        ],
        expect: {
          kind: "valid",
          text: "تم إنشاء طلب جديد",
          cleanup: [],
        },
      },
    ],
  },
  { key: "notifications", path: "/notifications" },
  { key: "profile", path: "/profile" },
];
```

Replace `ADMIN_SCREENS` with:

```js
const ADMIN_SCREENS = [
  {
    key: "admin-workflows",
    path: "/admin/workflows",
    interactions: [
      { key: "tab-stages", type: "tab", trigger: "المراحل" },
      { key: "tab-stage-routing", type: "tab", trigger: "سير العملية التنظيمية" },
      { key: "tab-transitions", type: "tab", trigger: "الانتقالات" },
      { key: "tab-assignments", type: "tab", trigger: "الصلاحيات" },
      { key: "tab-fields", type: "tab", trigger: "الحقول" },
      { key: "tab-rules", type: "tab", trigger: "قواعد الحقول" },
      { key: "tab-actions", type: "tab", trigger: "الإجراءات" },
    ],
    probes: [
      {
        id: "wf-stages-add-empty",
        setup: [
          { action: "click-tab", trigger: "المراحل" },
          { action: "click", trigger: "إضافة مرحلة" },
        ],
        expect: { kind: "invalid", text: "الاسم والرمز مطلوبان" },
      },
      {
        id: "wf-stages-add-valid",
        setup: [
          { action: "click-tab", trigger: "المراحل" },
          { action: "fill", label: "رمز المرحلة", value: "TEST_PROBE" },
          { action: "fill", label: "اسم المرحلة", value: "مرحلة اختبار" },
          { action: "click", trigger: "إضافة مرحلة" },
        ],
        expect: {
          kind: "valid",
          text: "تمت إضافة المرحلة",
          cleanup: [{ action: "delete-row", text: "TEST_PROBE" }],
        },
      },
      {
        id: "wf-actions-add-empty",
        setup: [
          { action: "click-tab", trigger: "الإجراءات" },
          { action: "click", trigger: "إضافة إجراء" },
        ],
        expect: { kind: "invalid", text: "الرمز والاسم مطلوبان" },
      },
      {
        id: "wf-actions-add-valid",
        setup: [
          { action: "click-tab", trigger: "الإجراءات" },
          { action: "fill", label: "رمز الإجراء", value: "TEST_ACTION" },
          { action: "fill", label: "اسم الإجراء", value: "إجراء اختبار" },
          { action: "click", trigger: "إضافة إجراء" },
        ],
        expect: {
          kind: "valid",
          text: "تمت إضافة الإجراء",
          cleanup: [{ action: "delete-row", text: "TEST_ACTION" }],
        },
      },
    ],
  },
  { key: "admin-reference-data", path: "/admin/reference-data",
    probes: [
      {
        id: "refdata-add-table-empty",
        setup: [
          { action: "click", trigger: "إضافة جدول" },
        ],
        expect: { kind: "invalid", text: "المفتاح والاسم مطلوبان" },
      },
      {
        id: "refdata-add-table-bad-key",
        setup: [
          { action: "fill", label: "المفتاح", value: "INVALID KEY!" },
          { action: "fill", label: "اسم العرض", value: "جدول اختبار" },
          { action: "click", trigger: "إضافة جدول" },
        ],
        expect: { kind: "invalid", text: "المفتاح يجب أن يكون بالإنجليزية مثل arrival_port" },
      },
      {
        id: "refdata-add-table-valid",
        setup: [
          { action: "fill", label: "المفتاح", value: "test_probe_tbl" },
          { action: "fill", label: "اسم العرض", value: "جدول اختبار" },
          { action: "click", trigger: "إضافة جدول" },
        ],
        expect: {
          kind: "valid",
          text: "تمت إضافة جدول داخلي",
          cleanup: [{ action: "delete-card", text: "جدول اختبار" }],
        },
      },
    ],
  },
  { key: "admin-screen-permissions", path: "/admin/screen-permissions" },
  {
    key: "admin-entities",
    path: "/admin/entities",
    interactions: [
      { key: "dialog-view", type: "dialog", trigger: "عرض" },
    ],
    probes: [
      {
        id: "entities-add-empty",
        setup: [
          { action: "click", trigger: "بنك جديد" },
          { action: "click", trigger: "إضافة" },
        ],
        expect: { kind: "invalid", text: "submit-disabled" },
      },
      {
        id: "entities-add-valid",
        setup: [
          { action: "click", trigger: "بنك جديد" },
          { action: "fill", label: "اسم البنك", value: "بنك اختبار الفحص" },
          { action: "fill", label: "رقم الترخيص", value: "BNK-TEST-999" },
          { action: "click", trigger: "إضافة" },
        ],
        expect: {
          kind: "valid",
          text: "تم",
          cleanup: [{ action: "close-dialog" }, { action: "delete-row", text: "بنك اختبار الفحص" }],
        },
      },
    ],
  },
  {
    key: "admin-orgs",
    path: "/admin/orgs",
    probes: [
      {
        id: "orgs-add-empty",
        setup: [
          { action: "click", trigger: "جهة جديدة" },
          { action: "click", trigger: "إضافة الجهة" },
        ],
        expect: { kind: "invalid", text: "submit-disabled" },
      },
      {
        id: "orgs-add-valid",
        setup: [
          { action: "click", trigger: "جهة جديدة" },
          { action: "fill", label: "اسم الجهة", value: "جهة اختبار الفحص" },
          { action: "click", trigger: "إضافة الجهة" },
        ],
        expect: {
          kind: "valid",
          text: "تم",
          cleanup: [{ action: "close-dialog" }, { action: "delete-row", text: "جهة اختبار الفحص" }],
        },
      },
    ],
  },
  {
    key: "admin-staff",
    path: "/admin/staff",
    interactions: [
      { key: "dialog-view", type: "dialog", trigger: "عرض" },
    ],
    probes: [
      {
        id: "staff-add-bad-email",
        setup: [
          { action: "click", trigger: "مستخدم جديد" },
          { action: "fill", label: "الاسم *", value: "مستخدم اختبار" },
          { action: "fill", label: "البريد الإلكتروني *", value: "not-an-email" },
        ],
        expect: { kind: "invalid", text: "submit-disabled" },
      },
    ],
  },
  {
    key: "admin-teams",
    path: "/admin/teams",
    probes: [
      {
        id: "teams-add-empty",
        setup: [
          { action: "click", trigger: "فريق جديد" },
          { action: "click", trigger: "إضافة الفريق" },
        ],
        expect: { kind: "invalid", text: "submit-disabled" },
      },
      {
        id: "teams-add-valid",
        setup: [
          { action: "click", trigger: "فريق جديد" },
          { action: "fill", label: "اسم الفريق", value: "فريق اختبار الفحص" },
          { action: "select", label: "الجهة", value: 0 },
          { action: "click", trigger: "إضافة الفريق" },
        ],
        expect: {
          kind: "valid",
          text: "تم",
          cleanup: [{ action: "close-dialog" }, { action: "delete-row", text: "فريق اختبار الفحص" }],
        },
      },
    ],
  },
  {
    key: "admin-roles",
    path: "/admin/roles",
    probes: [
      {
        id: "roles-add-empty",
        setup: [
          { action: "click", trigger: "دور جديد" },
          { action: "click", trigger: "إضافة الدور" },
        ],
        expect: { kind: "invalid", text: "submit-disabled" },
      },
      {
        id: "roles-add-valid",
        setup: [
          { action: "click", trigger: "دور جديد" },
          { action: "fill", label: "اسم الدور", value: "دور اختبار الفحص" },
          { action: "select", label: "الجهة", value: 0 },
          { action: "click", trigger: "إضافة الدور" },
        ],
        expect: {
          kind: "valid",
          text: "تم",
          cleanup: [{ action: "close-dialog" }, { action: "delete-row", text: "دور اختبار الفحص" }],
        },
      },
    ],
  },
  { key: "settings", path: "/settings" },
];
```

Also update the `merchants` screen entry used by roles that have it:

```js
const MERCHANTS_SCREEN = {
  key: "merchants",
  path: "/merchants",
  interactions: [
    { key: "dialog-view", type: "dialog", trigger: "عرض" },
  ],
  probes: [
    {
      id: "merchants-add-empty",
      setup: [
        { action: "click", trigger: "تاجر جديد" },
        { action: "click", trigger: "تسجيل" },
      ],
      expect: { kind: "invalid", text: "submit-disabled" },
    },
    {
      id: "merchants-add-valid",
      setup: [
        { action: "click", trigger: "تاجر جديد" },
        { action: "fill", label: "اسم التاجر", value: "تاجر اختبار الفحص" },
        { action: "fill", label: "الرقم الضريبي", value: "PROBE-TAX-999" },
        { action: "fill-date", label: "تاريخ انتهاء البطاقة الضريبية", value: "2027-12-31" },
        { action: "fill", label: "اسم الشركة", value: "شركة اختبار" },
        { action: "fill", label: "رقم السجل التجاري", value: "CR-PROBE-999" },
        { action: "fill-date", label: "تاريخ انتهاء السجل", value: "2027-12-31" },
        { action: "click", trigger: "تسجيل" },
      ],
      expect: {
        kind: "valid",
        text: "تم تسجيل التاجر",
        cleanup: [{ action: "close-dialog" }, { action: "delete-row", text: "تاجر اختبار الفحص" }],
      },
    },
  ],
};
```

Replace `{ key: "merchants", path: "/merchants" }` references in `ROLES` with `MERCHANTS_SCREEN`.

- [ ] **Step 2: Run `node scripts/ui-comparison/matrix.mjs` to verify no syntax errors**

Run: `node -e "import('./scripts/ui-comparison/matrix.mjs').then(m => { console.log('ROLES:', m.ROLES.length); m.ROLES.forEach(r => r.screens.forEach(s => { if (s.interactions) console.log(r.roleId, s.key, 'interactions:', s.interactions.length); if (s.probes) console.log(r.roleId, s.key, 'probes:', s.probes.length); })); })"`

Expected: `ROLES: 8`, interaction/probe counts for `rc_platform_admin` screens only (admin-workflows: 7 interactions + 4 probes, merchants: 1 interaction + 2 probes, etc.), no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/ui-comparison/matrix.mjs
git commit -m "feat(ui-comparison): extend matrix with interactions and probes for round 2"
```

---

### Task 2: Add interaction runner and probe executor to capture script

**Files:**
- Modify: `scripts/ui-comparison/capture.mjs`

**Interfaces:**
- Consumes: `ROLES` from `matrix.mjs` — screens now have optional `interactions` and `probes` arrays (from Task 1).
- Produces: new screenshot files at `{outRoot}/{roleId}/{viewportName}/{screenKey}__{interactionKey}.png`; probe results array written to `{outRoot}/probes.json` with shape `Array<{ id: string, roleId: string, screenKey: string, result: string, error?: string }>`.

- [ ] **Step 1: Add helper functions for interaction and probe execution**

Add these functions after the existing `gotoClientSide` function in `capture.mjs`:

```js
async function runSetupAction(page, step) {
  switch (step.action) {
    case "click-tab": {
      const tab = page.getByRole("tab", { name: step.trigger });
      await tab.click();
      await page.waitForTimeout(500);
      break;
    }
    case "click": {
      const btn = page.getByRole("button", { name: step.trigger }).first();
      await btn.click();
      await page.waitForTimeout(500);
      break;
    }
    case "fill": {
      const input = page.getByLabel(step.label).first();
      await input.fill(step.value);
      break;
    }
    case "fill-date": {
      const input = page.getByLabel(step.label).first();
      await input.fill(step.value);
      break;
    }
    case "select": {
      const trigger = page.getByLabel(step.label).first();
      await trigger.click();
      await page.waitForTimeout(300);
      const options = page.getByRole("option");
      const count = await options.count();
      if (count > step.value) {
        await options.nth(step.value).click();
      }
      await page.waitForTimeout(200);
      break;
    }
    case "close-dialog": {
      const closeBtn = page.locator('[role="dialog"] button[data-state]').first();
      if (await closeBtn.isVisible()) await closeBtn.click();
      await page.waitForTimeout(300);
      break;
    }
    case "delete-row": {
      const row = page.getByText(step.text, { exact: false }).first();
      if (await row.isVisible()) {
        const deleteBtn = row.locator("..").locator("..").getByRole("button", { name: "حذف" }).first();
        if (await deleteBtn.isVisible()) {
          await deleteBtn.click();
          await page.waitForTimeout(500);
        }
      }
      break;
    }
    case "delete-card": {
      const card = page.getByText(step.text, { exact: false }).first();
      if (await card.isVisible()) {
        const deleteBtn = card.locator("..").locator("..").getByRole("button").filter({ has: page.locator("svg") }).last();
        if (await deleteBtn.isVisible()) {
          await deleteBtn.click();
          await page.waitForTimeout(500);
        }
      }
      break;
    }
  }
}

async function captureToastText(page) {
  const toast = page.locator("[data-sonner-toast]").first();
  try {
    await toast.waitFor({ state: "visible", timeout: 3000 });
    const text = await toast.textContent();
    return text?.trim() ?? "";
  } catch {
    return "";
  }
}

async function isSubmitDisabled(page, triggerText) {
  const btn = page.getByRole("button", { name: triggerText }).first();
  try {
    const disabled = await btn.isDisabled();
    return disabled;
  } catch {
    return false;
  }
}

async function runInteractions(page, screen, roleId, viewportName, outRoot, failures) {
  if (!screen.interactions) return;
  for (const interaction of screen.interactions) {
    const subKey = `${screen.key}__${interaction.key}`;
    const outPath = `${outRoot}/${roleId}/${viewportName}/${subKey}.png`;
    try {
      if (interaction.type === "tab") {
        await runSetupAction(page, { action: "click-tab", trigger: interaction.trigger });
      } else if (interaction.type === "dialog") {
        const btn = page.getByRole("button", { name: interaction.trigger }).first();
        await btn.click();
        await page.waitForTimeout(500);
      }
      await page.waitForLoadState("networkidle");
      await ensureDir(outPath);
      await page.screenshot({ path: outPath, fullPage: true });
      if (interaction.type === "dialog") {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      }
    } catch (error) {
      failures.push({ roleId, screenKey: subKey, viewport: viewportName, url: page.url(), error: String(error) });
    }
  }
}

async function runProbes(page, screen, roleId, mode, baseUrl, probeResults, failures) {
  if (!screen.probes) return;
  for (const probe of screen.probes) {
    try {
      // Navigate back to the screen's base state before each probe
      if (mode === "mock") {
        await gotoClientSide(page, screen.path);
      } else {
        await page.goto(`http://localhost:${new URL(page.url()).port}${screen.path}`, { waitUntil: "networkidle", timeout: 15_000 });
      }
      await page.waitForTimeout(500);

      // Run setup steps
      for (const step of probe.setup) {
        await runSetupAction(page, step);
      }

      // Capture result
      let result;
      if (probe.expect.kind === "invalid") {
        const toastText = await captureToastText(page);
        if (toastText) {
          result = toastText;
        } else {
          // Check if submit button from last click step is disabled
          const lastClickStep = [...probe.setup].reverse().find((s) => s.action === "click");
          if (lastClickStep) {
            const disabled = await isSubmitDisabled(page, lastClickStep.trigger);
            result = disabled ? "submit-disabled" : "no-error-shown";
          } else {
            result = "no-error-shown";
          }
        }
      } else {
        // Valid case — check for success toast
        const toastText = await captureToastText(page);
        result = toastText || "no-toast";

        // Cleanup
        if (probe.expect.cleanup) {
          await page.waitForTimeout(500);
          for (const step of probe.expect.cleanup) {
            try {
              await runSetupAction(page, step);
            } catch (cleanupErr) {
              const probeInput = probe.setup.find((s) => s.action === "fill");
              failures.push({
                roleId,
                screenKey: screen.key,
                viewport: "desktop",
                url: page.url(),
                error: `Cleanup failed for probe ${probe.id} (created: ${probeInput?.value ?? "unknown"}): ${String(cleanupErr)}`,
              });
            }
          }
        }
      }

      probeResults.push({
        id: probe.id,
        roleId,
        screenKey: screen.key,
        result,
        expectedKind: probe.expect.kind,
        expectedText: probe.expect.text ?? null,
      });
    } catch (error) {
      probeResults.push({
        id: probe.id,
        roleId,
        screenKey: screen.key,
        result: `ERROR: ${String(error).slice(0, 200)}`,
        expectedKind: probe.expect.kind,
        expectedText: probe.expect.text ?? null,
      });
    }
  }
}
```

- [ ] **Step 2: Integrate interaction and probe runs into the main capture loop**

In `capture.mjs`'s main function, after the existing screenshot capture for each screen, add the interaction and probe calls. The main loop body becomes:

```js
  const probeResults = [];

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
          if (mode === "mock") {
            await gotoClientSide(page, screen.path);
          } else {
            await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 });
          }
          await ensureDir(outPath);
          await page.screenshot({ path: outPath, fullPage: true });

          // Run interactions (screenshot sub-states) at every viewport
          await runInteractions(page, screen, role.roleId, viewportName, outRoot, failures);
        } catch (error) {
          failures.push({ roleId: role.roleId, screenKey: screen.key, viewport: viewportName, url, error: String(error) });
        }
      }
    }

    // Run probes at desktop only, after all viewports are captured
    await page.setViewportSize(VIEWPORTS.desktop);
    for (const screen of role.screens) {
      if (screen.probes) {
        await runProbes(page, screen, role.roleId, mode, baseUrl, probeResults, failures);
      }
    }

    await context.close();
  }

  // Write probes JSON
  const probesPath = `${outRoot}/probes.json`;
  await ensureDir(probesPath);
  await writeFile(probesPath, JSON.stringify(probeResults, null, 2));
```

Update the final log line:

```js
  console.log(`Captured ${branch}: ${failures.length} failures, ${probeResults.length} probes logged`);
```

- [ ] **Step 3: Verify the script parses without errors**

Run: `node -e "import('./scripts/ui-comparison/capture.mjs').catch(e => console.error(e.message))"`

This will attempt to run (and fail at `chromium.launch` if no server is up), but the import itself should not throw a syntax error. If it logs an actual error like "Usage: --branch=..." that means the parse succeeded.

- [ ] **Step 4: Commit**

```bash
git add scripts/ui-comparison/capture.mjs
git commit -m "feat(ui-comparison): add interaction runner and probe executor to capture"
```

---

### Task 3: Extend diff script with probe comparison and report section

**Files:**
- Modify: `scripts/ui-comparison/diff.mjs`

**Interfaces:**
- Consumes: `ROLES` from `matrix.mjs` (now with `interactions` arrays to know which sub-state screenshot keys to diff), `output/ui-comparison/{main,live}/probes.json`.
- Produces: extended `docs/ui-comparison-report.md` with a new "## Behavior Probe Results" section after the existing diff table.

- [ ] **Step 1: Add probe loading and comparison logic**

Add these functions after the existing `loadFailures` function in `diff.mjs`:

```js
async function loadProbes(branch) {
  try {
    const raw = await readFile(`output/ui-comparison/${branch}/probes.json`, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function diffProbes(mainProbes, liveProbes) {
  const mainMap = new Map(mainProbes.map((p) => [p.id, p]));
  const liveMap = new Map(liveProbes.map((p) => [p.id, p]));
  const allIds = new Set([...mainMap.keys(), ...liveMap.keys()]);
  const results = [];

  for (const id of allIds) {
    const main = mainMap.get(id);
    const live = liveMap.get(id);
    if (!main || !live) {
      results.push({
        id,
        roleId: (main ?? live).roleId,
        screenKey: (main ?? live).screenKey,
        mainResult: main?.result ?? "MISSING",
        liveResult: live?.result ?? "MISSING",
        match: false,
        status: "missing",
      });
    } else {
      const match = main.result === live.result;
      results.push({
        id,
        roleId: main.roleId,
        screenKey: main.screenKey,
        mainResult: main.result,
        liveResult: live.result,
        expectedKind: main.expectedKind,
        expectedText: main.expectedText,
        match,
        status: "ok",
      });
    }
  }
  return results;
}
```

- [ ] **Step 2: Update the main diff loop to include sub-state screenshots**

In `diff.mjs`'s `main()`, the inner loop currently iterates `role.screens` and calls `diffPair(role.roleId, viewportName, screen.key)`. Extend it to also diff interaction sub-states:

```js
  for (const role of ROLES) {
    for (const viewportName of Object.keys(VIEWPORTS)) {
      for (const screen of role.screens) {
        results.push(await diffPair(role.roleId, viewportName, screen.key));
        // Also diff interaction sub-states
        if (screen.interactions) {
          for (const interaction of screen.interactions) {
            results.push(await diffPair(role.roleId, viewportName, `${screen.key}__${interaction.key}`));
          }
        }
      }
    }
  }
```

- [ ] **Step 3: Add the probe results section to the report**

After the existing screenshot diff table in `main()`, add:

```js
  // --- Probe comparison ---
  const mainProbes = await loadProbes("main");
  const liveProbes = await loadProbes("live");
  const probeResults = diffProbes(mainProbes, liveProbes);

  if (probeResults.length > 0) {
    lines.push("## Behavior Probe Results");
    lines.push("");
    lines.push("| Probe ID | Role | Screen | Main Result | Live Result | Match |");
    lines.push("|---|---|---|---|---|---|");

    const mismatches = probeResults.filter((p) => !p.match);
    const matches = probeResults.filter((p) => p.match);

    for (const p of [...mismatches, ...matches]) {
      const icon = p.match ? "✅" : "❌";
      const mainText = p.mainResult.length > 60 ? p.mainResult.slice(0, 57) + "..." : p.mainResult;
      const liveText = p.liveResult.length > 60 ? p.liveResult.slice(0, 57) + "..." : p.liveResult;
      lines.push(`| ${p.id} | ${p.roleId} | ${p.screenKey} | ${mainText} | ${liveText} | ${icon} |`);
    }
    lines.push("");
  }
```

Update the final console.log:

```js
  console.log(`Report written to docs/ui-comparison-report.md (${sorted.length} screenshot pairs, ${missing.length} missing, ${mainFailures.length + liveFailures.length} capture failures, ${probeResults.length} probes [${probeResults.filter(p => !p.match).length} mismatches])`);
```

- [ ] **Step 4: Verify the script parses without errors**

Run: `node -e "import('./scripts/ui-comparison/diff.mjs').catch(e => console.error(e.message))"`

Expected: script runs (may produce empty report if no output files exist yet), no syntax errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/ui-comparison/diff.mjs
git commit -m "feat(ui-comparison): extend diff with probe comparison and report section"
```

---

### Task 4: Set up worktree, run capture on both branches, diff, and review report

**Files:**
- No code files modified (execution task).
- Produces: `output/ui-comparison/{main,live}/` screenshots, `output/ui-comparison/{main,live}/probes.json`, `output/ui-comparison/diff/` diff images, `docs/ui-comparison-report.md`.

**Interfaces:**
- Consumes: everything from Tasks 1-3.

- [ ] **Step 1: Set up main worktree and start dev servers**

```bash
# Create worktree for main branch
git worktree add ../code-rev-main-worktree main

# Set mock-mode env in worktree
echo 'VITE_API_BASE_URL=\nVITE_API_RESOURCES=' > ../code-rev-main-worktree/.env

# Start live dev server (current checkout)
bun run dev --port 5173 --strictPort &

# Start main dev server (worktree)
cd ../code-rev-main-worktree && bun run dev --port 5174 --strictPort &
cd -

# Verify both servers respond
curl -s http://localhost:5173/login -o /dev/null -w "%{http_code}\n"
curl -s http://localhost:5174/login -o /dev/null -w "%{http_code}\n"
# Expected: 200 for both

# Verify backend is reachable
curl -s http://localhost:8000 -o /dev/null -w "%{http_code}\n"
```

- [ ] **Step 2: Run capture on live branch**

```bash
node scripts/ui-comparison/capture.mjs --branch=live --port=5173 --mode=api
```

Expected: `Captured live: 0 failures, N probes logged` (where N is the number of probes defined for `rc_platform_admin` screens — verify from matrix).

- [ ] **Step 3: Run capture on main branch**

```bash
node scripts/ui-comparison/capture.mjs --branch=main --port=5174 --mode=mock
```

Expected: `Captured main: 0 failures, N probes logged` (same N as live).

- [ ] **Step 4: Run diff and generate report**

```bash
node scripts/ui-comparison/diff.mjs
```

Expected: `Report written to docs/ui-comparison-report.md (M screenshot pairs, 0 missing, 0 capture failures, N probes [K mismatches])` where M > 108 (round 1 count) due to sub-state screenshots.

- [ ] **Step 5: Spot-check the report**

Read `docs/ui-comparison-report.md`. Verify:
1. Sub-state screenshot entries appear (e.g. `admin-workflows__tab-stages`).
2. Probe results table exists with both ✅ and ❌ entries.
3. No "MISSING" probe results (both branches should have run all probes).
4. Any mismatches make sense (genuine main-vs-live behavior difference, not a probe script bug).

If probe failures or unexpected results are found, debug and fix the probe definitions in `matrix.mjs` or the execution logic in `capture.mjs`, then re-run Steps 2-4.

- [ ] **Step 6: Commit the report and updated scripts (if any fixes were made)**

```bash
git add docs/ui-comparison-report.md scripts/ui-comparison/
git commit -m "docs: capture round-2 main-vs-live comparison with tabs, dialogs, and probes"
```

- [ ] **Step 7: Remove the worktree**

```bash
# Stop dev servers
pkill -f "vite.*5174"
pkill -f "vite.*5173"

# Remove worktree
git worktree remove ../code-rev-main-worktree
```
