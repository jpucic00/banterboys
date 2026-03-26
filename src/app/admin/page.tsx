import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  const [wonTickets, lostTickets, pendingTickets, totalUsers, activeEvents] =
    await Promise.all([
      prisma.ticket.findMany({ where: { status: "WON" } }),
      prisma.ticket.findMany({ where: { status: "LOST" } }),
      prisma.ticket.findMany({ where: { status: "PENDING" } }),
      prisma.user.count(),
      prisma.event.count({
        where: { status: { in: ["UPCOMING", "LIVE"] } },
      }),
    ]);

  // House P&L: house loses when tickets win, gains when they lose
  const houseLosses = wonTickets.reduce(
    (sum, t) => sum + (t.potentialPayout - t.amount),
    0
  );
  const houseGains = lostTickets.reduce((sum, t) => sum + t.amount, 0);
  const houseProfit = houseGains - houseLosses;

  const pendingExposure = pendingTickets.reduce(
    (sum, t) => sum + (t.potentialPayout - t.amount),
    0
  );
  const pendingStakes = pendingTickets.reduce((sum, t) => sum + t.amount, 0);

  const totalVolume =
    wonTickets.reduce((s, t) => s + t.amount, 0) +
    lostTickets.reduce((s, t) => s + t.amount, 0) +
    pendingTickets.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="House Profit"
          value={`${houseProfit >= 0 ? "+" : ""}${houseProfit.toLocaleString()} gp`}
          color={houseProfit >= 0 ? "text-win" : "text-loss"}
        />
        <StatCard
          label="Pending Exposure"
          value={`${pendingExposure.toLocaleString()} gp`}
          color="text-gold"
        />
        <StatCard
          label="Total Volume"
          value={`${totalVolume.toLocaleString()} gp`}
          color="text-text-primary"
        />
        <StatCard
          label="Active Users"
          value={String(totalUsers)}
          color="text-text-primary"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Won Slips (House Loss)"
          value={String(wonTickets.length)}
          color="text-loss"
        />
        <StatCard
          label="Lost Slips (House Win)"
          value={String(lostTickets.length)}
          color="text-win"
        />
        <StatCard
          label="Pending Slips"
          value={String(pendingTickets.length)}
          color="text-gold"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="Active Events"
          value={String(activeEvents)}
          color="text-tibia-green"
        />
        <StatCard
          label="Pending Stakes"
          value={`${pendingStakes.toLocaleString()} gp`}
          color="text-text-muted"
        />
      </div>

      {/* Void controls */}
      <div className="rounded-2xl border border-border-light/50 p-4">
        <h2 className="text-lg font-medium text-text-primary mb-4">
          Recent Pending Slips
        </h2>
        {pendingTickets.length === 0 ? (
          <p className="text-text-muted text-sm">No pending tickets.</p>
        ) : (
          <div className="space-y-2">
            {pendingTickets.slice(0, 10).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between text-sm bg-bg-primary rounded-lg px-3 py-2"
              >
                <span className="text-text-muted">
                  Slip {t.id.slice(0, 8)}...
                </span>
                <span className="text-text-primary">
                  {t.amount.toLocaleString()} gp &rarr;{" "}
                  {t.potentialPayout.toLocaleString()} gp
                </span>
                <span className="text-gold text-xs">
                  {t.totalOdds.toFixed(2)}x
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-border-light/50 p-4">
      <div className="text-xs text-text-muted uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
