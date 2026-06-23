import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Serves a submission's optional cover image from Postgres. Public; returns
// the whole image (covers are small, so no Range handling needed). 404 when
// the submission has no cover.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const meta = await prisma.songSubmission.findUnique({
    where: { id },
    select: { coverMimeType: true },
  });
  if (!meta || !meta.coverMimeType) {
    return new NextResponse("Not found", { status: 404 });
  }

  const cover = await prisma.songSubmissionCover.findUnique({
    where: { submissionId: id },
    select: { data: true },
  });
  if (!cover) {
    return new NextResponse("Not found", { status: 404 });
  }

  const bytes = Buffer.from(cover.data);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": meta.coverMimeType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
