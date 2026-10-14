async function main() {
  const res = await fetch("https://api.sleeper.app/v1/players/nfl");
  const data = (await res.json()) as Record<string, Record<string, unknown>>;
  for (const p of Object.values(data)) {
    const name = String(p.full_name ?? "");
    if (!/^(Brandon Aiyuk|Jake Browning|Jared Wayne)$/.test(name)) continue;
    console.log(
      JSON.stringify(
        {
          name,
          team: p.team,
          status: p.status,
          active: p.active,
          injury_status: p.injury_status,
          injury_body_part: p.injury_body_part,
          injury_notes: p.injury_notes,
          injury_start_date: p.injury_start_date,
          practice_participation: p.practice_participation,
          depth_chart_order: p.depth_chart_order,
          depth_chart_position: p.depth_chart_position,
          news_updated: p.news_updated,
          news_iso: p.news_updated
            ? new Date(
                Number(p.news_updated) < 1e12
                  ? Number(p.news_updated) * 1000
                  : Number(p.news_updated),
              ).toISOString()
            : null,
        },
        null,
        2,
      ),
    );
  }

  // 2025 weekly roster statuses for Aiyuk
  for (const season of [2025, 2026]) {
    const url = `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_${season}.csv`;
    const text = await fetch(url).then((r) => r.text());
    const lines = text.split("\n");
    const header = lines[0]!.split(",");
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));
    const hits = lines
      .slice(1)
      .filter((l) => /Aiyuk|Browning,Jake|Wayne,Jared|Jake Browning|Jared Wayne|Brandon Aiyuk/i.test(l))
      .map((l) => {
        // naive CSV — names may be quoted
        return l;
      });
    console.log(`\n## season ${season} matching lines: ${hits.length}`);
    for (const l of hits.slice(0, 20)) {
      // pull key fields via regex
      const name =
        l.match(/"(Brandon Aiyuk|Jake Browning|Jared Wayne)"/)?.[1] ??
        l.match(/(Brandon Aiyuk|Jake Browning|Jared Wayne)/)?.[1];
      if (!name) continue;
      const week = l.match(/,(\d+),/)?.[1];
      console.log(l.slice(0, 240));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
