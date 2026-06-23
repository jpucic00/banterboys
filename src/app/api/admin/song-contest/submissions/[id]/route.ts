import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";

// Admin moderation: remove a submission. Cascades to its blob and votes.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const isAdmin =
    session?.user?.role === "ADMIN" || isAdminEmail(session?.user?.email);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  try {
    await prisma.songSubmission.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "Submission not found." }, { status: 404 });
    }
    console.error("[admin/song-contest/submissions DELETE]", err);
    return NextResponse.json({ error: "Delete failed." }, { status: 500 });
  }
}
