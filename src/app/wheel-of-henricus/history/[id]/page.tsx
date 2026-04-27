import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function HenricusFrameDetailPage({
  params,
}: {
  params: Params;
}) {
  const session = await auth();
  const isAdmin =
    session?.user?.role === "ADMIN" || isAdminEmail(session?.user?.email);
  if (!isAdmin) notFound();

  const { id } = await params;

  const frame = await prisma.henricusFrame.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      totalSpinCount: true,
      totalPayout: true,
      deadAlias: true,
      deadAtServer: true,
      deadAtTibia: true,
      deathLevel: true,
      deathReason: true,
      createdAt: true,
      settledAt: true,
      spins: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          createdAt: true,
          assignedAlias: true,
          stake: true,
          payout: true,
          isWinner: true,
          spinner: { select: { id: true, name: true, alias: true, image: true } },
        },
      },
    },
  });

  if (!frame) notFound();

  const winners = frame.spins.filter((s) => s.isWinner);

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-serif text-[#F0A818]">
            Round {frame.id.slice(0, 8)}
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            {frame.status === "SETTLED"
              ? `Settled ${frame.settledAt ? new Date(frame.settledAt).toLocaleString() : ""}`
              : "Still active"}
          </p>
        </div>
        <Link
          href="/wheel-of-henricus/history"
          className="text-sm text-[#F0A818] hover:underline"
        >
          ← Back to audit trail
        </Link>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Status" value={frame.status} />
        <Stat label="Spins" value={String(frame.totalSpinCount)} />
        <Stat label="Total payout" value={`${frame.totalPayout.toLocaleString()} TC`} />
        <Stat
          label="Round opened"
          value={new Date(frame.createdAt).toLocaleString()}
        />
        {frame.status === "SETTLED" && (
          <>
            <Stat label="Dead character" value={frame.deadAlias ?? "—"} accent />
            <Stat
              label="Death level"
              value={frame.deathLevel ? String(frame.deathLevel) : "—"}
            />
            <Stat
              label="Death cause"
              value={frame.deathReason ?? "—"}
              span2
            />
            <Stat
              label="Tibia death time"
              value={
                frame.deadAtTibia
                  ? new Date(frame.deadAtTibia).toLocaleString()
                  : "—"
              }
            />
            <Stat
              label="Detected at"
              value={
                frame.deadAtServer
                  ? new Date(frame.deadAtServer).toLocaleString()
                  : "—"
              }
            />
            <Stat label="Winners" value={String(winners.length)} />
          </>
        )}
      </div>

      <section>
        <h2 className="text-sm uppercase tracking-widest text-text-muted mb-3">
          Every spin in this round
        </h2>
        {frame.spins.length === 0 ? (
          <div className="border border-border bg-[#0f0f0f] rounded-md p-8 text-center text-text-muted">
            No spins were placed in this round.
          </div>
        ) : (
          <div className="border border-border bg-[#0f0f0f] rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#141414] border-b border-border">
                <tr className="text-left text-xs uppercase tracking-widest text-text-muted">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Spinner</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3 text-right">Stake</th>
                  <th className="px-4 py-3 text-right">Payout</th>
                  <th className="px-4 py-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {frame.spins.map((s, i) => (
                  <tr
                    key={s.id}
                    className={`${s.isWinner ? "bg-odds-green/5" : ""} hover:bg-[#141414] transition-colors`}
                  >
                    <td className="px-4 py-3 text-text-muted tabular-nums">
                      {i + 1}
                    </td>
                    <td className="px-4 py-3 text-text-secondary tabular-nums">
                      {new Date(s.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {s.spinner.image ? (
                          <Image
                            src={s.spinner.image}
                            alt=""
                            width={20}
                            height={20}
                            className="rounded-full ring-1 ring-border-light"
                          />
                        ) : null}
                        <span className="text-text-secondary">
                          {s.spinner.alias ?? s.spinner.name ?? "Unknown"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#F0A818]">
                      {s.assignedAlias}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-text-secondary font-mono">
                      {s.stake} TC
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-mono ${s.isWinner ? "text-odds-green" : "text-text-muted"}`}
                    >
                      {s.payout > 0 ? `${s.payout.toLocaleString()} TC` : "—"}
                    </td>
                    <td
                      className={`px-4 py-3 text-xs font-medium ${s.isWinner ? "text-odds-green" : "text-text-muted"}`}
                    >
                      {s.isWinner ? "✓ WINNER" : frame.status === "SETTLED" ? "lost" : "pending"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  span2,
}: {
  label: string;
  value: string;
  accent?: boolean;
  span2?: boolean;
}) {
  return (
    <div
      className={`border border-border bg-[#0f0f0f] rounded p-3 ${span2 ? "col-span-2" : ""}`}
    >
      <div className="text-xs text-text-muted uppercase tracking-widest">
        {label}
      </div>
      <div
        className={`mt-1 text-sm font-mono ${accent ? "text-[#F0A818]" : "text-text-secondary"}`}
      >
        {value}
      </div>
    </div>
  );
}
