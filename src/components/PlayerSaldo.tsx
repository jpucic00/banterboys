"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { formatGold } from "./CoinIcon";

export default function PlayerSaldo() {
  const [saldo, setSaldo] = useState<{
    saldoGold: number;
    saldoTibiaCoins: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/user/saldo")
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data) setSaldo(data);
      })
      .catch(() => {});
  }, []);

  if (!saldo) return null;

  function copyTransferText() {
    if (!saldo || saldo.saldoGold >= 0) return;
    navigator.clipboard.writeText(
      `Transfer ${Math.abs(Math.round(saldo.saldoGold))} to Banter House`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-3 text-xs font-mono">
      {/* Gold saldo */}
      <span className="flex items-center gap-1.5">
        <Image
          src="/tibia/crystal_coin.webp"
          alt="gp"
          width={16}
          height={16}
          className="shrink-0"
          style={{ imageRendering: "pixelated" }}
        />
        <span
          className={`font-semibold ${
            saldo.saldoGold < 0
              ? "text-loss"
              : saldo.saldoGold > 0
                ? "text-win"
                : "text-text-secondary"
          }`}
        >
          {saldo.saldoGold < 0 ? "-" : saldo.saldoGold > 0 ? "+" : ""}
          {formatGold(Math.abs(saldo.saldoGold))}
        </span>
        {saldo.saldoGold < 0 && (
          <button
            onClick={copyTransferText}
            title="Copy bank transfer text"
            className="flex items-center gap-1 text-xs font-semibold text-gold hover:text-gold-bright transition-colors cursor-pointer ml-1"
          >
            <svg
              className="w-3.5 h-3.5 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            {copied ? "Copied!" : "Pay"}
          </button>
        )}
      </span>

      {/* TC saldo */}
      <span className="flex items-center gap-1.5">
        <Image
          src="/tibia/tibia_coin.webp"
          alt="TC"
          width={16}
          height={16}
          className="shrink-0"
          style={{ imageRendering: "pixelated" }}
        />
        <span
          className={`font-semibold ${
            saldo.saldoTibiaCoins < 0
              ? "text-loss"
              : saldo.saldoTibiaCoins > 0
                ? "text-win"
                : "text-text-secondary"
          }`}
        >
          {saldo.saldoTibiaCoins < 0 ? "-" : saldo.saldoTibiaCoins > 0 ? "+" : ""}
          {Math.abs(saldo.saldoTibiaCoins).toLocaleString()}
        </span>
      </span>
    </div>
  );
}
