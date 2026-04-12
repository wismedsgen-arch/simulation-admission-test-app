import { CycleStudentStatus, SessionStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { createStudentSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { normalizeInput } from "@/lib/utils";

function getRedirectUrl(request: Request, pathnameWithQuery: string) {
  const requestUrl = new URL(request.url);
  const explicitBaseUrl = process.env.APP_BASE_URL;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");

  const origin = explicitBaseUrl
    ? explicitBaseUrl
    : forwardedHost
      ? `${forwardedProto ?? "https"}://${forwardedHost}`
      : requestUrl.origin;

  return new URL(pathnameWithQuery, origin);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const fullName = normalizeInput(String(formData.get("fullName") ?? ""));
  const governmentId = normalizeInput(String(formData.get("governmentId") ?? ""));
  const accessCode = normalizeInput(String(formData.get("accessCode") ?? ""));

  if (fullName.length < 3 || governmentId.length < 5 || accessCode.length < 4) {
    return NextResponse.redirect(
      getRedirectUrl(request, `/student/login?error=${encodeURIComponent("Enter your full name, ID, and access code.")}`),
      { status: 303 }
    );
  }

  const exam = await prisma.examCycle.findFirst({
    where: {
      accessCode,
      status: {
        in: ["READY", "LIVE"]
      }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!exam) {
    return NextResponse.redirect(
      getRedirectUrl(request, `/student/login?error=${encodeURIComponent("No active exam matched that access code.")}`),
      { status: 303 }
    );
  }

  const existingStudent = await prisma.examCycleStudent.findUnique({
    where: {
      examCycleId_governmentId: {
        examCycleId: exam.id,
        governmentId
      }
    },
    include: {
      session: true
    }
  });

  if (existingStudent && normalizeInput(existingStudent.fullName) !== fullName) {
    return NextResponse.redirect(
      getRedirectUrl(
        request,
        `/student/login?error=${encodeURIComponent("That government ID is already registered under a different name for this exam.")}`,
      ),
      { status: 303 }
    );
  }

  const student =
    existingStudent ??
    (await prisma.examCycleStudent.create({
      data: {
        examCycleId: exam.id,
        fullName,
        governmentId,
        accessCode: exam.accessCode,
        status: CycleStudentStatus.WAITING
      }
    }));

  if (
    student.status === CycleStudentStatus.COMPLETED ||
    existingStudent?.session?.status === SessionStatus.COMPLETED ||
    existingStudent?.session?.status === SessionStatus.FORCED_ENDED ||
    existingStudent?.session?.status === SessionStatus.EXPIRED
  ) {
    return NextResponse.redirect(
      getRedirectUrl(
        request,
        `/student/login?error=${encodeURIComponent("This exam session has already ended and can no longer be reopened.")}`,
      ),
      { status: 303 }
    );
  }

  await createStudentSession(student.id);
  return NextResponse.redirect(getRedirectUrl(request, "/student"), { status: 303 });
}
