import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MAX_SPINS_PER_FRAME, getOrCreateActiveFrame, rerollCost } from "@/lib/wheel-of-henricus";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();

  const frame = await getOrCreateActiveFrame(prisma);

  const spins = await prisma.henricusSpin.findMany({
    where: { frameId: frame.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      assignedAlias: true,
      rerollCount: true,
      createdAt: true,
      spinner: { select: { id: true, name: true, alias: true, image: true } },
    },
  });

  const eligibleUsers = await prisma.user.findMany({
    where: { alias: { not: null }, excludedFromWheel: false },
    select: { id: true, alias: true, name: true, image: true },
    orderBy: { alias: "asc" },
  });

  const recentSettled = await prisma.henricusFrame.findMany({
    where: { status: "SETTLED" },
    orderBy: { settledAt: "desc" },
    take: 5,
    select: {
      id: true,
      deadAlias: true,
      totalPayout: true,
      settledAt: true,
      spins: {
        where: { isWinner: true },
        select: {
          spinner: { select: { name: true, alias: true } },
        },
      },
    },
  });

  let userState: {
    isLoggedIn: boolean;
    spinsRemaining: number;
    balance: number;
    userId: string | null;
    hasSpun: boolean;
    rerollCount: number;
    currentChampion: string | null;
    nextRerollCost: number;
  } = {
    isLoggedIn: false,
    spinsRemaining: 0,
    balance: 0,
    userId: null,
    hasSpun: false,
    rerollCount: 0,
    currentChampion: null,
    nextRerollCost: rerollCost(0),
  };

  if (session?.user?.id) {
    const userId = session.user.id;
    const [user, mySpin] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { saldoTibiaCoins: true },
      }),
      prisma.henricusSpin.findFirst({
        where: { frameId: frame.id, spinnerUserId: userId },
        select: { rerollCount: true, assignedAlias: true },
      }),
    ]);
    const hasSpun = !!mySpin;
    const rc = mySpin?.rerollCount ?? 0;
    userState = {
      isLoggedIn: true,
      spinsRemaining: hasSpun ? 0 : MAX_SPINS_PER_FRAME,
      balance: user?.saldoTibiaCoins ?? 0,
      userId,
      hasSpun,
      rerollCount: rc,
      currentChampion: mySpin?.assignedAlias ?? null,
      nextRerollCost: rerollCost(rc),
    };
  }

  return NextResponse.json({
    frame: {
      id: frame.id,
      totalSpinCount: frame.totalSpinCount,
      createdAt: frame.createdAt,
    },
    spins,
    eligibleUsers: eligibleUsers.map((u) => ({
      id: u.id,
      alias: u.alias as string,
      name: u.name,
      image: u.image,
    })),
    recentSettled: recentSettled.map((f) => ({
      id: f.id,
      deadAlias: f.deadAlias,
      totalPayout: f.totalPayout,
      settledAt: f.settledAt,
      winners: f.spins.map((s) => s.spinner.alias ?? s.spinner.name ?? "Unknown"),
    })),
    user: userState,
  });
}
