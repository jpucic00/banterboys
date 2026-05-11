import { ODDS_TO_ESPN_ABBREV, TEAM_NAME_CORRECTIONS } from "./team-aliases";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";

export const ESPN_SPORT_MAP: Record<string, string> = {
  basketball_nba:                             "basketball/nba",
  soccer_epl:                                 "soccer/eng.1",
  soccer_fa_cup:                              "soccer/eng.fa",
  soccer_brazil_campeonato:                   "soccer/bra.1",
  soccer_spain_la_liga:                       "soccer/esp.1",
  soccer_germany_bundesliga:                  "soccer/ger.1",
  soccer_germany_dfb_pokal:                   "soccer/ger.dfb_pokal",
  soccer_italy_serie_a:                       "soccer/ita.1",
  soccer_italy_coppa_italia:                  "soccer/ita.coppa_italia",
  soccer_uefa_champs_league:                  "soccer/uefa.champions",
  soccer_uefa_europa_league:                  "soccer/uefa.europa",
  soccer_uefa_europa_conference_league:       "soccer/uefa.europa.conf",
  soccer_fifa_world_cup:                      "soccer/fifa.world",
  soccer_fifa_world_cup_qualifiers_europe:    "soccer/fifa.worldq.uefa",
  soccer_netherlands_eredivisie:              "soccer/ned.1",
  soccer_france_ligue_one:                   "soccer/fra.1",
  soccer_conmebol_copa_libertadores:         "soccer/conmebol.libertadores",
  icehockey_nhl:                              "hockey/nhl",
  mma_mixed_martial_arts:                     "mma/ufc",
};

export interface EspnEvent {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeAbbrev?: string;
  awayAbbrev?: string;
  homeLogo?: string;
  awayLogo?: string;
  homeScore: number;
  awayScore: number;
  completed: boolean;
  inProgress: boolean;
  eventDate: Date;
  wentToExtraTime: boolean;
  statusDetail?: string; // e.g. "45:00 - 1st Half", "HT", "Q3 4:23", "Final"
  winningSide?: "home" | "away" | null; // Used for sports where ESPN returns winner flags but no scores (e.g. MMA)
}

interface EspnCompetitor {
  homeAway?: "home" | "away";
  score: string;
  winner?: boolean;
  team?: { displayName: string; abbreviation?: string; logo?: string };
  athlete?: { displayName: string };
}

function isSoccerSport(sportKey: string): boolean {
  return sportKey.startsWith("soccer_");
}

/** ESPN CDN league slug for sports where logos can be constructed from team abbreviation */
const ABBREV_LOGO_CDN: Record<string, string> = {
  basketball_nba: "nba",
  americanfootball_nfl: "nfl",
  icehockey_nhl: "nhl",
  baseball_mlb: "mlb",
};

function resolveLogoUrl(sportKey: string, abbrev?: string, apiLogo?: string): string | undefined {
  if (apiLogo) return apiLogo;
  const cdnLeague = ABBREV_LOGO_CDN[sportKey];
  if (cdnLeague && abbrev) {
    return `https://a.espncdn.com/i/teamlogos/${cdnLeague}/500/${abbrev.toLowerCase()}.png`;
  }
  return undefined;
}

/** Soccer status names ESPN returns for completed ET / penalty matches.
 *  Names vary by competition (DFB-Pokal: STATUS_FINAL_AET, Coppa Italia: STATUS_FINAL_PEN). */
const SOCCER_EXTRA_TIME_STATUS_NAMES = new Set([
  "STATUS_OVERTIME",
  "STATUS_END_OF_EXTRA_TIME",
  "STATUS_PENALTIES",
  "STATUS_SHOOTOUT",
  "STATUS_FULL_TIME_ET",
  "STATUS_FULL_TIME_PEN",
  "STATUS_FINAL_AET",
  "STATUS_FINAL_PEN",
]);

/** NHL completed games are always STATUS_FINAL regardless of OT/SO — the signal is in shortDetail.
 *  Matches `Final/OT`, `Final/2OT`, `Final/3OT`, …, `Final/SO`. */
const NHL_EXTRA_TIME_SHORTDETAIL = /^Final\/(?:\d?OT|SO)$/;

function isExtraTime(sportKey: string, statusName: string | undefined, shortDetail: string | undefined): boolean {
  if (isSoccerSport(sportKey)) return SOCCER_EXTRA_TIME_STATUS_NAMES.has(statusName ?? "");
  if (sportKey === "icehockey_nhl") return NHL_EXTRA_TIME_SHORTDETAIL.test(shortDetail ?? "");
  return false;
}

interface EspnCompetition {
  id: string;
  date?: string;
  competitors: EspnCompetitor[];
  status: { type: { completed: boolean; state: "pre" | "in" | "post"; name?: string; shortDetail?: string } };
}

interface EspnRawEvent {
  id: string;
  date: string;
  competitions: EspnCompetition[];
}

interface EspnScoreboardResponse {
  events?: EspnRawEvent[];
}

function getCompetitorName(c: EspnCompetitor): string {
  return c.team?.displayName ?? c.athlete?.displayName ?? "";
}

function parseEspnEvents(data: EspnScoreboardResponse, sportKey: string): EspnEvent[] {
  const results: EspnEvent[] = [];
  for (const event of data.events ?? []) {
    const competitions = event.competitions ?? [];
    if (competitions.length === 0) continue;

    // Multi-competition events (e.g. UFC fight cards): each competition is a separate
    // bout — emit one EspnEvent per competition using comp.id and comp.date.
    // Single-competition events (team sports): use event.id to preserve existing behaviour.
    const isMultiFight = competitions.length > 1;

    for (const comp of competitions) {
      // Use homeAway designation when available (team sports); fall back to index order (MMA)
      const home = comp.competitors.find((c) => c.homeAway === "home") ?? comp.competitors[0];
      const away = comp.competitors.find((c) => c.homeAway === "away") ?? comp.competitors[1];
      if (!home || !away) continue;
      const winningSide: "home" | "away" | null =
        home.winner ? "home" : away.winner ? "away" : null;
      results.push({
        id: isMultiFight ? comp.id : event.id,
        homeTeam: getCompetitorName(home),
        awayTeam: getCompetitorName(away),
        homeAbbrev: home.team?.abbreviation,
        awayAbbrev: away.team?.abbreviation,
        homeLogo: resolveLogoUrl(sportKey, home.team?.abbreviation, home.team?.logo),
        awayLogo: resolveLogoUrl(sportKey, away.team?.abbreviation, away.team?.logo),
        homeScore: parseFloat(home.score) || 0,
        awayScore: parseFloat(away.score) || 0,
        completed: comp.status.type.completed,
        inProgress: comp.status.type.state === "in",
        eventDate: new Date(comp.date ?? event.date),
        wentToExtraTime: isExtraTime(sportKey, comp.status.type.name, comp.status.type.shortDetail),
        statusDetail: comp.status.type.shortDetail,
        winningSide,
      });

      // For single-competition events, only process the first competition.
      if (!isMultiFight) break;
    }
  }
  return results;
}

/** Fetch ESPN events for a specific date (YYYYMMDD format). Works for past and future dates. */
export async function fetchEspnEventsByDate(
  sportKey: string,
  dateStr: string
): Promise<EspnEvent[]> {
  const path = ESPN_SPORT_MAP[sportKey];
  if (!path) return [];
  const url = `${ESPN_BASE}/${path}/scoreboard?dates=${dateStr}&limit=100`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: EspnScoreboardResponse = await res.json();
    return parseEspnEvents(data, sportKey);
  } catch {
    return [];
  }
}

/** Fetch ESPN events for the last N days (for score settlement). */
export async function fetchEspnRecentEvents(
  sportKey: string,
  daysBack = 3
): Promise<EspnEvent[]> {
  const results: EspnEvent[] = [];
  const today = new Date();
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10).replace(/-/g, "");
    const events = await fetchEspnEventsByDate(sportKey, dateStr);
    results.push(...events);
  }
  return results;
}

// ── Matching utilities ─────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

const CITY_ABBREV: Record<string, string> = {
  "la ": "los angeles ",
  "ny ": "new york ",
  "nj ": "new jersey ",
  "sf ": "san francisco ",
  "kc ": "kansas city ",
  "tb ": "tampa bay ",
  "gb ": "green bay ",
};

function normalizeTeam(name: string): string {
  let n = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|sc|ac|cf|if|fk|sk|af|bk|afc|bfc|rfc|utd|united)\b/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  for (const [abbr, full] of Object.entries(CITY_ABBREV)) {
    if (n.startsWith(abbr)) n = full + n.slice(abbr.length);
  }
  return n;
}

function teamSimilarity(a: string, b: string): number {
  const na = normalizeTeam(a);
  const nb = normalizeTeam(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

const TEAM_SIMILARITY_THRESHOLD = 0.65;

/** Find the best matching ESPN event for a given Odds API event.
 *  Returns the ESPN event ID if a confident match is found, otherwise null.
 *
 *  Matching strategy (in priority order):
 *  1. Exact abbreviation match via ODDS_TO_ESPN_ABBREV lookup table (for domestic leagues + NBA)
 *  2. Fuzzy name similarity fallback (for tournaments, MMA, and any unmapped teams)
 *
 *  Time window is 3h for team sports (same kick-off time in both APIs),
 *  24h for MMA (cards can run long / exact times less reliable). */
export interface EspnMatchResult {
  event: EspnEvent;
  reversed: boolean;
}

export function findEspnMatch(
  homeTeam: string,
  awayTeam: string,
  commenceTime: Date,
  espnEvents: EspnEvent[],
  sportKey?: string
): EspnMatchResult | null {
  const timeWindowMs = 48 * 60 * 60 * 1000; // 48h — covers ±1 day date boundary differences between Odds API and ESPN

  // ── 1. Abbreviation lookup (exact match, no time window needed) ──────────
  // homeAbbrev+awayAbbrev uniquely identifies a game within a sport's date range.
  const sportMap = sportKey ? ODDS_TO_ESPN_ABBREV[sportKey] : undefined;
  if (sportMap) {
    const homeAbbrev = sportMap[homeTeam];
    const awayAbbrev = sportMap[awayTeam];
    if (homeAbbrev && awayAbbrev) {
      for (const e of espnEvents) {
        if (e.homeAbbrev === homeAbbrev && e.awayAbbrev === awayAbbrev) return { event: e, reversed: false };
        if (e.homeAbbrev === awayAbbrev && e.awayAbbrev === homeAbbrev) return { event: e, reversed: true };
      }
    }
  }

  // ── 2. Fuzzy fallback ─────────────────────────────────────────────────────
  // Apply known name corrections before similarity scoring to handle structural
  // divergences that fuzzy matching can't bridge (e.g. "Sporting Lisbon" ↔ "Sporting CP").
  const correctedHome = TEAM_NAME_CORRECTIONS[homeTeam] ?? homeTeam;
  const correctedAway = TEAM_NAME_CORRECTIONS[awayTeam] ?? awayTeam;

  let bestMatch: EspnEvent | null = null;
  let bestScore = -1;
  let bestReversed = false;

  for (const e of espnEvents) {
    if (Math.abs(e.eventDate.getTime() - commenceTime.getTime()) > timeWindowMs) continue;

    // Try normal order
    const h1 = teamSimilarity(correctedHome, e.homeTeam);
    const a1 = teamSimilarity(correctedAway, e.awayTeam);
    const score1 = h1 >= TEAM_SIMILARITY_THRESHOLD && a1 >= TEAM_SIMILARITY_THRESHOLD ? h1 + a1 : -1;

    // Try reversed order (covers MMA and other sports with no meaningful home/away)
    const h2 = teamSimilarity(correctedHome, e.awayTeam);
    const a2 = teamSimilarity(correctedAway, e.homeTeam);
    const score2 = h2 >= TEAM_SIMILARITY_THRESHOLD && a2 >= TEAM_SIMILARITY_THRESHOLD ? h2 + a2 : -1;

    const score = Math.max(score1, score2);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = e;
      bestReversed = score2 > score1;
    }
  }

  return bestMatch ? { event: bestMatch, reversed: bestReversed } : null;
}
