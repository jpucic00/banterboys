"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { formatGold } from "./CoinIcon";

type UserSaldo = {
  id: string;
  alias: string | null;
  image: string | null;
  saldoGold: number;
  saldoTibiaCoins: number;
};

export default function SaldoManager() {
  const [users, setUsers] = useState<UserSaldo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustInputs, setAdjustInputs] = useState<Record<string, { gold: string; tc: string }>>({});
  const [copied, setCopied] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/saldo");
      if (!res.ok) {
        setError(`Failed to load (${res.status})`);
        setLoading(false);
        return;
      }
      setUsers(await res.json());
    } catch (e) {
      setError("Network error");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handlePaid(userId: string, currency: "GOLD" | "TIBIA_COINS") {
    const res = await fetch("/api/admin/saldo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, currency, action: "paid" }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers((prev) =>
        prev.map((u) =>
          u.id === updated.id
            ? { ...u, saldoGold: updated.saldoGold, saldoTibiaCoins: updated.saldoTibiaCoins }
            : u
        )
      );
    }
  }

  async function handleAdjust(userId: string, currency: "GOLD" | "TIBIA_COINS") {
    const raw = currency === "GOLD" ? adjustInputs[userId]?.gold : adjustInputs[userId]?.tc;
    const amount = parseFloat(raw || "0");
    if (!amount) return;

    const res = await fetch("/api/admin/saldo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, currency, action: "adjust", amount }),
    });
    if (res.ok) {
      const updated = await res.json();
      setUsers((prev) =>
        prev.map((u) =>
          u.id === updated.id
            ? { ...u, saldoGold: updated.saldoGold, saldoTibiaCoins: updated.saldoTibiaCoins }
            : u
        )
      );
      setAdjustInputs((prev) => ({
        ...prev,
        [userId]: {
          ...prev[userId],
          ...(currency === "GOLD" ? { gold: "" } : { tc: "" }),
        },
      }));
    }
  }

  function copyPayoutText(alias: string, amount: number) {
    const text = `Transfer ${Math.abs(Math.round(amount))} to Jetlife`;
    navigator.clipboard.writeText(text);
    setCopied(alias);
    setTimeout(() => setCopied(null), 2000);
  }

  if (loading) {
    return <p className="text-text-muted text-sm">Loading saldos...</p>;
  }

  if (error) {
    return <p className="text-loss text-sm">{error}</p>;
  }

  if (users.length === 0) {
    return <p className="text-text-muted text-sm">No players found</p>;
  }

  return (
    <div className="space-y-3">
      {users.map((user) => (
        <div
          key={user.id}
          className="rounded-xl border border-border-light/30 p-4 space-y-3"
        >
          {/* User header */}
          <div className="flex items-center gap-3">
            {user.image ? (
              <Image
                src={user.image}
                alt={user.alias ?? ""}
                width={32}
                height={32}
                className="rounded-full"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-bg-tertiary" />
            )}
            <span className="font-semibold text-text-primary">
              {user.alias ?? "Unknown"}
            </span>
          </div>

          {/* Gold saldo row */}
          <SaldoRow
            label="Gold"
            saldo={user.saldoGold}
            formatValue={(v) => formatGold(Math.abs(v))}
            coinSrc="/tibia/crystal_coin.webp"
            coinAlt="gp"
            adjustValue={adjustInputs[user.id]?.gold ?? ""}
            onAdjustChange={(val) =>
              setAdjustInputs((prev) => ({
                ...prev,
                [user.id]: { ...prev[user.id], gold: val, tc: prev[user.id]?.tc ?? "" },
              }))
            }
            onAdjust={() => handleAdjust(user.id, "GOLD")}
            onPaid={() => handlePaid(user.id, "GOLD")}
            copyButton={
              user.saldoGold < 0 ? (
                <button
                  onClick={() => copyPayoutText(user.alias ?? "", user.saldoGold)}
                  className="px-2 py-1 text-xs rounded-lg bg-bg-tertiary border border-border-light/30 text-text-secondary hover:text-text-primary transition-colors"
                >
                  {copied === user.alias ? "Copied!" : "Copy Transfer"}
                </button>
              ) : null
            }
          />

          {/* TC saldo row */}
          <SaldoRow
            label="TC"
            saldo={user.saldoTibiaCoins}
            formatValue={(v) => Math.abs(v).toLocaleString()}
            coinSrc="/tibia/tibia_coin.webp"
            coinAlt="TC"
            adjustValue={adjustInputs[user.id]?.tc ?? ""}
            onAdjustChange={(val) =>
              setAdjustInputs((prev) => ({
                ...prev,
                [user.id]: { ...prev[user.id], tc: val, gold: prev[user.id]?.gold ?? "" },
              }))
            }
            onAdjust={() => handleAdjust(user.id, "TIBIA_COINS")}
            onPaid={() => handlePaid(user.id, "TIBIA_COINS")}
          />
        </div>
      ))}
    </div>
  );
}

function SaldoRow({
  label,
  saldo,
  formatValue,
  coinSrc,
  coinAlt,
  adjustValue,
  onAdjustChange,
  onAdjust,
  onPaid,
  copyButton,
}: {
  label: string;
  saldo: number;
  formatValue: (v: number) => string;
  coinSrc: string;
  coinAlt: string;
  adjustValue: string;
  onAdjustChange: (val: string) => void;
  onAdjust: () => void;
  onPaid: () => void;
  copyButton?: React.ReactNode;
}) {
  const isNegative = saldo < 0;
  const isPositive = saldo > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {/* Label + amount */}
      <div className="flex items-center gap-1.5 min-w-[120px]">
        <Image
          src={coinSrc}
          alt={coinAlt}
          width={16}
          height={16}
          className="inline-block"
          style={{ imageRendering: "pixelated" }}
        />
        <span className="text-text-muted">{label}:</span>
        <span
          className={`font-mono font-semibold ${
            isNegative ? "text-loss" : isPositive ? "text-win" : "text-text-primary"
          }`}
        >
          {isNegative ? "-" : isPositive ? "+" : ""}
          {formatValue(saldo)}
        </span>
      </div>

      {/* Adjust input */}
      <div className="flex items-center gap-1">
        <input
          type="number"
          placeholder="Adjust"
          value={adjustValue}
          onChange={(e) => onAdjustChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onAdjust()}
          className="w-28 px-2 py-1 text-xs rounded-lg bg-bg-tertiary border border-border-light/30 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-gold/50"
        />
        <button
          onClick={onAdjust}
          className="px-2 py-1 text-xs rounded-lg bg-bg-tertiary border border-border-light/30 text-text-secondary hover:text-text-primary transition-colors"
        >
          Apply
        </button>
      </div>

      {/* Paid button */}
      {saldo !== 0 && (
        <button
          onClick={onPaid}
          className="px-2 py-1 text-xs rounded-lg bg-win/10 border border-win/30 text-win hover:bg-win/20 transition-colors"
        >
          Paid
        </button>
      )}

      {/* Copy transfer text (gold only, negative only) */}
      {copyButton}
    </div>
  );
}
