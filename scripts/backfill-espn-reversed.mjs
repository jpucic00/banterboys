// One-time script: backfill espnReversed for unsettled MMA events.
// Run: npx dotenv -- node scripts/backfill-espn-reversed.mjs [--dry-run]

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes("--dry-run");

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

function similarity(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  const longer = na.length >= nb.length ? na : nb;
  const shorter = na.length < nb.length ? na : nb;
  if (longer.length === 0) return 1;
  const costs = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastVal = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) { costs[j] = j; continue; }
      if (j > 0) {
        let newVal = costs[j - 1];
        if (longer[i - 1] !== shorter[j - 1]) newVal = Math.min(newVal, lastVal, costs[j]) + 1;
        costs[j - 1] = lastVal;
        lastVal = newVal;
      }
    }
    if (i > 0) costs[shorter.length] = lastVal;
  }
  return (longer.length - costs[shorter.length]) / longer.length;
}

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

async function fetchEspnEvent(espnEventId) {
  const url = `${ESPN_BASE}/mma/ufc/scoreboard/${espnEventId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const comps = data.competitions ?? data.events?.[0]?.competitions ?? [];
  if (comps.length === 0) return null;
  const comp = comps[0];
  const competitors = comp.competitors ?? [];
  if (competitors.length < 2) return null;
  const home = competitors.find((c) => c.homeAway === "home") ?? competitors[0];
  const away = competitors.find((c) => c.homeAway === "away") ?? competitors[1];
  return {
    homeName: home.athlete?.displayName ?? home.team?.displayName ?? "",
    awayName: away.athlete?.displayName ?? away.team?.displayName ?? "",
  };
}

async function main() {
  if (DRY_RUN) console.log("=== DRY RUN ===\n");

  const mmaEvents = await prisma.event.findMany({
    where: {
      espnEventId: { not: null },
      sport: { key: "mma_mixed_martial_arts" },
      status: { in: ["UPCOMING", "LIVE"] },
    },
    include: { sport: true },
  });

  console.log(`Found ${mmaEvents.length} unsettled MMA events with ESPN IDs.\n`);

  let updated = 0;
  for (const ev of mmaEvents) {
    const espn = await fetchEspnEvent(ev.espnEventId);
    if (!espn) {
      console.log(`  SKIP ${ev.homeTeam} vs ${ev.awayTeam} — could not fetch ESPN event ${ev.espnEventId}`);
      continue;
    }

    const normalScore = similarity(ev.homeTeam, espn.homeName) + similarity(ev.awayTeam, espn.awayName);
    const reversedScore = similarity(ev.homeTeam, espn.awayName) + similarity(ev.awayTeam, espn.homeName);
    const isReversed = reversedScore > normalScore;

    if (isReversed) {
      console.log(`  REVERSED: ${ev.homeTeam} vs ${ev.awayTeam}`);
      console.log(`    DB: home=${ev.homeTeam}, away=${ev.awayTeam}`);
      console.log(`    ESPN: home=${espn.homeName}, away=${espn.awayName}`);
      if (!DRY_RUN) {
        await prisma.event.update({
          where: { id: ev.id },
          data: { espnReversed: true },
        });
      }
      updated++;
    } else {
      console.log(`  OK: ${ev.homeTeam} vs ${ev.awayTeam}`);
    }
  }

  console.log(`\n${DRY_RUN ? "Would update" : "Updated"} ${updated} events.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
