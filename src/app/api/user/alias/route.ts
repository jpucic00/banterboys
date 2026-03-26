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
    await prisma.user.update({
      where: { id: session.user.id },
      data: { alias },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Alias already taken" }, { status: 409 });
  }
}
