import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deleted = await prisma.event.deleteMany({
    where: {
      espnEventId: null,
      commenceTime: { lt: new Date() },
      status: { in: ["UPCOMING", "LIVE"] },
    },
  });

  return NextResponse.json({ ok: true, deleted: deleted.count });
}
