#!/usr/bin/env node
/**
 * Fail CI/local checks when production dependencies have high/critical advisories.
 * Uses `npm audit --omit=dev --json` so dev-only findings do not block.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});

const stdout = result.stdout || "";
let report;
try {
  report = JSON.parse(stdout);
} catch {
  console.error("audit:prod could not parse npm audit JSON output");
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}

const counts = report?.metadata?.vulnerabilities ?? {};
const high = Number(counts.high ?? 0);
const critical = Number(counts.critical ?? 0);

if (high > 0 || critical > 0) {
  const names = Object.entries(report.vulnerabilities ?? {})
    .filter(([, v]) => v.severity === "high" || v.severity === "critical")
    .map(([name, v]) => `${name} (${v.severity})`);
  console.error(
    `Production audit failed: ${critical} critical, ${high} high.\n` +
      names.map((n) => `  - ${n}`).join("\n"),
  );
  process.exit(1);
}

console.log(
  `Production audit clean (high=0, critical=0; moderate=${counts.moderate ?? 0}, low=${counts.low ?? 0})`,
);
