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
