/**
 * Regression guard: GitHub OAuth must not use dangerous email account linking.
 * Google may keep it (verified emails). No DB required.
 *
 * Run: npm run verify:auth-linking
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const authSource = fs.readFileSync(
  path.join(process.cwd(), "src/lib/auth.ts"),
  "utf8",
);

const googleBlock = authSource.match(
  /Google\(\{[\s\S]*?\}\),\s*\)/,
);
assert.ok(googleBlock, "expected Google provider config in auth.ts");
assert.match(
  googleBlock[0],
  /allowDangerousEmailAccountLinking:\s*true/,
  "Google may keep dangerous email linking (verified emails)",
);

const githubBlock = authSource.match(
  /GitHub\(\{[\s\S]*?\}\),\s*\)/,
);
assert.ok(githubBlock, "expected GitHub provider config in auth.ts");
assert.doesNotMatch(
  githubBlock[0],
  /allowDangerousEmailAccountLinking:\s*true/,
  "GitHub must not enable allowDangerousEmailAccountLinking (emails may be unverified)",
);
assert.match(
  githubBlock[0],
  /Do NOT enable allowDangerousEmailAccountLinking for GitHub/,
  "auth.ts should document why GitHub must not use dangerous email linking",
);

console.log("verify-auth-linking: ok");
console.log(
  "  Google: allowDangerousEmailAccountLinking=true (preserved)",
);
console.log(
  "  GitHub: allowDangerousEmailAccountLinking disabled (safe default)",
);
