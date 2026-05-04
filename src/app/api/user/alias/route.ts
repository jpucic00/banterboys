import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const alias = typeof body.alias === "string" ? body.alias.trim() : "";

  if (!alias) {
    return NextResponse.json({ error: "Alias is required" }, { status: 400 });
  }

  try {
    const current = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { alias: true },
    });
    if (current?.alias === alias) {
      return NextResponse.json({ ok: true });
    }
    // Stamp aliasSetAt on every real change so the wheel death cron can ignore
    // deaths that pre-date this user joining (or rejoining under a new name).
    await prisma.user.update({
      where: { id: session.user.id },
      data: { alias, aliasSetAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Alias already taken" }, { status: 409 });
  }
}
