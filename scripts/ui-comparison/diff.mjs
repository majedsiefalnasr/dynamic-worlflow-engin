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
        // Also diff interaction sub-states
        if (screen.interactions) {
          for (const interaction of screen.interactions) {
            results.push(await diffPair(role.roleId, viewportName, `${screen.key}__${interaction.key}`));
          }
        }
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

  await writeFile("docs/ui-comparison-report.md", lines.join("\n"));
  console.log(`Report written to docs/ui-comparison-report.md (${sorted.length} screenshot pairs, ${missing.length} missing, ${mainFailures.length + liveFailures.length} capture failures, ${probeResults.length} probes [${probeResults.filter(p => !p.match).length} mismatches])`);
}

main();
