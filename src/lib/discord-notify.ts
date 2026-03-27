const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "";

function siteLink(label: "view" | "join" | "slip"): string {
  if (!BASE_URL) return "";
  const text =
    label === "join"
      ? "Join the bet"
      : label === "slip"
      ? "View the bet slip"
      : "View the bet";
  return `\n\n${text} on [Banter Boys Bets](${BASE_URL})`;
}

const COLORS = {
  green: 0x57f287,
  orange: 0xfee75c,
  blue: 0x5865f2,
  red: 0xed4245,
};

function displayName(user: {
  name?: string | null;
  alias?: string | null;
}): string {
  return user.alias ?? user.name ?? "Unknown";
}

function pickLabel(pick: string): string {
  if (pick === "HOME") return "1";
  if (pick === "DRAW") return "X";
  if (pick === "AWAY") return "2";
  return pick;
}

function formatCurrency(
  amount: number,
  currency: "GOLD" | "TIBIA_COINS"
): string {
  const label = currency === "TIBIA_COINS" ? "Tibia Coins" : "Gold";
  return `${amount.toLocaleString()} ${label}`;
}

async function sendWebhook(payload: object): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Intentionally swallowed — Discord is non-critical
  }
}

export async function notifyBetCreated(bet: {
  creator: { name?: string | null; alias?: string | null };
  event: { homeTeam: string; awayTeam: string };
  pick: string;
  amount: number;
  odds: number;
  currency: "GOLD" | "TIBIA_COINS";
}): Promise<void> {
  const creator = displayName(bet.creator);
  await sendWebhook({
    embeds: [
      {
        title: "⚔️ New Bet Posted",
        description: `**${creator}** is looking for a challenger. Pick a side and step into the arena.${siteLink("join")}`,
        color: COLORS.orange,
        fields: [
          { name: "🧑 Challenger", value: creator, inline: true },
          {
            name: "🏟️ Event",
            value: `${bet.event.homeTeam} vs ${bet.event.awayTeam}`,
            inline: true,
          },
          { name: "🎯 Pick", value: bet.pick, inline: true },
          {
            name: "💰 Stake",
            value: formatCurrency(bet.amount, bet.currency),
            inline: true,
          },
          { name: "📈 Odds", value: `x${bet.odds.toFixed(2)}`, inline: true },
          {
            name: "💎 Potential Winnings",
            value: formatCurrency(Math.round(bet.amount * bet.odds), bet.currency),
            inline: true,
          },
        ],
        footer: { text: "Banter Boys Betting" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

export async function notifyBetJoined(bet: {
  creator: { name?: string | null; alias?: string | null };
  acceptor: { name?: string | null; alias?: string | null } | null;
  event: { homeTeam: string; awayTeam: string };
  amount: number;
  odds: number;
  currency: "GOLD" | "TIBIA_COINS";
}): Promise<void> {
  const creator = displayName(bet.creator);
  const acceptor = bet.acceptor ? displayName(bet.acceptor) : "Unknown";
  await sendWebhook({
    embeds: [
      {
        title: "🤝 Bet Accepted — It's On!",
        description: `**${acceptor}** has accepted **${creator}**'s challenge. May the better adventurer win.${siteLink("view")}`,
        color: COLORS.blue,
        fields: [
          { name: "⚔️ Challenger", value: creator, inline: true },
          { name: "🛡️ Acceptor", value: acceptor, inline: true },
          {
            name: "🏟️ Event",
            value: `${bet.event.homeTeam} vs ${bet.event.awayTeam}`,
            inline: false,
          },
          {
            name: "💰 Stake Each",
            value: formatCurrency(bet.amount, bet.currency),
            inline: true,
          },
          { name: "📈 Odds", value: `x${bet.odds.toFixed(2)}`, inline: true },
        ],
        footer: { text: "Banter Boys Betting" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

export async function notifyBetCancelled(bet: {
  creator: { name?: string | null; alias?: string | null };
  event: { homeTeam: string; awayTeam: string };
  amount: number;
  currency: "GOLD" | "TIBIA_COINS";
}): Promise<void> {
  const creator = displayName(bet.creator);
  await sendWebhook({
    embeds: [
      {
        title: "🚫 Bet Cancelled",
        description: `**${creator}** has withdrawn their challenge. The bet has been voided and the stake returned.${siteLink("view")}`,
        color: COLORS.red,
        fields: [
          { name: "🧑 Cancelled by", value: creator, inline: true },
          {
            name: "🏟️ Event",
            value: `${bet.event.homeTeam} vs ${bet.event.awayTeam}`,
            inline: true,
          },
          {
            name: "💰 Stake Returned",
            value: formatCurrency(bet.amount, bet.currency),
            inline: true,
          },
        ],
        footer: { text: "Banter Boys Betting" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

export async function notifyBetSettled(
  bet: {
    creator: { name?: string | null; alias?: string | null };
    acceptor: { name?: string | null; alias?: string | null } | null;
    event: {
      homeTeam: string;
      awayTeam: string;
      homeScore: number | null;
      awayScore: number | null;
    };
    pick: string;
    amount: number;
    odds: number;
    currency: "GOLD" | "TIBIA_COINS";
  },
  creatorWon: boolean
): Promise<void> {
  const winner = creatorWon ? bet.creator : (bet.acceptor ?? bet.creator);
  const loser = creatorWon ? (bet.acceptor ?? bet.creator) : bet.creator;
  const payout = bet.amount * bet.odds;
  const score =
    bet.event.homeScore !== null && bet.event.awayScore !== null
      ? ` (${bet.event.homeScore}-${bet.event.awayScore})`
      : "";

  const winnerName = displayName(winner);
  const loserName = displayName(loser);
  const isWin = creatorWon;

  await sendWebhook({
    embeds: [
      {
        title: isWin
          ? `🏆 ${winnerName} Wins the Bet!`
          : `💀 ${winnerName} Wins the Bet!`,
        description: isWin
          ? `The dust has settled. **${winnerName}** called it right and collects the spoils. ${loserName} pays up.${siteLink("view")}`
          : `**${loserName}** did not see this one coming. A worthy lesson in humility — and a lighter coin pouch.${siteLink("view")}`,
        color: isWin ? COLORS.green : COLORS.red,
        fields: [
          { name: "🥇 Winner", value: winnerName, inline: true },
          { name: "💀 Loser", value: loserName, inline: true },
          {
            name: "🏟️ Event",
            value: `${bet.event.homeTeam} vs ${bet.event.awayTeam}${score}`,
            inline: false,
          },
          {
            name: "💰 Payout",
            value: formatCurrency(Math.round(payout), bet.currency),
            inline: true,
          },
        ],
        footer: { text: "Banter Boys Betting" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

export async function notifyTicketCreated(
  ticket: {
    amount: number;
    totalOdds: number;
    potentialPayout: number;
    currency: "GOLD" | "TIBIA_COINS";
    selections: Array<{
      pick: string;
      event: { homeTeam: string; awayTeam: string };
    }>;
  },
  user: { name?: string | null; alias?: string | null }
): Promise<void> {
  const userName = displayName(user);
  const legs = ticket.selections
    .map(
      (s, i) =>
        `\`${i + 1}.\` **${pickLabel(s.pick)}** — ${s.event.homeTeam} vs ${s.event.awayTeam}`
    )
    .join("\n");

  await sendWebhook({
    embeds: [
      {
        title: "🎟️ Bet Slip Placed",
        description: `**${userName}** has locked in a ${ticket.selections.length}-leg bet slip. All legs must hit for the payout.${siteLink("slip")}`,
        color: COLORS.orange,
        fields: [
          { name: "🧑 Player", value: userName, inline: true },
          {
            name: "🔗 Legs",
            value: String(ticket.selections.length),
            inline: true,
          },
          { name: "🎯 Selections", value: legs, inline: false },
          {
            name: "📈 Total Odds",
            value: `x${ticket.totalOdds.toFixed(2)}`,
            inline: true,
          },
          {
            name: "💰 Stake",
            value: formatCurrency(ticket.amount, ticket.currency),
            inline: true,
          },
          {
            name: "💎 Potential Payout",
            value: formatCurrency(
              Math.round(ticket.potentialPayout),
              ticket.currency
            ),
            inline: true,
          },
        ],
        footer: { text: "Banter Boys Betting" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

export async function notifyTicketSettled(
  ticket: {
    amount: number;
    totalOdds: number;
    potentialPayout: number;
    currency: "GOLD" | "TIBIA_COINS";
    user: { name?: string | null; alias?: string | null };
    selections: Array<{
      pick: string;
      result: string;
      event: { homeTeam: string; awayTeam: string };
    }>;
  },
  status: "WON" | "LOST"
): Promise<void> {
  const won = status === "WON";
  const wonCount = ticket.selections.filter((s) => s.result === "WON").length;
  const total = ticket.selections.length;
  const userName = displayName(ticket.user);
  const currencyLabel =
    ticket.currency === "TIBIA_COINS" ? "Tibia Coins" : "Gold";

  let description: string;
  if (won) {
    description = `**${userName}** went ${wonCount}/${total} and cashed out. Every leg landed — a perfect bet slip.`;
  } else if (wonCount === 0) {
    description = `**${userName}** went 0/${total}. Not a single leg survived. The Amulet of Loss weeps.`;
  } else {
    description = `**${userName}** went ${wonCount}/${total}. The slip is broken — no payout today.`;
  }
  description += siteLink("slip");

  await sendWebhook({
    embeds: [
      {
        title: won ? "🎉 Bet Slip Hit — Winner!" : "💀 Bet Slip Busted",
        description,
        color: won ? COLORS.green : COLORS.red,
        fields: [
          { name: "🧑 Player", value: userName, inline: true },
          {
            name: won ? "✅ Legs Correct" : "❌ Legs Correct",
            value: `${wonCount}/${total}`,
            inline: true,
          },
          {
            name: "💰 Stake",
            value: formatCurrency(ticket.amount, ticket.currency),
            inline: true,
          },
          {
            name: won ? "💎 Payout" : "💸 Payout",
            value: won
              ? formatCurrency(
                  Math.round(ticket.potentialPayout),
                  ticket.currency
                )
              : `0 ${currencyLabel}`,
            inline: true,
          },
        ],
        footer: { text: "Banter Boys Betting" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}
