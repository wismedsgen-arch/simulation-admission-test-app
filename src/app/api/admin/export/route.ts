/**
 * Phase H2 — admin export download endpoint.
 *
 * GET /api/admin/export?scope=full
 * GET /api/admin/export?scope=cycle&cycleId=<id>
 *
 * Admin-only. Builds an ExportBundle in memory, zips it with JSZip, and
 * returns the zip as a binary attachment. The bundle includes every
 * Session row regardless of status, so a snapshot taken during an active
 * exam captures live session state and drafts.
 *
 * In-memory ceiling is documented in build-export.ts; this route does
 * not stream. For exports approaching the ceiling, switch to a streaming
 * archiver in a follow-up.
 */
import { UserRole } from "@prisma/client";
import JSZip from "jszip";
import { NextResponse } from "next/server";

import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  buildExport,
  type ExportScope
} from "@/lib/export/build-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requireStaff(UserRole.ADMIN);

  const url = new URL(request.url);
  const scopeParam = url.searchParams.get("scope") ?? "full";
  const cycleIdParam = url.searchParams.get("cycleId");

  let scope: ExportScope;
  if (scopeParam === "full") {
    scope = { type: "FULL" };
  } else if (scopeParam === "cycle") {
    if (!cycleIdParam) {
      return new NextResponse("cycleId is required when scope=cycle", {
        status: 400
      });
    }
    scope = { type: "CYCLE", cycleId: cycleIdParam };
  } else {
    return new NextResponse(`Unknown scope: ${scopeParam}`, { status: 400 });
  }

  let bundle;
  try {
    bundle = await buildExport(prisma, {
      scope,
      exportedByUserId: actor.userId
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`Export failed: ${message}`, { status: 500 });
  }

  const zip = new JSZip();
  for (const file of bundle.files) {
    zip.file(file.path, file.content);
  }
  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });

  const fileName = buildFileName(scope, bundle.manifest.exportedAt);

  // NextResponse's BodyInit type requires Uint8Array<ArrayBuffer>;
  // modern Buffer typings widen to Uint8Array<ArrayBufferLike>. Narrow
  // the underlying buffer (no copy).
  const body = new Uint8Array(
    zipBuffer.buffer as ArrayBuffer,
    zipBuffer.byteOffset,
    zipBuffer.byteLength
  );

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(zipBuffer.byteLength),
      "Cache-Control": "no-store"
    }
  });
}

function buildFileName(scope: ExportScope, exportedAt: string): string {
  const timestamp = exportedAt
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
  if (scope.type === "FULL") {
    return `weizmann-mail-export-FULL-${timestamp}.zip`;
  }
  return `weizmann-mail-export-CYCLE-${scope.cycleId}-${timestamp}.zip`;
}
