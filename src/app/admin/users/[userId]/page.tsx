import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import ProfileStatsView from "@/components/ProfileStatsView";

export const dynamic = "force-dynamic";

export default async function AdminUserProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await auth();
  if (!isAdminEmail(session?.user?.email)) {
    redirect("/");
  }

  const { userId } = await params;

  const [user, tickets, pvpBets] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        alias: true,
        name: true,
        image: true,
        saldoGold: true,
        saldoTibiaCoins: true,
      },
    }),
    prisma.ticket.findMany({
      where: { userId },
      select: {
        status: true,
        amount: true,
        potentialPayout: true,
        currency: true,
      },
    }),
    prisma.pvPBet.findMany({
      where: { OR: [{ creatorId: userId }, { acceptorId: userId }] },
      select: {
        status: true,
        amount: true,
        joinerAmount: true,
        currency: true,
        creatorId: true,
        acceptorId: true,
      },
    }),
  ]);

  if (!user) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/admin?tab=balances"
        className="inline-block text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        ← Back to Balances
      </Link>
      <ProfileStatsView
        user={user}
        tickets={tickets}
        pvpBets={pvpBets}
        userId={userId}
        subtitle="Player betting stats"
        showSelfLinks={false}
      />
    </div>
  );
}
