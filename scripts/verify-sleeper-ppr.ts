import assert from "node:assert/strict";
import { ptsPprFromRow } from "../src/lib/sleeper/projections";

assert.equal(
  ptsPprFromRow({
    stats: { pts_ppr: 18.26, pts_half_ppr: 24, pts: 30 },
    pts_ppr: 21,
  }),
  18.3,
  "nested full-PPR projections take precedence and round to one decimal place",
);

assert.equal(
  ptsPprFromRow({
    stats: { pts_ppr: null, pts_half_ppr: 12, pts: 10 },
    pts_ppr: "15.46",
    pts_half_ppr: 13,
    pts: 11,
  }),
  15.5,
  "top-level full-PPR projections are accepted when nested PPR is absent",
);

assert.equal(
  ptsPprFromRow({
    stats: { pts_ppr: "not-a-number", pts_half_ppr: 12 },
    pts_ppr: "7.27",
    pts: 10,
  }),
  7.3,
  "an invalid nested PPR value may fall back only to top-level full PPR",
);

assert.equal(
  ptsPprFromRow({
    stats: { pts_ppr: 0, pts_half_ppr: 8, pts: 9 },
    pts_ppr: 10,
  }),
  0,
  "a real zero full-PPR projection is preserved",
);

assert.equal(
  ptsPprFromRow({
    stats: { pts_half_ppr: 12, pts: 10 },
    pts_half_ppr: 13,
    pts: 11,
  }),
  null,
  "half-PPR and standard projections are omitted when full PPR is missing",
);

assert.equal(ptsPprFromRow(null), null);
assert.equal(ptsPprFromRow(undefined), null);

console.log("verify:sleeper-ppr: ok");
