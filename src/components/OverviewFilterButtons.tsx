"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function OverviewFilterButtons({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hovered, setHovered] = useState<string | null>(null);

  function setFilter(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "active") {
      params.delete("filter");
    } else {
      params.set("filter", value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const filters = [
    { value: "active", label: "Active" },
    { value: "all", label: "All" },
  ];

  return (
    <div className="flex gap-1.5">
      {filters.map((f) => {
        const isActive = current === f.value;
        const isHovered = hovered === f.value;
        return (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            onMouseEnter={() => setHovered(f.value)}
            onMouseLeave={() => setHovered(null)}
            className="px-3 py-1 rounded text-xs font-medium uppercase tracking-wide transition-colors cursor-pointer"
            style={{
              background: isActive ? "#1f1f1f" : "transparent",
              border: `1px solid ${isActive ? "#333" : "transparent"}`,
              color: isActive ? "#fff" : isHovered ? "#fff" : "#666",
            }}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
