#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

async function readJson(filePath) {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function collectSourceFiles(dir, exts, results = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "target") continue;
      await collectSourceFiles(full, exts, results);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(full);
    }
  }
  return results;
}

async function analyzeDependencies(packageJson) {
  const srcDir = path.join(ROOT, "src");
  const files = await collectSourceFiles(srcDir, [".ts", ".tsx", ".js", ".jsx"]);

  const contents = await Promise.all(
    files.map(async (file) => {
      try {
        return await fs.readFile(file, "utf8");
      } catch {
        return "";
      }
    }),
  );
  const bigDeps = [];
  const maybeUnused = [];

  const deps = Object.keys(packageJson.dependencies || {});
  for (const dep of deps) {
    const token = dep.replace("@", "").split("/").pop();
    const used = contents.some((content) => content.includes(dep) || (token && content.includes(token)));
    if (!used) {
      maybeUnused.push(dep);
    }
    if (["react", "react-dom", "@tauri-apps/api"].includes(dep)) continue;
    if (["tailwindcss", "@tailwindcss/vite"].includes(dep)) continue;
    bigDeps.push(dep);
  }

  return { maybeUnused, bigDeps };
}

async function getFileSizeIfExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.isFile()) return stat.size;
  } catch {
    return null;
  }
  return null;
}

function formatBytes(bytes) {
  if (bytes == null) return "n/a";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(2)} ${units[unit]}`;
}

async function analyzeBundles() {
  const assetsDir = path.join(ROOT, "dist", "assets");
  let entries;
  try {
    entries = await fs.readdir(assetsDir, { withFileTypes: true });
  } catch {
    return { hasBuild: false, bundles: [] };
  }

  const bundles = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".js") && !entry.name.endsWith(".css")) continue;
    const full = path.join(assetsDir, entry.name);
    const size = await getFileSizeIfExists(full);
    if (size != null) {
      bundles.push({ name: entry.name, size });
    }
  }
  bundles.sort((a, b) => b.size - a.size);
  return { hasBuild: true, bundles };
}

async function analyzeRustBinary() {
  const debugPath = path.join(ROOT, "src-tauri", "target", "debug", "wyrmhole");
  const releasePath = path.join(ROOT, "src-tauri", "target", "release", "wyrmhole");

  const releaseSize = await getFileSizeIfExists(releasePath);
  const debugSize = await getFileSizeIfExists(debugPath);

  return { debugSize, releaseSize };
}

async function main() {
  const packageJson = await readJson(path.join(ROOT, "package.json"));

  console.log("=== Wyrmhole Project Analysis ===\n");

  console.log("1) Code Style & Tooling");
  console.log("   - Prettier config:", packageJson ? "present (.prettierrc)" : "missing");
  console.log("   - ESLint config:   .eslintrc.cjs");
  console.log("   - Recommended commands:");
  console.log("       npm run fmt        # format frontend code");
  console.log("       npm run fmt:rs     # format Rust/Tauri code");
  console.log("       npm run lint       # lint TypeScript/React");
  console.log("       npm run lint:rs    # clippy on Rust code\n");

  console.log("2) Dependencies");
  if (!packageJson) {
    console.log("   - package.json not found");
  } else {
    const depCount = Object.keys(packageJson.dependencies || {}).length;
    const devDepCount = Object.keys(packageJson.devDependencies || {}).length;
    console.log(`   - Dependencies:     ${depCount}`);
    console.log(`   - DevDependencies:  ${devDepCount}`);

    const { maybeUnused, bigDeps } = await analyzeDependencies(packageJson);
    if (maybeUnused.length) {
      console.log("   - Possibly unused (no direct import reference found in src/):");
      for (const dep of maybeUnused) {
        console.log(`       • ${dep}`);
      }
    } else {
      console.log("   - No obviously unused dependencies detected by simple scan.");
    }

    if (bigDeps.length) {
      console.log("   - Potentially heavy deps to keep an eye on:");
      for (const dep of bigDeps) {
        console.log(`       • ${dep}`);
      }
    }
  }
  console.log();

  console.log("3) Bundle / Payloads (dist/assets)");
  const bundleInfo = await analyzeBundles();
  if (!bundleInfo.hasBuild) {
    console.log("   - No Vite build output found. Run `npm run build` first to see bundle sizes.\n");
  } else if (!bundleInfo.bundles.length) {
    console.log("   - No JS/CSS assets found under dist/assets.\n");
  } else {
    const total = bundleInfo.bundles.reduce((sum, b) => sum + b.size, 0);
    console.log(`   - Total JS/CSS bundle size: ${formatBytes(total)}`);
    console.log("   - Largest assets:");
    for (const bundle of bundleInfo.bundles.slice(0, 5)) {
      console.log(`       • ${bundle.name}  (${formatBytes(bundle.size)})`);
    }
    console.log();
  }

  console.log("4) Rust / Tauri Binaries");
  const rustInfo = await analyzeRustBinary();
  if (!rustInfo.debugSize && !rustInfo.releaseSize) {
    console.log("   - No compiled Tauri binaries found. Run `npm run tauri build` to generate them.\n");
  } else {
    if (rustInfo.debugSize) {
      console.log(`   - Debug binary size:   ${formatBytes(rustInfo.debugSize)} (target/debug/wyrmhole)`);
    }
    if (rustInfo.releaseSize) {
      console.log(`   - Release binary size: ${formatBytes(rustInfo.releaseSize)} (target/release/wyrmhole)`);
    }
    console.log();
  }

  console.log("Summary:");
  console.log("   - Use the commands above to format, lint, and rebuild.");
  console.log("   - Re-run `npm run analyze` after builds to track bundle and binary sizes over time.");
}

main().catch((err) => {
  console.error("Analysis failed:", err);
  process.exitCode = 1;
});


