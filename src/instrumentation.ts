export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const cron = await import("node-cron");

    const secret = process.env.CRON_SECRET ?? "";
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

    const run = async (path: string) => {
      try {
        const res = await fetch(`${base}${path}?secret=${encodeURIComponent(secret)}`);
        const json = await res.json();
        console.log(`[cron] ${path}`, json);
      } catch (err) {
        console.error(`[cron] ${path} failed:`, err);
      }
    };

    const scoresSchedule = process.env.CRON_SCORES_SCHEDULE ?? "*/5 * * * *";
    const oddsSchedule = process.env.CRON_ODDS_SCHEDULE ?? "0 0 * * *";

    cron.default.schedule(scoresSchedule, () => run("/api/cron/fetch-scores"));
    cron.default.schedule(oddsSchedule, () => run("/api/cron/fetch-odds"));

    console.log(`[cron] Scheduled: fetch-scores (${scoresSchedule}), fetch-odds (${oddsSchedule})`);
  }
}
