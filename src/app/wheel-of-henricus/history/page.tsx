import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type SearchParams = Promise<{ before?: string }>;

export default async function HenricusHistoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  const isAdmin =
    session?.user?.role === "ADMIN" || isAdminEmail(session?.user?.email);
  if (!isAdmin) notFound();

  const sp = await searchParams;
  const before = sp.before;

  const frames = await prisma.henricusFrame.findMany({
    where: { status: "SETTLED" },
    orderBy: { settledAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      settledAt: true,
      deadAlias: true,
      deathLevel: true,
      deathReason: true,
      totalSpinCount: true,
      totalPayout: true,
      spins: {
        where: { isWinner: true },
        select: {
          spinner: { select: { name: true, alias: true } },
        },
      },
    },
  });

  const hasMore = frames.length > PAGE_SIZE;
  const items = hasMore ? frames.slice(0, PAGE_SIZE) : frames;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif text-[#F0A818]">
            Wheel of Henricus · Audit Trail
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Every settled frame, every winner, every payout. Transparent ledger.
          </p>
        </div>
        <Link
          href="/wheel-of-henricus"
          className="text-sm text-[#F0A818] hover:underline"
        >
          ← Back to wheel
        </Link>
      </header>

      {items.length === 0 ? (
        <div className="border border-border bg-[#0f0f0f] rounded-md p-8 text-center text-text-muted">
          No settled rounds yet. The wheel awaits its first death.
        </div>
      ) : (
        <div className="border border-border bg-[#0f0f0f] rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#141414] border-b border-border">
              <tr className="text-left text-xs uppercase tracking-widest text-text-muted">
                <th className="px-4 py-3">Round ended</th>
                <th className="px-4 py-3">Fallen</th>
                <th className="px-4 py-3">Cause</th>
                <th className="px-4 py-3">Spins</th>
                <th className="px-4 py-3">Winners</th>
                <th className="px-4 py-3 text-right">Payout</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((f) => (
                <tr key={f.id} className="hover:bg-[#141414] transition-colors">
                  <td className="px-4 py-3 text-text-secondary tabular-nums">
                    {f.settledAt
                      ? new Date(f.settledAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-[#F0A818]">
                    {f.deadAlias}
                    {f.deathLevel ? (
                      <span className="text-text-muted ml-1">
                        · lvl {f.deathLevel}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-text-secondary truncate max-w-xs">
                    {f.deathReason || "—"}
                  </td>
                  <td className="px-4 py-3 text-text-secondary tabular-nums">
                    {f.totalSpinCount}
                  </td>
                  <td className="px-4 py-3 text-odds-green">
                    {f.spins.length === 0
                      ? "—"
                      : f.spins
                          .map(
                            (s) =>
                              s.spinner.alias ?? s.spinner.name ?? "Unknown"
                          )
                          .join(", ")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#F0A818] font-mono">
                    {f.totalPayout.toLocaleString()} TC
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/wheel-of-henricus/history/${f.id}`}
                      className="text-xs text-[#F0A818] hover:underline"
                    >
                      details →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between text-sm">
        {before ? (
          <Link
            href="/wheel-of-henricus/history"
            className="text-text-secondary hover:text-[#F0A818]"
          >
            ← First page
          </Link>
        ) : (
          <span />
        )}
        {nextCursor && (
          <Link
            href={`/wheel-of-henricus/history?before=${nextCursor}`}
            className="text-text-secondary hover:text-[#F0A818]"
          >
            Older →
          </Link>
        )}
      </div>
    </div>
  );
}
