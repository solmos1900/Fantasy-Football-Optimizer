/**
 * Guard: package.json + lockfile must resolve next ≥ 16.3.8
 * (clears GHSA-vcvr-r3jv-pc5j and related Next 16.x advisories).
 *
 * Run: npm run verify:next-version
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIN = "16.3.8";

function parseSemver(v: string): [number, number, number] {
  const cleaned = v.replace(/^[=^~v]/, "").split("-")[0]!;
  const parts = cleaned.split(".").map((p) => Number(p));
  assert.ok(
    parts.length >= 3 && parts.every((n) => Number.isInteger(n) && n >= 0),
    `invalid semver: ${v}`,
  );
  return [parts[0]!, parts[1]!, parts[2]!];
}

function gte(a: string, b: string): boolean {
  const [am, an, ap] = parseSemver(a);
  const [bm, bn, bp] = parseSemver(b);
  if (am !== bm) return am > bm;
  if (an !== bn) return an > bn;
  return ap >= bp;
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies?: { next?: string };
  devDependencies?: { "eslint-config-next"?: string };
};
const lock = JSON.parse(
  readFileSync(join(root, "package-lock.json"), "utf8"),
) as {
  packages?: Record<string, { version?: string }>;
};

const pkgNext = pkg.dependencies?.next;
const pkgEslint = pkg.devDependencies?.["eslint-config-next"];
assert.ok(pkgNext, "package.json missing dependencies.next");
assert.ok(pkgEslint, "package.json missing devDependencies.eslint-config-next");
assert.ok(
  gte(pkgNext, MIN),
  `package.json next ${pkgNext} must be >= ${MIN}`,
);
assert.ok(
  gte(pkgEslint, MIN),
  `package.json eslint-config-next ${pkgEslint} must be >= ${MIN}`,
);

const lockNext = lock.packages?.["node_modules/next"]?.version;
const lockEslint =
  lock.packages?.["node_modules/eslint-config-next"]?.version;
assert.ok(lockNext, "package-lock.json missing node_modules/next");
assert.ok(
  lockEslint,
  "package-lock.json missing node_modules/eslint-config-next",
);
assert.ok(
  gte(lockNext, MIN),
  `lockfile next ${lockNext} must be >= ${MIN}`,
);
assert.ok(
  gte(lockEslint, MIN),
  `lockfile eslint-config-next ${lockEslint} must be >= ${MIN}`,
);

console.log(
  `ok: next@${lockNext}, eslint-config-next@${lockEslint} (>= ${MIN})`,
);
