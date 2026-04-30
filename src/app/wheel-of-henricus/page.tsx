import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { MAX_SPINS_PER_FRAME, getOrCreateActiveFrame } from "@/lib/wheel-of-henricus";
import HenricusWheelClient from "./HenricusWheelClient";

export const dynamic = "force-dynamic";

export default async function WheelOfHenricusPage() {
  const session = await auth();
  const frame = await getOrCreateActiveFrame(prisma);

  const [spins, eligibleUsers, recentSettled] = await Promise.all([
    prisma.henricusSpin.findMany({
      where: { frameId: frame.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        assignedAlias: true,
        createdAt: true,
        spinner: { select: { id: true, name: true, alias: true, image: true } },
      },
    }),
    prisma.user.findMany({
      where: { alias: { not: null }, excludedFromWheel: false },
      select: { id: true, alias: true, name: true, image: true },
      orderBy: { alias: "asc" },
    }),
    prisma.henricusFrame.findMany({
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
          select: { spinner: { select: { name: true, alias: true } } },
        },
      },
    }),
  ]);

  let userState: {
    isLoggedIn: boolean;
    isAdmin: boolean;
    spinsRemaining: number;
    balance: number;
    userId: string | null;
    displayName: string | null;
  } = {
    isLoggedIn: false,
    isAdmin: false,
    spinsRemaining: 0,
    balance: 0,
    userId: null,
    displayName: null,
  };

  if (session?.user?.id) {
    const userId = session.user.id;
    const [user, mySpins] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { saldoTibiaCoins: true, name: true, alias: true },
      }),
      prisma.henricusSpin.count({
        where: { frameId: frame.id, spinnerUserId: userId },
      }),
    ]);
    userState = {
      isLoggedIn: true,
      isAdmin:
        session.user.role === "ADMIN" || isAdminEmail(session.user.email),
      spinsRemaining: Math.max(0, MAX_SPINS_PER_FRAME - mySpins),
      balance: user?.saldoTibiaCoins ?? 0,
      userId,
      displayName: user?.alias ?? user?.name ?? null,
    };
  }

  const initialState = {
    frame: {
      id: frame.id,
      totalSpinCount: frame.totalSpinCount,
      createdAt: frame.createdAt.toISOString(),
    },
    spins: spins.map((s) => ({
      id: s.id,
      assignedAlias: s.assignedAlias,
      createdAt: s.createdAt.toISOString(),
      spinner: s.spinner,
    })),
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
      settledAt: f.settledAt?.toISOString() ?? null,
      winners: f.spins.map((s) => s.spinner.alias ?? s.spinner.name ?? "Unknown"),
    })),
    user: userState,
  };

  return <HenricusWheelClient initialState={initialState} />;
}
