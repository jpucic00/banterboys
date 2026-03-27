"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function OnboardingPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [alias, setAlias] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Already has alias — redirect
  if (session?.user?.alias) {
    router.replace("/");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = alias.trim();
    if (!trimmed) {
      setError("Character name is required.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/user/alias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias: trimmed }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Something went wrong.");
      setLoading(false);
      return;
    }
    await update({ alias: trimmed });
    window.location.replace("/");
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="bg-bg-secondary border border-border rounded-lg p-8 w-full max-w-sm">
        {session?.user?.image && (
          <div className="flex justify-center mb-4">
            <Image
              src={session.user.image}
              alt=""
              width={56}
              height={56}
              className="rounded-full ring-2 ring-border-light"
            />
          </div>
        )}
        <h1 className="text-lg font-semibold text-white text-center mb-1">
          Welcome to Banter Boys Bets
        </h1>
        <p className="text-sm text-text-muted text-center mb-6">
          Enter your Tibia character name. This will be shown instead of your Discord name.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Character name"
            maxLength={32}
            className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-white placeholder-text-muted focus:outline-none focus:border-gold"
            autoFocus
          />
          {error && <p className="text-xs text-loss">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold hover:bg-gold/90 disabled:opacity-50 text-black font-semibold py-2 rounded text-sm transition-colors"
          >
            {loading ? "Saving..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
