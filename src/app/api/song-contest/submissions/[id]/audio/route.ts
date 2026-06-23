import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Streams a submission's audio/video bytes from Postgres. Supports HTTP Range
// so the player can seek and the browser only pulls the bytes it needs — the
// requested slice is extracted in SQL via substring(), never the whole blob.
// Public: anyone can listen.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const meta = await prisma.songSubmission.findUnique({
    where: { id },
    select: { mimeType: true, sizeBytes: true, fileName: true },
  });
  if (!meta) {
    return new NextResponse("Not found", { status: 404 });
  }

  const total = meta.sizeBytes;
  let start = 0;
  let end = total - 1;
  let status = 200;

  const rangeHeader = req.headers.get("range");
  if (rangeHeader) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (m) {
      if (m[1] === "" && m[2] !== "") {
        // suffix range: last N bytes
        start = Math.max(0, total - parseInt(m[2], 10));
        end = total - 1;
      } else {
        start = m[1] ? parseInt(m[1], 10) : 0;
        end = m[2] ? parseInt(m[2], 10) : total - 1;
      }
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        return new NextResponse("Range Not Satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${total}` },
        });
      }
      status = 206;
    }
  }

  const length = end - start + 1;

  // substring() on bytea is 1-indexed: from start+1 for `length` bytes.
  const rows = await prisma.$queryRaw<{ chunk: Uint8Array | Buffer }[]>`
    SELECT substring("data" from ${start + 1} for ${length}) AS chunk
    FROM "SongSubmissionBlob"
    WHERE "submissionId" = ${id}
  `;
  if (rows.length === 0 || !rows[0].chunk) {
    return new NextResponse("Not found", { status: 404 });
  }
  const chunk = Buffer.from(rows[0].chunk);

  const headers = new Headers({
    "Content-Type": meta.mimeType,
    "Content-Length": String(chunk.length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`,
  });
  if (status === 206) {
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
  }

  return new NextResponse(chunk, { status, headers });
}
