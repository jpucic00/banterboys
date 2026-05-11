import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";

function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function GET() {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const events = await prisma.event.findMany({
    where: { sport: { key: { startsWith: "custom_" } } },
    include: {
      sport: true,
      odds: { orderBy: { fetchedAt: "desc" }, take: 1 },
      _count: { select: { selections: true, pvpBets: true } },
    },
    orderBy: { commenceTime: "desc" },
  });

  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const {
    sportName,
    homeTeam,
    awayTeam,
    commenceTime,
    homeOdds,
    awayOdds,
    drawOdds,
  } = body as {
    sportName?: string;
    homeTeam?: string;
    awayTeam?: string;
    commenceTime?: string;
    homeOdds?: number;
    awayOdds?: number;
    drawOdds?: number | null;
  };

  const sportNameClean = (sportName ?? "Guild PvP").trim();
  const homeClean = homeTeam?.trim();
  const awayClean = awayTeam?.trim();

  if (!sportNameClean) {
    return NextResponse.json({ error: "Sport name required" }, { status: 400 });
  }
  if (!homeClean || !awayClean) {
    return NextResponse.json({ error: "Both team names required" }, { status: 400 });
  }
  if (homeClean.toLowerCase() === awayClean.toLowerCase()) {
    return NextResponse.json({ error: "Team names must differ" }, { status: 400 });
  }
  if (typeof homeOdds !== "number" || typeof awayOdds !== "number") {
    return NextResponse.json({ error: "homeOdds and awayOdds required" }, { status: 400 });
  }
  if (homeOdds < 1.01 || awayOdds < 1.01) {
    return NextResponse.json({ error: "Odds must be ≥ 1.01" }, { status: 400 });
  }
  if (drawOdds !== undefined && drawOdds !== null && (typeof drawOdds !== "number" || drawOdds < 1.01)) {
    return NextResponse.json({ error: "drawOdds must be ≥ 1.01 if set" }, { status: 400 });
  }

  const commenceDate = commenceTime ? new Date(commenceTime) : null;
  if (!commenceDate || isNaN(commenceDate.getTime())) {
    return NextResponse.json({ error: "Valid commenceTime required" }, { status: 400 });
  }
  if (commenceDate.getTime() <= Date.now()) {
    return NextResponse.json({ error: "commenceTime must be in the future" }, { status: 400 });
  }

  const sportKey = `custom_${slug(sportNameClean)}`;
  const apiEventId = `custom_${crypto.randomUUID()}`;

  const sport = await prisma.sport.upsert({
    where: { key: sportKey },
    update: { name: sportNameClean, active: true },
    create: { key: sportKey, name: sportNameClean, active: true },
  });

  const event = await prisma.event.create({
    data: {
      apiEventId,
      sportId: sport.id,
      homeTeam: homeClean,
      awayTeam: awayClean,
      commenceTime: commenceDate,
    },
  });

  await prisma.oddsSnapshot.create({
    data: {
      eventId: event.id,
      homeOdds,
      awayOdds,
      drawOdds: drawOdds ?? null,
      bookmaker: "house",
    },
  });

  return NextResponse.json({ id: event.id }, { status: 201 });
}
