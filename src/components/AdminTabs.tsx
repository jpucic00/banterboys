"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "balances", label: "Balances" },
  { key: "events", label: "Custom Events" },
] as const;

export default function AdminTabs() {
  const searchParams = useSearchParams();
  const active = searchParams.get("tab") ?? "overview";

  return (
    <div className="flex gap-1 rounded-xl bg-bg-tertiary p-1 border border-border/50">
      {TABS.map(({ key, label }) => (
        <Link
          key={key}
          href={`/admin${key === "overview" ? "" : `?tab=${key}`}`}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            active === key
              ? "bg-bg-secondary text-text-primary shadow-sm"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
