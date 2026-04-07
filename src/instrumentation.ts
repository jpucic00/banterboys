export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const cron = await import("node-cron");

    const secret = process.env.CRON_SECRET ?? "";
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

    const run = async (path: string) => {
      try {
        const separator = path.includes("?") ? "&" : "?";
        const res = await fetch(`${base}${path}${separator}secret=${encodeURIComponent(secret)}`);
        const json = await res.json();
        console.log(`[cron] ${path}`, json);
      } catch (err) {
        console.error(`[cron] ${path} failed:`, err);
      }
    };

    const liveScoresSchedule = process.env.CRON_LIVE_SCORES_SCHEDULE ?? "* * * * *";
    const scoresSchedule = process.env.CRON_SCORES_SCHEDULE ?? "*/5 * * * *";
    const oddsSchedule = process.env.CRON_ODDS_SCHEDULE ?? "0 0 * * *";
    const cleanupSchedule = process.env.CRON_CLEANUP_SCHEDULE ?? "0 0 * * 0";
    cron.default.schedule(liveScoresSchedule, () => run("/api/cron/fetch-scores"));
    cron.default.schedule(scoresSchedule, () => run("/api/cron/fetch-scores?sweep=1"));
    cron.default.schedule(oddsSchedule, () => run("/api/cron/fetch-odds"));
    cron.default.schedule(cleanupSchedule, () => run("/api/cron/cleanup-unmapped"));

    console.log(`[cron] Scheduled: fetch-scores live (${liveScoresSchedule}), fetch-scores sweep (${scoresSchedule}), fetch-odds (${oddsSchedule}), cleanup-unmapped (${cleanupSchedule})`);
  }
}
