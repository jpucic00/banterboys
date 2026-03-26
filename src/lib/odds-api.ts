const API_BASE = "https://api.the-odds-api.com/v4";

const SPORT_KEYS = [
  "basketball_nba",
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_germany_bundesliga",
  "soccer_italy_serie_a",
  "soccer_uefa_champs_league",
  "soccer_uefa_europa_league",
  "soccer_uefa_europa_conference_league",
  "soccer_uefa_nations_league",
  "soccer_fifa_world_cup",
  "soccer_europe_euro_qualification",
  "soccer_fifa_world_cup_qualification_europe",
  "soccer_netherlands_eredivisie",
  "soccer_international_friendly",
  "mma_mixed_martial_arts",
];

export interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: {
    key: string;
    title: string;
    markets: {
      key: string;
      outcomes: {
        name: string;
        price: number;
      }[];
    }[];
  }[];
}

export interface ScoresApiEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  completed: boolean;
  scores:
    | {
        name: string;
        score: string;
      }[]
    | null;
}

/** Returns all configured API keys. Reads ODDS_API_KEYS (comma-separated) first,
 *  then falls back to ODDS_API_KEY for backwards compatibility. */
function getApiKeys(): string[] {
  const multi = process.env.ODDS_API_KEYS?.split(",").map((k) => k.trim()).filter(Boolean) ?? [];
  const single = process.env.ODDS_API_KEY?.trim();
  if (single && !multi.includes(single)) multi.push(single);
  if (multi.length === 0) throw new Error("No Odds API keys configured (set ODDS_API_KEYS or ODDS_API_KEY)");
  return multi;
}

/** Fetches a URL with automatic key rotation on 429.
 *  Returns null for silent statuses (404, 422 = no data).
 *  Throws for unexpected errors after exhausting all keys. */
async function oddsApiFetch(
  buildUrl: (key: string) => URL,
  silentStatuses = [422, 404]
): Promise<Response | null> {
  const keys = getApiKeys();
  const exhausted: string[] = [];

  for (const key of keys) {
    const res = await fetch(buildUrl(key).toString());

    if (res.status === 429) {
      exhausted.push(`...${key.slice(-4)}`);
      console.warn(`[Odds API] Key ...${key.slice(-4)} rate limited, trying next`);
      continue;
    }

    if (!res.ok) {
      if (silentStatuses.includes(res.status)) return null;
      const body = await res.text().catch(() => "");
      throw new Error(`Odds API ${res.status}: ${body}`);
    }

    const remaining = res.headers.get("x-requests-remaining");
    console.log(`[Odds API] Key ...${key.slice(-4)}: ${remaining} credits remaining`);
    return res;
  }

  throw new Error(`All Odds API keys rate-limited: [${exhausted.join(", ")}]`);
}

export async function fetchSports() {
  const res = await oddsApiFetch((key) => {
    const u = new URL(`${API_BASE}/sports/`);
    u.searchParams.set("apiKey", key);
    return u;
  });
  if (!res) return [];
  return res.json();
}

export async function fetchOddsForSport(sportKey: string): Promise<OddsApiEvent[]> {
  const res = await oddsApiFetch((key) => {
    const u = new URL(`${API_BASE}/sports/${sportKey}/odds/`);
    u.searchParams.set("apiKey", key);
    u.searchParams.set("regions", "eu");
    u.searchParams.set("markets", "h2h");
    u.searchParams.set("oddsFormat", "decimal");
    return u;
  });
  if (!res) return [];
  return res.json();
}

export async function fetchScoresForSport(
  sportKey: string,
  daysFrom = 3
): Promise<ScoresApiEvent[]> {
  const res = await oddsApiFetch((key) => {
    const u = new URL(`${API_BASE}/sports/${sportKey}/scores/`);
    u.searchParams.set("apiKey", key);
    u.searchParams.set("daysFrom", String(daysFrom));
    return u;
  });
  if (!res) return [];
  return res.json();
}

export async function fetchEvents(sportKey: string) {
  const res = await oddsApiFetch((key) => {
    const u = new URL(`${API_BASE}/sports/${sportKey}/events/`);
    u.searchParams.set("apiKey", key);
    return u;
  }, [422, 404]);
  if (!res) return [];
  return res.json();
}

export { SPORT_KEYS };
