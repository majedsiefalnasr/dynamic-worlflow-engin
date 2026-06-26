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
  let buf;
  try {
    buf = await readFile(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    console.warn(`Corrupt or unreadable PNG at ${path}: ${error.message}`);
    return null;
  }

  try {
    return PNG.sync.read(buf);
  } catch (error) {
    console.warn(`Corrupt or unreadable PNG at ${path}: ${error.message}`);
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

  // pixelmatch requires both buffers to be exactly w*h*4 bytes; full-page
  // screenshots can differ in height, so crop both to the smaller of the
  // two dimensions actually captured before handing them to pixelmatch.
  const w = Math.min(mainPng.width, livePng.width);
  const h = Math.min(mainPng.height, livePng.height);

  const mainCropped = new PNG({ width: w, height: h });
  PNG.bitblt(mainPng, mainCropped, 0, 0, w, h, 0, 0);
  const liveCropped = new PNG({ width: w, height: h });
  PNG.bitblt(livePng, liveCropped, 0, 0, w, h, 0, 0);

  const diff = new PNG({ width: w, height: h });
  const numDiffPixels = pixelmatch(mainCropped.data, liveCropped.data, diff.data, w, h, { threshold: 0.1 });
  const diffPercent = ((numDiffPixels / (w * h)) * 100).toFixed(2);

  await ensureDir(diffPath);
  await writeFile(diffPath, PNG.sync.write(diff));

  return { roleId, viewportName, screenKey, status: "ok", mainPath, livePath, diffPath, diffPercent: Number(diffPercent) };
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
