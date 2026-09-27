/**
 * Retry `prisma migrate deploy` for Vercel builds.
 *
 * Preview failure on soft-cream commit reported errorCode P1002 — Prisma’s
 * “database reached but timed out” (Neon cold start / pooler advisory-lock
 * races). Soft-cream itself is CSS-only; local `next build` stayed green.
 */
import { spawnSync } from "node:child_process";

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 4000;

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* short busy-wait — fine inside Vercel build retries */
  }
}

function runMigrate() {
  return spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  console.log(`[migrate] attempt ${attempt}/${MAX_ATTEMPTS}`);
  const result = runMigrate();
  if (result.status === 0) {
    process.exit(0);
  }
  const code = result.status ?? 1;
  if (attempt === MAX_ATTEMPTS) {
    console.error(`[migrate] failed after ${MAX_ATTEMPTS} attempts (exit ${code})`);
    process.exit(code);
  }
  const delay = BASE_DELAY_MS * attempt;
  console.warn(`[migrate] non-zero exit ${code}; retrying in ${delay}ms…`);
  sleep(delay);
}
