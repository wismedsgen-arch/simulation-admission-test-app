import { Prisma, TemplateKind, UserRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { expireDueSessions } from "@/lib/db/session-state";
import { formatDateTime, toDomDir, toTextAlign } from "@/lib/utils";

import { PrintButton } from "./print-button";

type ReportMessage = Prisma.SessionMessageGetPayload<{
  include: {
    attachments: true;
    template: {
      select: {
        kind: true;
        sendOrder: true;
        itemCode: true;
        schoolAnswer: true;
        schoolAnswerDirection: true;
      };
    };
  };
}>;

type Thread = {
  rootId: string;
  root: ReportMessage;
  messages: ReportMessage[];
  kind: TemplateKind | null;
  sendOrder: number | null;
  itemCode: string | null;
  schoolAnswer: string | null;
  schoolAnswerDirection: string | null;
};

type ThreadStats = {
  studentMsgCount: number;
  staffMsgCount: number;
  hasStudentReply: boolean;
  isCandidateInitiated: boolean;
  isExtended: boolean;
  showFull: boolean;
};

function computeThreadStats(thread: Thread): ThreadStats {
  const studentMsgCount = thread.messages.filter((m) => m.senderType === "STUDENT").length;
  const staffMsgCount = thread.messages.filter((m) => m.senderType === "STAFF").length;
  const hasStudentReply = studentMsgCount > 0;
  const isCandidateInitiated = thread.kind === null;
  // Extended = more back-and-forth than just root + single student reply
  const isExtended = thread.messages.length > 2;
  // Show full section unless it's an unanswered preloaded template email
  const showFull =
    hasStudentReply || isCandidateInitiated || thread.kind === TemplateKind.FOLLOW_UP;
  return { studentMsgCount, staffMsgCount, hasStudentReply, isCandidateInitiated, isExtended, showFull };
}

const printStyles = `
  @page { margin: 18mm; }
  @media print {
    .no-print { display: none !important; }
    body { background: #fff !important; }
    .report-thread,
    .report-message { break-inside: avoid; }
  }
  .report-page {
    max-width: 1080px;
    margin: 0 auto;
    padding: 32px clamp(18px, 3vw, 40px);
    color: #202124;
    background: #fff;
    min-height: 100vh;
  }
  .report-meta {
    color: #5f6368;
    font-size: 0.9rem;
  }
  .report-body {
    white-space: pre-wrap;
    line-height: 1.75;
    margin-top: 8px;
  }
  .report-attachments {
    margin-top: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .report-divider {
    height: 1px;
    background: rgba(95, 99, 104, 0.16);
    margin: 24px 0;
  }
  .report-info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px 20px;
  }
  .report-info-label {
    color: #5f6368;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .report-info-value {
    font-weight: 600;
    margin-top: 4px;
  }
  .report-pill {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 999px;
    background: rgba(26, 115, 232, 0.1);
    color: #1a73e8;
    font-size: 0.85rem;
    font-weight: 600;
  }
  .report-pill-muted {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 999px;
    background: rgba(95, 99, 104, 0.1);
    color: #5f6368;
    font-size: 0.85rem;
  }
  .report-pill-green {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 999px;
    background: rgba(52, 168, 83, 0.12);
    color: #2d7a47;
    font-size: 0.82rem;
    font-weight: 600;
  }
  .report-thread + .report-thread { margin-top: 28px; }
  .report-school-answer {
    margin-top: 12px;
    padding: 12px 16px;
    background: rgba(26, 115, 232, 0.05);
    border-left: 3px solid rgba(26, 115, 232, 0.35);
    border-radius: 0 6px 6px 0;
  }
  .report-school-answer-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #1a73e8;
    margin-bottom: 6px;
  }
  .report-school-answer-body {
    white-space: pre-wrap;
    line-height: 1.7;
    color: #202124;
  }
  .report-message {
    border-top: 1px solid rgba(95, 99, 104, 0.12);
    padding-top: 12px;
    margin-top: 12px;
  }
  .report-message--student {
    border-top: 1px solid rgba(52, 168, 83, 0.18);
    border-left: 3px solid rgba(52, 168, 83, 0.45);
    background: rgba(52, 168, 83, 0.06);
    padding: 12px 12px 6px 14px;
    margin-left: -3px;
    border-radius: 0 4px 4px 0;
  }
  .report-attachment-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid rgba(95, 99, 104, 0.2);
    color: #1a73e8;
    font-size: 0.85rem;
  }
  .report-toc {
    margin: 4px 0 0;
  }
  .report-toc-heading {
    font-size: 0.8rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #5f6368;
    margin: 0 0 10px;
  }
  .report-toc-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.88rem;
  }
  .report-toc-table th {
    text-align: left;
    padding: 5px 10px;
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #5f6368;
    border-bottom: 2px solid rgba(95, 99, 104, 0.16);
    white-space: nowrap;
  }
  .report-toc-table td {
    padding: 7px 10px;
    border-bottom: 1px solid rgba(95, 99, 104, 0.08);
    vertical-align: middle;
  }
  .report-toc-table tr:last-child td {
    border-bottom: none;
  }
  .report-toc-link {
    color: #1a73e8;
    text-decoration: none;
  }
  .report-toc-link:hover { text-decoration: underline; }
  .report-num {
    color: #5f6368;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
`;

export default async function ReviewReportPage({
  params
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const actor = await requireStaff();
  await expireDueSessions();
  const { sessionId } = await params;
  const isAdmin = actor.role === UserRole.ADMIN;

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      cycleStudent: true,
      examCycle: { select: { name: true, accessCode: true } },
      assignedPsychologist: { select: { fullName: true } },
      scenario: { select: { name: true, durationMinutes: true } },
      messages: {
        include: {
          attachments: true,
          template: {
            select: {
              kind: true,
              sendOrder: true,
              itemCode: true,
              schoolAnswer: true,
              schoolAnswerDirection: true
            }
          }
        },
        orderBy: { sentAt: "asc" }
      }
    }
  });

  if (!session) {
    notFound();
  }

  if (!isAdmin && session.assignedPsychologistId !== actor.userId) {
    notFound();
  }

  const messagesById = new Map(session.messages.map((message) => [message.id, message]));

  const findRootId = (id: string) => {
    const visited = new Set<string>();
    let current = messagesById.get(id);
    while (current?.replyToId && messagesById.has(current.replyToId) && !visited.has(current.id)) {
      visited.add(current.id);
      current = messagesById.get(current.replyToId);
    }
    return current?.id ?? id;
  };

  const groups = new Map<string, ReportMessage[]>();
  for (const message of session.messages) {
    const rootId = findRootId(message.id);
    const bucket = groups.get(rootId);
    if (bucket) {
      bucket.push(message);
    } else {
      groups.set(rootId, [message]);
    }
  }

  const threads: Thread[] = Array.from(groups.entries()).map(([rootId, messages]) => {
    messages.sort((left, right) => left.sentAt.getTime() - right.sentAt.getTime());
    const root = messagesById.get(rootId)!;
    return {
      rootId,
      root,
      messages,
      kind: root.template?.kind ?? null,
      sendOrder: root.template?.sendOrder ?? null,
      itemCode: root.template?.itemCode ?? null,
      schoolAnswer: root.template?.schoolAnswer ?? null,
      schoolAnswerDirection: root.template?.schoolAnswerDirection ?? null
    };
  });

  threads.sort((left, right) => {
    const leftPre = left.kind === TemplateKind.PRELOADED ? left.sendOrder ?? 9999 : 9999;
    const rightPre = right.kind === TemplateKind.PRELOADED ? right.sendOrder ?? 9999 : 9999;
    if (leftPre !== rightPre) {
      return leftPre - rightPre;
    }
    return left.root.sentAt.getTime() - right.root.sentAt.getTime();
  });

  const threadStats = threads.map(computeThreadStats);

  const studentMessageCount = session.messages.filter((message) => message.senderType === "STUDENT").length;
  const psychologistMessageCount = session.messages.filter((message) => message.senderType === "STAFF").length;
  const attachmentCount = session.messages.reduce((sum, message) => sum + message.attachments.length, 0);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: printStyles }} />
      <div className="report-page">
        <header
          className="no-print"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 18
          }}
        >
          <Link href={`/review/${session.id}`} className="btn btn-secondary">
            Back to review
          </Link>
          <PrintButton />
        </header>

        <section style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: "1.8rem" }}>Consolidated review report</h1>
          <p style={{ margin: "6px 0 14px", color: "#5f6368" }}>
            {session.scenario.name} · {session.examCycle.name}
          </p>

          <div className="report-info-grid">
            <Info label="Candidate" value={session.cycleStudent.fullName} />
            <Info label="Government ID" value={session.cycleStudent.governmentId} />
            <Info label="Psychologist" value={session.assignedPsychologist.fullName} />
            <Info label="Status" value={session.status} />
            <Info label="Started" value={formatDateTime(session.startedAt)} />
            <Info label="Ended" value={formatDateTime(session.endedAt)} />
            <Info
              label="Duration"
              value={`${session.scenario.durationMinutes} min${
                session.extensionMinutes ? ` (+${session.extensionMinutes} extension)` : ""
              }`}
            />
            <Info
              label="Messages"
              value={`${session.messages.length} total · ${studentMessageCount} candidate · ${psychologistMessageCount} psychologist`}
            />
            <Info label="Attachments" value={`${attachmentCount}`} />
          </div>
        </section>

        <div className="report-divider" />

        {threads.length > 0 ? (
          <>
            <section className="report-toc">
              <p className="report-toc-heading">Contents</p>
              <table className="report-toc-table">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th style={{ width: 60 }}>Code</th>
                    <th>Subject</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right", width: 80 }}>Candidate</th>
                    <th style={{ textAlign: "right", width: 60 }}>Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {threads.map((thread, i) => {
                    const stats = threadStats[i];
                    const statusEl = stats.isCandidateInitiated ? (
                      <span className="report-pill">Candidate-initiated</span>
                    ) : stats.hasStudentReply ? (
                      <span className="report-pill-green">
                        Answered{stats.isExtended ? " · extended" : ""}
                      </span>
                    ) : (
                      <span className="report-pill-muted">Unanswered</span>
                    );
                    return (
                      <tr key={thread.rootId}>
                        <td className="report-num">{i + 1}</td>
                        <td>
                          {thread.itemCode ? (
                            <span className="chip mono" style={{ fontSize: "0.78rem" }}>
                              {thread.itemCode}
                            </span>
                          ) : null}
                        </td>
                        <td>
                          {stats.showFull ? (
                            <a href={`#thread-${i + 1}`} className="report-toc-link">
                              {thread.root.subject || "(no subject)"}
                            </a>
                          ) : (
                            <span style={{ color: "#5f6368" }}>
                              {thread.root.subject || "(no subject)"}
                            </span>
                          )}
                        </td>
                        <td>{statusEl}</td>
                        <td className="report-num" style={{ textAlign: "right" }}>
                          {stats.studentMsgCount}
                        </td>
                        <td className="report-num" style={{ textAlign: "right" }}>
                          {stats.staffMsgCount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
            <div className="report-divider" />
          </>
        ) : null}

        {threads.length === 0 ? (
          <p>No emails were exchanged in this session.</p>
        ) : (
          threads.map((thread, i) => {
            if (!threadStats[i].showFull) return null;
            return (
              <ReportThreadSection key={thread.rootId} index={i + 1} thread={thread} />
            );
          })
        )}
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="report-info-label">{label}</div>
      <div className="report-info-value">{value}</div>
    </div>
  );
}

function ReportThreadSection({ index, thread }: { index: number; thread: Thread }) {
  const itemLabel =
    thread.kind === TemplateKind.PRELOADED && thread.sendOrder
      ? `Item ${thread.sendOrder} · preloaded`
      : thread.kind === TemplateKind.PRELOADED
        ? "Preloaded item"
        : thread.kind === TemplateKind.FOLLOW_UP
          ? "Pre-built follow-up"
          : "Candidate-initiated thread";

  const itemCodePrefix = thread.itemCode ? `[${thread.itemCode}] ` : "";

  return (
    <section id={`thread-${index}`} className="report-thread">
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>
          {index}. {itemCodePrefix}{thread.root.subject || "(no subject)"}
        </h2>
        <span className={thread.kind === TemplateKind.PRELOADED ? "report-pill" : "report-pill-muted"}>
          {itemLabel}
        </span>
      </header>

      {thread.schoolAnswer ? (
        <div className="report-school-answer">
          <div className="report-school-answer-label">School answer &amp; evaluation criteria</div>
          <div
            className="report-school-answer-body"
            dir={toDomDir(thread.schoolAnswerDirection)}
            style={{ textAlign: toTextAlign(thread.schoolAnswerDirection) }}
          >
            {thread.schoolAnswer}
          </div>
        </div>
      ) : null}

      {thread.messages.map((message) => (
        <ReportMessageBlock key={message.id} message={message} />
      ))}
    </section>
  );
}

function ReportMessageBlock({ message }: { message: ReportMessage }) {
  const isStudent = message.senderType === "STUDENT";
  const senderLabel = isStudent
    ? "Candidate"
    : message.senderType === "STAFF"
      ? "Psychologist (in role)"
      : "Scenario system";

  const trashedNotes: string[] = [];
  if (message.deletedByStudentAt) {
    trashedNotes.push(`Trashed by candidate at ${formatDateTime(message.deletedByStudentAt)}`);
  }
  if (message.deletedByStaffAt) {
    trashedNotes.push(`Trashed by psychologist at ${formatDateTime(message.deletedByStaffAt)}`);
  }

  return (
    <article className={`report-message${isStudent ? " report-message--student" : ""}`}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8
        }}
      >
        <div className="report-meta">
          <strong>{senderLabel}:</strong> {message.senderDisplayName}
          {"  "}
          <strong>To:</strong> {message.recipientName}
        </div>
        <div className="report-meta">{formatDateTime(message.sentAt)}</div>
      </div>
      <div
        className="report-body"
        dir={toDomDir(message.bodyDirection)}
        style={{ textAlign: toTextAlign(message.bodyDirection) }}
      >
        {message.body}
      </div>
      {message.attachments.length > 0 ? (
        <div className="report-attachments">
          {message.attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={`/api/attachments/${attachment.id}`}
              className="report-attachment-link"
              download
            >
              Attachment: {attachment.fileName}
            </a>
          ))}
        </div>
      ) : null}
      {trashedNotes.length > 0 ? (
        <div className="report-meta" style={{ marginTop: 6 }}>
          {trashedNotes.join(" · ")}
        </div>
      ) : null}
    </article>
  );
}
