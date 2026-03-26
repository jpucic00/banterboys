import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { EventStatus } from "@prisma/client";

export async function GET() {
  const events = await prisma.event.findMany({
    where: { status: EventStatus.UPCOMING },
    include: {
      sport: true,
      odds: {
        orderBy: { fetchedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { commenceTime: "asc" },
  });

  return NextResponse.json(events);
}
