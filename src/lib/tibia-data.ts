// Thin wrapper around the public TibiaData v4 character endpoint. Used by the
// Wheel of Henricus death-detection cron to look up recent deaths for any
// alias currently in play. Fail-soft: any network/parse error returns [] so a
// single bad alias never blocks the whole cron tick.

const TIBIADATA_BASE = "https://api.tibiadata.com/v4";

export type TibiaDeath = {
  time: Date;
  level: number;
  reason: string;
};

type TibiaDataDeathRaw = {
  time?: string;
  level?: number;
  reason?: string;
};

type TibiaDataResponse = {
  character?: {
    deaths?: TibiaDataDeathRaw[];
  };
};

export async function fetchCharacterDeaths(name: string): Promise<TibiaDeath[]> {
  const url = `${TIBIADATA_BASE}/character/${encodeURIComponent(name)}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as TibiaDataResponse;
    const deaths = json.character?.deaths ?? [];
    return deaths
      .map((d) => {
        if (!d.time) return null;
        const t = new Date(d.time);
        if (Number.isNaN(t.getTime())) return null;
        return {
          time: t,
          level: typeof d.level === "number" ? d.level : 0,
          reason: typeof d.reason === "string" ? d.reason : "",
        };
      })
      .filter((d): d is TibiaDeath => d !== null);
  } catch {
    return [];
  }
}
