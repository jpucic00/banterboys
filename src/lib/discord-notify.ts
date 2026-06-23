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
  const tag =
    (payload as { embeds?: { title?: string }[] })?.embeds?.[0]?.title ??
    "(no title)";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[discord-notify] ${tag} → HTTP ${res.status} ${body.slice(0, 500)}`
      );
    }
  } catch (err) {
    console.error(`[discord-notify] ${tag} → fetch failed`, err);
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

export async function notifyHenricusChampionSelected(p: {
  spinnerDisplayName: string;
  spinnerDiscordId: string | null;
  championDisplayName: string;
  championDiscordId: string | null;
  championAlias: string;
}): Promise<void> {
  const spinnerTag = p.spinnerDiscordId
    ? `<@${p.spinnerDiscordId}>`
    : `**${p.spinnerDisplayName}**`;
  const championTag = p.championDiscordId
    ? `<@${p.championDiscordId}>`
    : `**${p.championDisplayName}**`;

  const allowedUserIds = [p.championDiscordId, p.spinnerDiscordId].filter(
    (id): id is string => !!id
  );

  await sendWebhook({
    content: `🎡 ${spinnerTag} spun the Wheel of Henricus — and it points at ${championTag} (**${p.championAlias}**). Watch your step, the wheel hungers.`,
    allowed_mentions: { parse: [], users: allowedUserIds },
  });
}

export async function notifyHenricusSettled(p: {
  winners: { displayName: string; discordId: string | null }[];
  deadAlias: string;
  deadDisplay: string;
  deadDiscordId: string | null;
  deathLevel: number;
  deathReason: string;
  totalPayout: number;
  frameSpinCount: number;
}): Promise<void> {
  const winnerTags = p.winners
    .map((w) => (w.discordId ? `<@${w.discordId}>` : `**${w.displayName}**`))
    .join(", ");
  const deadTag = p.deadDiscordId
    ? `<@${p.deadDiscordId}>`
    : `**${p.deadDisplay}**`;

  const noWinners = p.winners.length === 0;
  const description = noWinners
    ? `💀 **${p.deadAlias}** has died at level ${p.deathLevel} to ${p.deathReason}. ${deadTag} was nobody's champion this round — and the Wheel of Henricus took its victim anyway. The house keeps the pot.`
    : p.winners.length === 1
      ? `**${p.deadAlias}** died at level ${p.deathLevel} to ${p.deathReason}. The wheel called it. ${winnerTags} read it right and the house pays out **${p.totalPayout.toLocaleString()} TC**. ${deadTag}, condolences — Henricus has your blessing on standby.`
      : `**${p.deadAlias}** died at level ${p.deathLevel} to ${p.deathReason}. The wheel called it — and ${p.winners.length} spinners saw it coming. ${winnerTags} each collect **500 TC** from the house's purse. ${deadTag}, condolences — Henricus has your blessing on standby.`;

  const allowedUserIds = [
    ...p.winners.map((w) => w.discordId).filter((id): id is string => !!id),
    ...(p.deadDiscordId ? [p.deadDiscordId] : []),
  ];

  const fields: { name: string; value: string; inline: boolean }[] = [
    { name: "💀 Fallen", value: `${p.deadAlias} (lvl ${p.deathLevel})`, inline: true },
    { name: "🎯 Cause", value: p.deathReason || "Unknown", inline: true },
    { name: "🎰 Spins this round", value: String(p.frameSpinCount), inline: true },
  ];
  if (noWinners) {
    fields.push({
      name: "🏠 Outcome",
      value: "No champion — house keeps the pot",
      inline: false,
    });
  } else {
    fields.push(
      {
        name: p.winners.length === 1 ? "🏆 Winner" : `🏆 Winners (${p.winners.length})`,
        value: p.winners.map((w) => w.displayName).join(", "),
        inline: false,
      },
      {
        name: "💰 House paid out",
        value: `${p.totalPayout.toLocaleString()} TC`,
        inline: true,
      }
    );
  }

  await sendWebhook({
    content: description,
    embeds: [
      {
        title: noWinners
          ? "💀 The Wheel of Henricus claims a stray"
          : "💀 The Wheel of Henricus has spoken",
        color: noWinners ? COLORS.red : COLORS.green,
        fields,
        footer: { text: "Wheel of Henricus" },
        timestamp: new Date().toISOString(),
      },
    ],
    allowed_mentions: { parse: [], users: allowedUserIds },
  });
}

const SLOT_SYMBOL_LABELS: Record<string, string> = {
  snake: "Snake",
  dragon_lord: "Dragon Lord",
  dragon: "Dragon",
  dark_torturer: "Dark Torturer",
  demon: "Demon",
  ferumbras: "Ferumbras",
  joker: "Foulsy",
};

export async function notifySlotWin(spin: {
  user: { name: string | null; alias: string | null };
  stake: number;
  payout: number;
  multiplier: number;
  currency: "GOLD" | "TIBIA_COINS";
  symbols: readonly string[];
  wildUsed?: boolean;
}): Promise<void> {
  const player = displayName(spin.user);
  const symbolLine = spin.symbols
    .map((s) => SLOT_SYMBOL_LABELS[s] ?? s)
    .join(" | ");
  const isJackpot = spin.symbols.every((s) => s === "ferumbras");
  const isTripleJester = spin.symbols.every((s) => s === "joker");

  let title: string;
  let description: string;
  let color: number;
  if (isJackpot) {
    title = `👑 JACKPOT — ${player} landed 3× Ferumbras!`;
    description = `The Mage King smiles. **${player}** just hit the jackpot on the Tibia Slots.${siteLink(
      "view"
    )}`;
    color = COLORS.orange;
  } else if (isTripleJester) {
    title = `🃏 Triple Foulsy — ${player} aligned three Foulsies!`;
    description = `Three Foulsies in a row — pays the Demon Triple. **${player}** hit ×${spin.multiplier} on the Tibia Slots.${siteLink(
      "view"
    )}`;
    color = COLORS.orange;
  } else {
    title = `🎰 Big Slot Win — ${player}`;
    description = `**${player}** hit a ×${spin.multiplier} multiplier${
      spin.wildUsed ? " (Foulsy wild)" : ""
    } on the Tibia Slots.${siteLink("view")}`;
    color = COLORS.green;
  }

  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "🧑 Player", value: player, inline: true },
    { name: "🎯 Reels", value: symbolLine, inline: false },
    {
      name: "💰 Stake",
      value: formatCurrency(spin.stake, spin.currency),
      inline: true,
    },
    { name: "📈 Multiplier", value: `×${spin.multiplier}`, inline: true },
    {
      name: "💎 Payout",
      value: formatCurrency(Math.round(spin.payout), spin.currency),
      inline: true,
    },
  ];

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

// Gold formatted the way the guild talks about it: 20000000 -> "20kk".
function formatGoldShort(amount: number): string {
  if (amount >= 1_000_000) return `${parseFloat((amount / 1_000_000).toFixed(2))}kk`;
  if (amount >= 1_000) return `${parseFloat((amount / 1_000).toFixed(2))}k`;
  return `${amount}`;
}

export async function notifySongContestCreated(p: {
  title: string;
  prizeFirst: number;
  prizeSecond: number;
  prizeLuckyVoter: number;
}): Promise<void> {
  const link = BASE_URL ? `\n\n[Enter the contest on Banter Boys](${BASE_URL}/song-contest)` : "";
  await sendWebhook({
    content: `🎤 **${p.title}** is now open! Submit your song and vote for your favourite.${link}`,
    embeds: [
      {
        title: `🎤 ${p.title}`,
        description: "Submit a song about the Banter Boys, then listen to every entry and cast your votes. Full rules are on the site.",
        color: COLORS.blue,
        fields: [
          { name: "🥇 1st place", value: `${formatGoldShort(p.prizeFirst)} gold`, inline: true },
          { name: "🥈 2nd place", value: `${formatGoldShort(p.prizeSecond)} gold`, inline: true },
          { name: "🍀 Lucky voter", value: `${formatGoldShort(p.prizeLuckyVoter)} gold`, inline: true },
        ],
        footer: { text: "Banter Boys Song Contest" },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

export async function notifySongContestClosed(p: {
  title: string;
  winner: { displayName: string; discordId: string | null; songTitle: string; upVotes: number; downVotes: number } | null;
  runnerUp: { displayName: string; discordId: string | null; songTitle: string; upVotes: number; downVotes: number } | null;
  luckyVoter: { displayName: string; discordId: string | null } | null;
  prizeFirst: number;
  prizeSecond: number;
  prizeLuckyVoter: number;
  totalSubmissions: number;
  totalVotes: number;
}): Promise<void> {
  const tag = (x: { displayName: string; discordId: string | null }) =>
    x.discordId ? `<@${x.discordId}>` : `**${x.displayName}**`;

  const description = p.winner
    ? `🏆 The votes are in! ${tag(p.winner)} wins **${p.title}** with *${p.winner.songTitle}* (${p.winner.upVotes}👍 / ${p.winner.downVotes}👎). Prizes are paid in-game by the house.`
    : `**${p.title}** has closed, but no votes were cast — no winner this time.`;

  const fields: { name: string; value: string; inline: boolean }[] = [];
  if (p.winner) {
    fields.push({
      name: "🥇 Winner",
      value: `${p.winner.displayName} — *${p.winner.songTitle}* · ${formatGoldShort(p.prizeFirst)} gold`,
      inline: false,
    });
  }
  if (p.runnerUp) {
    fields.push({
      name: "🥈 Runner-up",
      value: `${p.runnerUp.displayName} — *${p.runnerUp.songTitle}* · ${formatGoldShort(p.prizeSecond)} gold`,
      inline: false,
    });
  }
  if (p.luckyVoter) {
    fields.push({
      name: "🍀 Lucky voter",
      value: `${p.luckyVoter.displayName} · ${formatGoldShort(p.prizeLuckyVoter)} gold`,
      inline: false,
    });
  }
  fields.push({
    name: "📊 Turnout",
    value: `${p.totalSubmissions} submission${p.totalSubmissions === 1 ? "" : "s"} · ${p.totalVotes} vote${p.totalVotes === 1 ? "" : "s"}`,
    inline: false,
  });

  const allowedUserIds = [p.winner?.discordId, p.runnerUp?.discordId, p.luckyVoter?.discordId].filter(
    (id): id is string => !!id
  );

  await sendWebhook({
    content: description,
    embeds: [
      {
        title: `🏆 ${p.title} — Results`,
        color: COLORS.green,
        fields,
        footer: { text: "Banter Boys Song Contest · prizes paid in-game" },
        timestamp: new Date().toISOString(),
      },
    ],
    allowed_mentions: { parse: [], users: allowedUserIds },
  });
}

export async function notifySongSubmission(p: {
  submitterDisplayName: string;
  submitterDiscordId: string | null;
  songTitle: string;
  contestTitle: string;
}): Promise<void> {
  const who = p.submitterDiscordId
    ? `<@${p.submitterDiscordId}>`
    : `**${p.submitterDisplayName}**`;
  const link = BASE_URL ? `\n\n[Listen & vote on Banter Boys](${BASE_URL}/song-contest)` : "";
  await sendWebhook({
    content: `🎵 ${who} submitted **“${p.songTitle}”** to **${p.contestTitle}**.${link}`,
    // Render the mention without pinging the submitter for their own entry.
    allowed_mentions: { parse: [], users: [] },
  });
}

export async function notifySongVotingOpen(p: {
  contestTitle: string;
  submissionCount: number;
}): Promise<void> {
  const link = BASE_URL ? `\n\n[Go listen & vote](${BASE_URL}/song-contest)` : "";
  await sendWebhook({
    content: `🗳️ **Voting is now open** for **${p.contestTitle}**! ${p.submissionCount} songs are in — listen to them all and cast your vote.${link}`,
  });
}

export async function notifySongVote(p: {
  voterDisplayName: string;
  voterDiscordId: string | null;
  direction: "UP" | "DOWN";
  songTitle: string;
  submitterDisplayName: string;
  contestTitle: string;
}): Promise<void> {
  const who = p.voterDiscordId ? `<@${p.voterDiscordId}>` : `**${p.voterDisplayName}**`;
  const icon = p.direction === "UP" ? "👍" : "👎";
  const verb = p.direction === "UP" ? "upvoted" : "downvoted";
  await sendWebhook({
    content: `${icon} ${who} ${verb} **“${p.songTitle}”** by ${p.submitterDisplayName} in **${p.contestTitle}**.`,
    // Render the voter mention without pinging anyone.
    allowed_mentions: { parse: [], users: [] },
  });
}
