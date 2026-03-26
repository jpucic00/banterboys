import { prisma } from "@/lib/db";
import { CoinAmount } from "@/components/CoinIcon";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const [pvpBets, tickets] = await Promise.all([
    prisma.pvPBet.findMany({
      where: {
        status: { in: ["WON_CREATOR", "WON_ACCEPTOR", "CANCELLED", "VOID"] },
      },
      include: {
        creator: { select: { name: true, image: true } },
        acceptor: { select: { name: true, image: true } },
        event: { include: { sport: true } },
      },
      orderBy: { settledAt: "desc" },
      take: 50,
    }),
    prisma.ticket.findMany({
      where: { status: { in: ["WON", "LOST", "VOID"] } },
      include: {
        user: { select: { name: true, image: true } },
        selections: {
          include: { event: { include: { sport: true } } },
        },
      },
      orderBy: { settledAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-white">Bet History</h1>

      {/* PvP History */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-text-primary">PvP Bets</h2>
        {pvpBets.length === 0 && (
          <p className="text-text-muted text-sm">No settled PvP bets yet.</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted text-left">
                <th className="pb-2 pr-4">Match</th>
                <th className="pb-2 pr-4">Creator</th>
                <th className="pb-2 pr-4">Acceptor</th>
                <th className="pb-2 pr-4">Pick</th>
                <th className="pb-2 pr-4">Amount</th>
                <th className="pb-2 pr-4">Odds</th>
                <th className="pb-2">Result</th>
              </tr>
            </thead>
            <tbody>
              {pvpBets.map((bet) => (
                <tr key={bet.id} className="border-b border-border/30">
                  <td className="py-3 pr-4 text-text-primary">
                    {bet.event.homeTeam} vs {bet.event.awayTeam}
                  </td>
                  <td className="py-3 pr-4 text-text-muted">
                    {bet.creator.name}
                  </td>
                  <td className="py-3 pr-4 text-text-muted">
                    {bet.acceptor?.name ?? "-"}
                  </td>
                  <td className="py-3 pr-4 text-gold">
                    {bet.pick === "HOME"
                      ? bet.event.homeTeam
                      : bet.pick === "AWAY"
                        ? bet.event.awayTeam
                        : "Draw"}
                  </td>
                  <td className="py-3 pr-4 text-text-primary">
                    <CoinAmount amount={bet.amount} currency={bet.currency} />
                  </td>
                  <td className="py-3 pr-4 text-tibia-green">
                    {bet.odds.toFixed(2)}
                  </td>
                  <td
                    className={`py-3 font-medium ${
                      bet.status === "WON_CREATOR" || bet.status === "WON_ACCEPTOR"
                        ? "text-win"
                        : "text-text-muted"
                    }`}
                  >
                    {bet.status === "WON_CREATOR"
                      ? `${bet.creator.name} won`
                      : bet.status === "WON_ACCEPTOR"
                        ? `${bet.acceptor?.name} won`
                        : bet.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ticket History */}
      <div className="space-y-4">
        <h2 className="text-lg font-medium text-text-primary">Bet Slips</h2>
        {tickets.length === 0 && (
          <p className="text-text-muted text-sm">No settled tickets yet.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="rounded-2xl border border-border-light/50 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-text-muted text-xs">
                  {ticket.user.name} &middot;{" "}
                  {ticket.settledAt
                    ? new Date(ticket.settledAt).toLocaleDateString()
                    : ""}
                </span>
                <span
                  className={`text-xs font-medium ${
                    ticket.status === "WON"
                      ? "text-win"
                      : ticket.status === "LOST"
                        ? "text-loss"
                        : "text-text-muted"
                  }`}
                >
                  {ticket.status}
                </span>
              </div>
              <div className="space-y-1">
                {ticket.selections.map(
                  (sel: {
                    id: string;
                    pick: string;
                    odds: number;
                    result: string;
                    event: {
                      homeTeam: string;
                      awayTeam: string;
                    };
                  }) => (
                    <div
                      key={sel.id}
                      className="flex justify-between text-sm"
                    >
                      <span className="text-text-muted">
                        {sel.event.homeTeam} vs {sel.event.awayTeam} &rarr;{" "}
                        <span className="text-gold">
                          {sel.pick === "HOME"
                            ? sel.event.homeTeam
                            : sel.pick === "AWAY"
                              ? sel.event.awayTeam
                              : "Draw"}
                        </span>
                      </span>
                      <span
                        className={
                          sel.result === "WON"
                            ? "text-win"
                            : sel.result === "LOST"
                              ? "text-loss"
                              : "text-text-muted"
                        }
                      >
                        {sel.odds.toFixed(2)} {sel.result === "WON" ? "✓" : sel.result === "LOST" ? "✗" : ""}
                      </span>
                    </div>
                  )
                )}
              </div>
              <div className="flex justify-between text-sm border-t border-border pt-2">
                <span className="text-text-muted">
                  Stake: <CoinAmount amount={ticket.amount} currency={ticket.currency} />
                </span>
                <span className="text-gold font-medium">
                  Payout: <CoinAmount amount={ticket.potentialPayout} currency={ticket.currency} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
