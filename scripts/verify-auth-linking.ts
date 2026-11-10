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

// #180: Google sign-in must require a provider-verified email.
assert.match(
  authSource,
  /account\.provider === "google"[\s\S]*?email_verified[\s\S]*?!== true[\s\S]*?return false/,
  "signIn callback must reject Google profiles without email_verified === true",
);

// #196: sessions for deleted users are revoked, and tokens expire sooner.
assert.match(authSource, /userStillExists\(/, "jwt callback must check the user still exists");
assert.match(authSource, /maxAge:\s*7 \* 24 \* 60 \* 60/, "session maxAge should be shortened");
async function verifyUserExists() {
  const { userStillExists, resetUserExistsCache, USER_EXISTS_CACHE_MS } = await import(
    "../src/lib/auth/user-exists"
  );
  resetUserExistsCache();
  let calls = 0;
  let present = true;
  const lookup = async () => (calls++, present);
  assert.equal(await userStillExists("u1", lookup, 0), true);
  assert.equal(await userStillExists("u1", lookup, 1000), true);
  assert.equal(calls, 1, "positive answer is cached");
  present = false;
  assert.equal(await userStillExists("u1", lookup, USER_EXISTS_CACHE_MS + 1), false);
  assert.equal(await userStillExists("u1", lookup, USER_EXISTS_CACHE_MS + 2), false);
  assert.equal(calls, 3, "negative answers are not cached");
}

verifyUserExists().then(
  () => console.log("  user-exists cache: ok"),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);

console.log("verify-auth-linking: ok");
console.log(
  "  Google: allowDangerousEmailAccountLinking=true (preserved)",
);
console.log(
  "  GitHub: allowDangerousEmailAccountLinking disabled (safe default)",
);
