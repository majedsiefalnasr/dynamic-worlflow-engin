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
  await page.getByText(role.name, { exact: true }).first().click();
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

// Mock auth on `main` lives in an in-memory module variable (src/lib/mock.ts),
// not localStorage/sessionStorage, so a full page navigation (page.goto)
// resets it and bounces every subsequent screen back to /login. Navigate
// client-side instead so TanStack Router's history-mode routing handles it
// without reloading the page/module state.
async function gotoClientSide(page, path) {
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await page.waitForLoadState("networkidle");
}

async function runSetupAction(page, step) {
  switch (step.action) {
    case "click-tab": {
      const tab = page.getByRole("tab", { name: step.trigger }).first();
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
        await page.goto(`${baseUrl}${screen.path}`, { waitUntil: "networkidle", timeout: 15_000 });
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

async function main() {
  const { branch, port, mode } = parseArgs();
  const baseUrl = `http://localhost:${port}`;
  const outRoot = `output/ui-comparison/${branch}`;
  const failures = [];
  const probeResults = [];

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

    // Run probes at desktop only, after all viewports are captured.
    // Probes run for rc_platform_admin only — other roles would produce
    // duplicate probe IDs that silently overwrite each other in diffProbes.
    if (role.roleId === "rc_platform_admin") {
      await page.setViewportSize(VIEWPORTS.desktop);
      for (const screen of role.screens) {
        if (screen.probes) {
          await runProbes(page, screen, role.roleId, mode, baseUrl, probeResults, failures);
        }
      }
    }

    await context.close();
  }

  await browser.close();

  const failuresPath = `${outRoot}/failures.json`;
  await ensureDir(failuresPath);
  await writeFile(failuresPath, JSON.stringify(failures, null, 2));

  // Write probes JSON
  const probesPath = `${outRoot}/probes.json`;
  await ensureDir(probesPath);
  await writeFile(probesPath, JSON.stringify(probeResults, null, 2));

  console.log(`Captured ${branch}: ${failures.length} failures, ${probeResults.length} probes logged`);
}

main();
