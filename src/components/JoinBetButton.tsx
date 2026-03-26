"use client";

import { useSession, signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import Image from "next/image";
import { formatGold } from "./CoinIcon";

interface JoinBetButtonProps {
  betId: string;
  creatorId: string;
  matchLabel: string;
  homeTeam: string;
  awayTeam: string;
  creatorPick: string; // raw "HOME" | "AWAY" | "DRAW"
  amount: number;
  currency: string;
  odds: number;
}

export default function JoinBetButton({
  betId,
  creatorId,
  matchLabel,
  homeTeam,
  awayTeam,
  creatorPick,
  amount,
  currency,
  odds,
}: JoinBetButtonProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  // Hide button only for the creator of the bet
  if (session?.user?.id === creatorId) return null;

  // Not signed in — show button that redirects to sign in
  if (!session?.user) {
    return (
      <button
        onClick={() => signIn("discord")}
        style={{
          background: "#00c853",
          border: "none",
          borderRadius: 6,
          padding: "6px 16px",
          fontSize: 12,
          fontWeight: 700,
          color: "#fff",
          cursor: "pointer",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "#00a846")}
        onMouseLeave={e => (e.currentTarget.style.background = "#00c853")}
      >
        Join Bet
      </button>
    );
  }

  async function handleConfirm() {
    setLoading(true);
    try {
      await fetch("/api/bets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betId, action: "join" }),
      });
      setShowConfirm(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const coinSrc = currency === "TIBIA_COINS" ? "/tibia/tibia_coin.webp" : "/tibia/crystal_coin.webp";
  const fmt = (n: number) => currency === "TIBIA_COINS" ? `${n.toLocaleString()} TC` : formatGold(n);

  // Labels
  const openerPickLabel =
    creatorPick === "HOME" ? homeTeam
    : creatorPick === "AWAY" ? awayTeam
    : "Draw";

  const joinerPickLabel =
    creatorPick === "HOME" ? awayTeam
    : creatorPick === "AWAY" ? homeTeam
    : "Either team wins";

  // Financials from joiner's perspective
  const joinerCommitment = Math.round(amount * odds); // what joiner owes if they lose
  const joinerWins = amount;                           // what joiner receives if opener loses

  const modal = showConfirm && createPortal(
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.75)" }}
        onClick={() => setShowConfirm(false)}
      />
      {/* Modal */}
      <div
        style={{
          position: "fixed", zIndex: 9999,
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(380px, calc(100vw - 32px))",
          background: "#141414",
          border: "1px solid #2a2a2a",
          borderLeft: "2px solid #00c853",
          borderRadius: 8,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #1f1f1f", background: "#1a1a1a" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Join Bet
          </div>
          <div style={{ fontSize: 11, color: "#666", marginTop: 3 }}>{matchLabel}</div>
        </div>

        {/* Pick comparison */}
        <div style={{ padding: "14px 18px", borderBottom: "1px solid #1f1f1f", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: "#1a1a1a", border: "1px solid #252525", borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#555", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Opener backs</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#F0A818" }}>{openerPickLabel}</div>
          </div>
          <div style={{ background: "#1a1a1a", border: "1px solid #00c85340", borderRadius: 6, padding: "10px 12px" }}>
            <div style={{ fontSize: 9, color: "#00c853", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>You take</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{joinerPickLabel}</div>
          </div>
        </div>

        {/* Financials */}
        <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
          <Row
            label="Your commitment"
            desc="You agree to pay this if you lose"
            value={fmt(joinerCommitment)}
            coinSrc={coinSrc}
            valueColor="#ccc"
          />
          <Row
            label="If you win"
            desc="Opener pays you this after the match"
            value={`+${fmt(joinerWins)}`}
            coinSrc={coinSrc}
            valueColor="#00c853"
          />
          <Row
            label="If you lose"
            desc="You pay the opener after the match"
            value={`−${fmt(joinerCommitment)}`}
            coinSrc={coinSrc}
            valueColor="#ef4444"
          />
        </div>

        {/* Actions */}
        <div style={{ padding: "12px 18px", borderTop: "1px solid #1f1f1f", display: "flex", gap: 10 }}>
          <button
            onClick={() => setShowConfirm(false)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 12, fontWeight: 500,
              background: "transparent", border: "1px solid #333", color: "#666", cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 12, fontWeight: 700,
              background: "#00c853", border: "none", color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Joining..." : "Accept Bet"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        style={{
          background: "#00c853",
          border: "none",
          borderRadius: 6,
          padding: "6px 16px",
          fontSize: 12,
          fontWeight: 700,
          color: "#fff",
          cursor: "pointer",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "#00a846")}
        onMouseLeave={e => (e.currentTarget.style.background = "#00c853")}
      >
        Join Bet
      </button>
      {modal}
    </>
  );
}

function Row({
  label,
  desc,
  value,
  coinSrc,
  valueColor,
}: {
  label: string;
  desc: string;
  value: string;
  coinSrc: string;
  valueColor: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, fontSize: 12 }}>
      <div>
        <div style={{ color: "#888", fontWeight: 500, marginBottom: 1 }}>{label}</div>
        <div style={{ color: "#444", fontSize: 10 }}>{desc}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, color: valueColor, fontWeight: 700, whiteSpace: "nowrap" }}>
        <Image src={coinSrc} alt="" width={11} height={11} style={{ imageRendering: "pixelated" }} />
        {value}
      </div>
    </div>
  );
}
