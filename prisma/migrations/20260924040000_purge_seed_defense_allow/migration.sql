-- DefenseWeekAllow: never default to fabricated seed rows.
-- Live product must only persist espn/demo observations from completed weeks.
ALTER TABLE "DefenseWeekAllow" ALTER COLUMN "source" SET DEFAULT 'espn';

-- Purge any legacy invented comps so insights never read them.
DELETE FROM "DefenseWeekAllow" WHERE "source" = 'seed';
