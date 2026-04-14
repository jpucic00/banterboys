import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Currency } from "@prisma/client";

function isAdmin(email: string | null | undefined) {
  return email && email === process.env.ADMIN_EMAIL;
}

export async function GET() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { alias: { not: null } },
    select: {
      id: true,
      alias: true,
      image: true,
      saldoGold: true,
      saldoTibiaCoins: true,
    },
    orderBy: { alias: "asc" },
  });

  return NextResponse.json(users);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { userId, currency, action, amount } = body as {
    userId: string;
    currency: Currency;
    action: "paid" | "adjust";
    amount?: number;
  };

  if (!userId || !currency || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const field = currency === Currency.GOLD ? "saldoGold" : "saldoTibiaCoins";

  if (action === "paid") {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { [field]: 0 },
      select: { id: true, alias: true, saldoGold: true, saldoTibiaCoins: true },
    });
    return NextResponse.json(user);
  }

  if (action === "adjust") {
    if (amount === undefined || amount === null) {
      return NextResponse.json({ error: "Amount required" }, { status: 400 });
    }
    const user = await prisma.user.update({
      where: { id: userId },
      data: { [field]: { increment: amount } },
      select: { id: true, alias: true, saldoGold: true, saldoTibiaCoins: true },
    });
    return NextResponse.json(user);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
