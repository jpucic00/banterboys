export type UserTicketRow = {
  status: string;
  amount: number;
  potentialPayout: number;
  currency: string;
};

export type UserPvpRow = {
  status: string;
  amount: number;
  joinerAmount: number | null;
  currency: string;
  creatorId: string;
  acceptorId: string | null;
};

export type UserTicketStats = {
  netProfit: number;
  netWinnings: number;
  grossWinnings: number;
  grossLosses: number;
  pendingStakes: number;
  pendingPotentialPayout: number;
  winRate: number | null;
  counts: { won: number; lost: number; pending: number; void: number; total: number };
};

export type UserPvpStats = {
  netProfit: number;
  pendingStakes: number;
  counts: {
    open: number;
    matched: number;
    won: number;
    lost: number;
    void: number;
    cancelled: number;
    total: number;
  };
};

export function calcUserTicketStats(tickets: UserTicketRow[]): UserTicketStats {
  const won = tickets.filter((t) => t.status === "WON");
  const lost = tickets.filter((t) => t.status === "LOST");
  const pending = tickets.filter((t) => t.status === "PENDING");
  const voided = tickets.filter((t) => t.status === "VOID");

  const grossWinnings = won.reduce((s, t) => s + t.potentialPayout, 0);
  const grossLosses = lost.reduce((s, t) => s + t.amount, 0);
  const netWinProfit = won.reduce((s, t) => s + (t.potentialPayout - t.amount), 0);
  const netProfit = netWinProfit - grossLosses;
  const pendingStakes = pending.reduce((s, t) => s + t.amount, 0);
  const pendingPotentialPayout = pending.reduce((s, t) => s + t.potentialPayout, 0);
  const settled = won.length + lost.length;
  const winRate = settled > 0 ? (won.length / settled) * 100 : null;

  return {
    netProfit,
    netWinnings: netWinProfit,
    grossWinnings,
    grossLosses,
    pendingStakes,
    pendingPotentialPayout,
    winRate,
    counts: {
      won: won.length,
      lost: lost.length,
      pending: pending.length,
      void: voided.length,
      total: tickets.length,
    },
  };
}

export function calcUserPvpStats(bets: UserPvpRow[], userId: string): UserPvpStats {
  let netProfit = 0;
  let pendingStakes = 0;
  let open = 0;
  let matched = 0;
  let won = 0;
  let lost = 0;
  let voided = 0;
  let cancelled = 0;

  for (const b of bets) {
    const isCreator = b.creatorId === userId;
    const isAcceptor = b.acceptorId === userId;
    if (!isCreator && !isAcceptor) continue;

    const ownStake = isCreator ? b.amount : b.joinerAmount ?? 0;
    const otherStake = isCreator ? b.joinerAmount ?? 0 : b.amount;

    switch (b.status) {
      case "OPEN":
        open += 1;
        if (isCreator) pendingStakes += ownStake;
        break;
      case "MATCHED":
        matched += 1;
        pendingStakes += ownStake;
        break;
      case "WON_CREATOR":
        if (isCreator) {
          won += 1;
          netProfit += otherStake;
        } else {
          lost += 1;
          netProfit -= ownStake;
        }
        break;
      case "WON_ACCEPTOR":
        if (isAcceptor) {
          won += 1;
          netProfit += otherStake;
        } else {
          lost += 1;
          netProfit -= ownStake;
        }
        break;
      case "VOID":
        voided += 1;
        break;
      case "CANCELLED":
        cancelled += 1;
        break;
    }
  }

  return {
    netProfit,
    pendingStakes,
    counts: { open, matched, won, lost, void: voided, cancelled, total: bets.length },
  };
}
