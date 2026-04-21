import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import SlotsMachine from "@/components/SlotsMachine";

export const dynamic = "force-dynamic";

export default async function SlotsPage() {
  const session = await auth();

  let initialSaldo = { saldoTibiaCoins: 0 };
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { saldoTibiaCoins: true },
    });
    if (user) initialSaldo = user;
  }

  // Public feed: latest 10 spins across all users.
  const initialSpins = await prisma.slotSpin.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      stake: true,
      payout: true,
      multiplier: true,
      symbols: true,
      currency: true,
      createdAt: true,
      user: { select: { name: true, alias: true, image: true } },
    },
  });

  return (
    <SlotsMachine
      isLoggedIn={!!session?.user?.id}
      initialSaldo={initialSaldo}
      initialSpins={initialSpins}
      currentUser={
        session?.user
          ? {
              name: session.user.name ?? null,
              alias:
                (session.user as { alias?: string | null }).alias ?? null,
              image: session.user.image ?? null,
            }
          : null
      }
    />
  );
}
