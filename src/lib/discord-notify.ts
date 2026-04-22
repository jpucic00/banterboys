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
  if (pick === "HOME_DRAW") return "1X";
  if (pick === "AWAY_DRAW") return "2X";
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

function pickLabelForEvent(pick: string, homeTeam: string, awayTeam: string): string {
  if (pick === "HOME") return homeTeam;
  if (pick === "AWAY") return awayTeam;
  if (pick === "DRAW") return "Draw";
  if (pick === "HOME_DRAW") return `${homeTeam} or Draw`;
  if (pick === "AWAY_DRAW") return `${awayTeam} or Draw`;
  return pick;
}

export async function notifyBetCreated(bet: {
  creator: { name?: string | null; alias?: string | null };
  event: { homeTeam: string; awayTeam: string };
  pick: string;
  amount: number;
  odds: number;
  joinerPick?: string | null;
  joinerAmount?: number | null;
  currency: "GOLD" | "TIBIA_COINS";
}): Promise<void> {
  const creator = displayName(bet.creator);
  const hasNewStyle = bet.joinerPick && bet.joinerAmount != null;
  const creatorPickLabel = pickLabelForEvent(bet.pick, bet.event.homeTeam, bet.event.awayTeam);

  const fields = hasNewStyle
    ? [
        { name: "🧑 Challenger", value: creator, inline: true },
        {
          name: "🏟️ Event",
          value: `${bet.event.homeTeam} vs ${bet.event.awayTeam}`,
          inline: false,
        },
        {
          name: "🎯 Creator bets on",
          value: `${creatorPickLabel} — ${formatCurrency(bet.amount, bet.currency)}`,
          inline: false,
        },
        {
          name: "🎯 Joiner must bet on",
          value: `${pickLabelForEvent(bet.joinerPick!, bet.event.homeTeam, bet.event.awayTeam)} — ${formatCurrency(bet.joinerAmount!, bet.currency)}`,
          inline: false,
        },
      ]
    : [
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
          name: "💎 Joiner Commitment",
          value: formatCurrency(Math.round(bet.amount * bet.odds), bet.currency),
          inline: true,
        },
      ];

  await sendWebhook({
    embeds: [
      {
        title: "⚔️ New Bet Posted",
        description: `**${creator}** is looking for a challenger. Pick a side and step into the arena.${siteLink("join")}`,
        color: COLORS.orange,
        fields,
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
  pick: string;
  amount: number;
  odds: number;
  joinerPick?: string | null;
  joinerAmount?: number | null;
  currency: "GOLD" | "TIBIA_COINS";
}): Promise<void> {
  const creator = displayName(bet.creator);
  const acceptor = bet.acceptor ? displayName(bet.acceptor) : "Unknown";
  const hasNewStyle = bet.joinerPick && bet.joinerAmount != null;

  const fields = hasNewStyle
    ? [
        { name: "⚔️ Challenger", value: creator, inline: true },
        { name: "🛡️ Acceptor", value: acceptor, inline: true },
        {
          name: "🏟️ Event",
          value: `${bet.event.homeTeam} vs ${bet.event.awayTeam}`,
          inline: false,
        },
        {
          name: "🎯 " + creator,
          value: `${pickLabelForEvent(bet.pick, bet.event.homeTeam, bet.event.awayTeam)} — ${formatCurrency(bet.amount, bet.currency)}`,
          inline: true,
        },
        {
          name: "🎯 " + acceptor,
          value: `${pickLabelForEvent(bet.joinerPick!, bet.event.homeTeam, bet.event.awayTeam)} — ${formatCurrency(bet.joinerAmount!, bet.currency)}`,
          inline: true,
        },
      ]
    : [
        { name: "⚔️ Challenger", value: creator, inline: true },
        { name: "🛡️ Acceptor", value: acceptor, inline: true },
        {
          name: "🏟️ Event",
          value: `${bet.event.homeTeam} vs ${bet.event.awayTeam}`,
          inline: false,
        },
        {
          name: "💰 Creator Staked",
          value: formatCurrency(bet.amount, bet.currency),
          inline: true,
        },
        {
          name: "💎 Joiner Committed",
          value: formatCurrency(Math.round(bet.amount * bet.odds), bet.currency),
          inline: true,
        },
        { name: "📈 Odds", value: `x${bet.odds.toFixed(2)}`, inline: true },
      ];

  await sendWebhook({
    embeds: [
      {
        title: "🤝 Bet Accepted — It's On!",
        description: `**${acceptor}** has accepted **${creator}**'s challenge. May the better adventurer win.${siteLink("view")}`,
        color: COLORS.blue,
        fields,
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
    joinerPick?: string | null;
    joinerAmount?: number | null;
    currency: "GOLD" | "TIBIA_COINS";
  },
  creatorWon: boolean
): Promise<void> {
  const winner = creatorWon ? bet.creator : (bet.acceptor ?? bet.creator);
  const loser = creatorWon ? (bet.acceptor ?? bet.creator) : bet.creator;
  const payout = bet.joinerAmount != null
    ? (creatorWon ? bet.joinerAmount : bet.amount)
    : bet.amount * bet.odds;
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

export async function notifyBetVoided(bet: {
  creator: { name?: string | null; alias?: string | null };
  acceptor: { name?: string | null; alias?: string | null } | null;
  event: {
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
  };
  pick: string;
  joinerPick?: string | null;
  currency: "GOLD" | "TIBIA_COINS";
}): Promise<void> {
  const creator = displayName(bet.creator);
  const acceptor = bet.acceptor ? displayName(bet.acceptor) : "Unknown";
  const score =
    bet.event.homeScore !== null && bet.event.awayScore !== null
      ? ` (${bet.event.homeScore}-${bet.event.awayScore})`
      : "";

  await sendWebhook({
    embeds: [
      {
        title: "⚖️ Bet Voided — No Winner",
        description: `Neither **${creator}** nor **${acceptor}** called it right. No gold changes hands.${siteLink("view")}`,
        color: COLORS.orange,
        fields: [
          { name: "⚔️ Challenger", value: creator, inline: true },
          { name: "🛡️ Acceptor", value: acceptor, inline: true },
          {
            name: "🏟️ Event",
            value: `${bet.event.homeTeam} vs ${bet.event.awayTeam}${score}`,
            inline: false,
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

export async function notifyTicketCancelled(ticket: {
  amount: number;
  currency: "GOLD" | "TIBIA_COINS";
  user: { name?: string | null; alias?: string | null };
  selections: Array<{
    pick: string;
    event: { homeTeam: string; awayTeam: string };
  }>;
}): Promise<void> {
  const userName = displayName(ticket.user);
  const legs = ticket.selections
    .map(
      (s, i) =>
        `\`${i + 1}.\` **${pickLabel(s.pick)}** — ${s.event.homeTeam} vs ${s.event.awayTeam}`
    )
    .join("\n");

  await sendWebhook({
    embeds: [
      {
        title: "🚫 Bet Slip Cancelled",
        description: `**${userName}**'s bet slip has been cancelled by an admin. The stake has been refunded.${siteLink("slip")}`,
        color: COLORS.red,
        fields: [
          { name: "🧑 Player", value: userName, inline: true },
          {
            name: "🔗 Legs",
            value: String(ticket.selections.length),
            inline: true,
          },
          {
            name: "💰 Stake Returned",
            value: formatCurrency(ticket.amount, ticket.currency),
            inline: true,
          },
          { name: "🎯 Selections", value: legs, inline: false },
        ],
        footer: { text: "Banter Boys Betting" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

type SaldoUser = {
  alias: string | null;
  discordId: string | null;
  saldoGold: number;
  saldoTibiaCoins: number;
};

function formatSaldoLine(u: SaldoUser, sign: "pos" | "neg"): string {
  const tag = u.discordId ? `<@${u.discordId}>` : `**${u.alias ?? "Unknown"}**`;
  const gold = sign === "pos" ? Math.max(u.saldoGold, 0) : Math.min(u.saldoGold, 0);
  const tc = sign === "pos" ? Math.max(u.saldoTibiaCoins, 0) : Math.min(u.saldoTibiaCoins, 0);
  const parts: string[] = [];
  if (gold !== 0) parts.push(`${Math.round(Math.abs(gold)).toLocaleString()} gp`);
  if (tc !== 0) parts.push(`${Math.round(Math.abs(tc)).toLocaleString()} TC`);
  return `${tag} — ${parts.join(", ")}`;
}

export async function notifySaldoSummary(users: SaldoUser[]): Promise<void> {
  const houseOwes = users.filter((u) => u.saldoGold > 0 || u.saldoTibiaCoins > 0);
  const owesHouse = users.filter((u) => u.saldoGold < 0 || u.saldoTibiaCoins < 0);

  if (houseOwes.length === 0 && owesHouse.length === 0) return;

  const sections: string[] = [];
  if (owesHouse.length) {
    const lines = owesHouse.map((u) => formatSaldoLine(u, "neg")).join("\n");
    sections.push(`💰 **Owed to the House** — please transfer to a house admin\n${lines}`);
  }
  if (houseOwes.length) {
    const lines = houseOwes.map((u) => formatSaldoLine(u, "pos")).join("\n");
    sections.push(`💸 **Owed by the House** — a house admin will transfer to you\n${lines}`);
  }

  const userIds = users
    .map((u) => u.discordId)
    .filter((id): id is string => !!id);

  await sendWebhook({
    content: `🧾 **Balance Summary**\n\n${sections.join("\n\n")}`,
    allowed_mentions: { parse: [], users: userIds },
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
      event: {
        homeTeam: string;
        awayTeam: string;
        homeScore: number | null;
        awayScore: number | null;
      };
    }>;
  },
  status: "WON" | "LOST"
): Promise<void> {
  const won = status === "WON";
  const userName = displayName(ticket.user);
  const currencyLabel = ticket.currency === "TIBIA_COINS" ? "Tibia Coins" : "Gold";

  let description: string;
  let fields: object[];

  if (won) {
    const total = ticket.selections.length;
    description = `**${userName}** hit all ${total} leg${total > 1 ? "s" : ""} and cashed out. A perfect bet slip.${siteLink("slip")}`;
    fields = [
      { name: "🧑 Player", value: userName, inline: true },
      { name: "🔗 Legs", value: String(total), inline: true },
      { name: "💰 Stake", value: formatCurrency(ticket.amount, ticket.currency), inline: true },
      { name: "💎 Payout", value: formatCurrency(Math.round(ticket.potentialPayout), ticket.currency), inline: true },
    ];
  } else {
    const bustSel = ticket.selections.find((s) => s.result === "LOST");
    const bustMatch = bustSel
      ? `${bustSel.event.homeTeam} vs ${bustSel.event.awayTeam}`
      : "Unknown match";
    const bustScore =
      bustSel && bustSel.event.homeScore !== null && bustSel.event.awayScore !== null
        ? ` (${bustSel.event.homeScore}–${bustSel.event.awayScore})`
        : "";
    const bustPick = bustSel ? pickLabelForEvent(bustSel.pick, bustSel.event.homeTeam, bustSel.event.awayTeam) : "";

    description = `**${userName}**'s slip is dead. The Amulet of Loss weeps.${siteLink("slip")}`;
    fields = [
      { name: "🧑 Player", value: userName, inline: true },
      { name: "💰 Stake Lost", value: formatCurrency(ticket.amount, ticket.currency), inline: true },
      {
        name: "💀 Busted by",
        value: `${bustMatch}${bustScore}\nPick: **${bustPick}**`,
        inline: false,
      },
    ];
  }

  await sendWebhook({
    embeds: [
      {
        title: won ? "🎉 Bet Slip Hit — Winner!" : "💀 Bet Slip Busted",
        description,
        color: won ? COLORS.green : COLORS.red,
        fields,
        footer: { text: "Banter Boys Betting" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

const SLOT_SYMBOL_LABELS: Record<string, string> = {
  snake: "Snake",
  dragon_lord: "Dragon Lord",
  dragon: "Dragon",
  dark_torturer: "Dark Torturer",
  demon: "Demon",
  ferumbras: "Ferumbras",
  joker: "Jester Doll",
};

export async function notifySlotWin(spin: {
  user: { name: string | null; alias: string | null };
  stake: number;
  payout: number;
  multiplier: number;
  currency: "GOLD" | "TIBIA_COINS";
  symbols: readonly string[];
  bonusTrigger?: boolean;
  isFreeSpin?: boolean;
}): Promise<void> {
  const player = displayName(spin.user);
  const symbolLine = spin.symbols
    .map((s) => SLOT_SYMBOL_LABELS[s] ?? s)
    .join(" | ");
  const isJackpot = spin.symbols.every((s) => s === "ferumbras");

  let title: string;
  let description: string;
  let color: number;
  if (spin.bonusTrigger) {
    title = `🃏 Jester Strike — ${player} triggered the bonus!`;
    description = `Three Jester Dolls! **${player}** just won 10 free spins at ×2 wins on the Tibia Slots.${siteLink(
      "view"
    )}`;
    color = COLORS.orange;
  } else if (isJackpot) {
    title = `👑 JACKPOT — ${player} landed 3× Ferumbras!`;
    description = `The Mage King smiles. **${player}** just hit the jackpot on the Tibia Slots.${siteLink(
      "view"
    )}`;
    color = COLORS.orange;
  } else {
    title = spin.isFreeSpin
      ? `🎰 Big Free-Spin Win — ${player}`
      : `🎰 Big Slot Win — ${player}`;
    description = `**${player}** hit a ×${spin.multiplier} multiplier on the Tibia Slots${
      spin.isFreeSpin ? " during a bonus round" : ""
    }.${siteLink("view")}`;
    color = COLORS.green;
  }

  const stakeLabel = spin.isFreeSpin ? "💰 Stake (free spin)" : "💰 Stake";
  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "🧑 Player", value: player, inline: true },
    { name: "🎯 Reels", value: symbolLine, inline: false },
    {
      name: stakeLabel,
      value: formatCurrency(spin.stake, spin.currency),
      inline: true,
    },
  ];
  if (!spin.bonusTrigger) {
    fields.push(
      { name: "📈 Multiplier", value: `×${spin.multiplier}`, inline: true },
      {
        name: "💎 Payout",
        value: formatCurrency(Math.round(spin.payout), spin.currency),
        inline: true,
      }
    );
  } else {
    fields.push({ name: "🎁 Bonus", value: "10 free spins", inline: true });
  }

  await sendWebhook({
    embeds: [
      {
        title,
        description,
        color,
        fields,
        footer: { text: "Banter Boys Betting" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}
