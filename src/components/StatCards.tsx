import Image from "next/image";

export function fmtStat(n: number) {
  return Math.round(n).toLocaleString();
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider">{title}</h2>
      <div className="rounded-2xl border border-border-light/50 p-4 bg-bg-secondary">{children}</div>
    </div>
  );
}

export function StatGrid({ cols = 4, children }: { cols?: number; children: React.ReactNode }) {
  const cls =
    cols === 3
      ? "grid grid-cols-1 sm:grid-cols-3 gap-4"
      : "grid grid-cols-2 sm:grid-cols-4 gap-4";
  return <div className={cls}>{children}</div>;
}

export function Stat({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 p-3 bg-bg-tertiary space-y-1">
      <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

export function CurrencyStat({
  label,
  gold,
  tc,
  color,
  colorFn,
  showSign,
  sub,
}: {
  label: string;
  gold: number;
  tc: number;
  color?: string;
  colorFn?: (v: number) => string;
  showSign?: boolean;
  sub?: string;
}) {
  const renderRow = (value: number, src: string, alt: string) => {
    const cls = colorFn ? colorFn(value) : color ?? "text-text-primary";
    const prefix = showSign && value > 0 ? "+" : "";
    return (
      <div className="flex items-center gap-1.5">
        <Image
          src={src}
          alt={alt}
          width={14}
          height={14}
          className="inline-block shrink-0"
          style={{ imageRendering: "pixelated" }}
        />
        <p className={`text-lg font-bold font-mono ${cls}`}>
          {prefix}
          {fmtStat(value)}
        </p>
      </div>
    );
  };
  return (
    <div className="rounded-xl border border-border/50 p-3 bg-bg-tertiary space-y-1.5">
      <p className="text-xs text-text-muted uppercase tracking-wide">{label}</p>
      <div className="space-y-0.5">
        {renderRow(gold, "/tibia/crystal_coin.webp", "gp")}
        {renderRow(tc, "/tibia/tibia_coin.webp", "TC")}
      </div>
      {sub && <p className="text-xs text-text-muted">{sub}</p>}
    </div>
  );
}
