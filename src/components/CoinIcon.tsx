import Image from "next/image";

const coinMap = {
  GOLD: { src: "/tibia/gold_coin.webp", alt: "gp" },
  TIBIA_COINS: { src: "/tibia/tibia_coin.webp", alt: "TC" },
} as const;

export default function CoinIcon({
  currency,
  size = 16,
}: {
  currency: string;
  size?: number;
}) {
  const coin = coinMap[currency as keyof typeof coinMap] ?? coinMap.GOLD;
  return (
    <Image
      src={coin.src}
      alt={coin.alt}
      width={size}
      height={size}
      className="inline-block"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

export function formatGold(amount: number): string {
  if (amount >= 1_000_000) {
    const val = amount / 1_000_000;
    return `${parseFloat(val.toFixed(2))}kk`;
  }
  if (amount >= 1_000) {
    const val = amount / 1_000;
    return `${parseFloat(val.toFixed(2))}k`;
  }
  return `${amount}`;
}

export function CoinAmount({
  amount,
  currency,
  size = 16,
}: {
  amount: number;
  currency: string;
  size?: number;
}) {
  if (currency === "TIBIA_COINS") {
    return (
      <span className="inline-flex items-center gap-1">
        <Image src="/tibia/tibia_coin.webp" alt="TC" width={size} height={size} className="inline-block" style={{ imageRendering: "pixelated" }} />
        <span>{amount.toLocaleString()} TC</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Image src="/tibia/crystal_coin.webp" alt="gp" width={size} height={size} className="inline-block" style={{ imageRendering: "pixelated" }} />
      <span>{formatGold(amount)}</span>
    </span>
  );
}
