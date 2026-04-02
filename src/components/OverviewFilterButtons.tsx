"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export default function OverviewFilterButtons({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
        return (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1 rounded text-xs font-medium uppercase tracking-wide transition-colors border ${
              isActive
                ? "bg-[#1f1f1f] border-[#333] text-white"
                : "bg-transparent border-transparent text-[#666] hover:text-white"
            }`}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
