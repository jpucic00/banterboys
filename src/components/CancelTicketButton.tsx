"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CancelTicketButton({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    if (!confirm("Cancel this bet slip? The stake will be refunded.")) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, action: "cancel" }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to cancel");
      }
    } finally {
      setCancelling(false);
    }
  }

  return (
    <button
      onClick={handleCancel}
      disabled={cancelling}
      className="text-[10px] uppercase tracking-wide text-loss hover:text-white border border-loss/40 hover:border-loss hover:bg-loss/20 rounded px-2 py-0.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {cancelling ? "Cancelling..." : "Cancel"}
    </button>
  );
}
