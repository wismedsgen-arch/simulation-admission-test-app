import { Prisma, TemplateKind, UserRole } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireStaff } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { expireDueSessions } from "@/lib/db/session-state";
import { formatDateTime, formatTimeOnly, toDomDir, toTextAlign } from "@/lib/utils";

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

type ThreadType = "PRELOADED" | "FOLLOW_UP" | "PSYCHOLOGIST_INITIATED" | "CANDIDATE_INITIATED";
type ThreadStatus = "UNANSWERED" | "ANSWERED" | "ANSWERED_EXTENDED" | "ADDRESSED" | "UNADDRESSED";

type ThreadStats = {
  threadType: ThreadType;
  candidateCount: number;
  staffSideCount: number;
  status: ThreadStatus;
  lastSender: "CANDIDATE" | "STAFF_SIDE";
  showFull: boolean;
};

function computeThreadStats(thread: Thread): ThreadStats {
  const candidateCount = thread.messages.filter((m) => m.senderType === "STUDENT").length;
  const staffSideCount = thread.messages.filter((m) => m.senderType !== "STUDENT").length;

  const threadType: ThreadType =
    thread.kind === TemplateKind.PRELOADED
      ? "PRELOADED"
      : thread.kind === TemplateKind.FOLLOW_UP
        ? "FOLLOW_UP"
        : thread.root.senderType === "STUDENT"
          ? "CANDIDATE_INITIATED"
          : "PSYCHOLOGIST_INITIATED";

  let status: ThreadStatus;
  if (threadType === "CANDIDATE_INITIATED") {
    status = staffSideCount > 0 ? "ADDRESSED" : "UNADDRESSED";
  } else if (candidateCount === 0) {
    status = "UNANSWERED";
  } else if (candidateCount >= 1 && staffSideCount >= 1 && (candidateCount > 1 || staffSideCount > 1)) {
    status = "ANSWERED_EXTENDED";
  } else {
    status = "ANSWERED";
  }

  const showFull =
    threadType === "CANDIDATE_INITIATED" ||
    threadType === "PSYCHOLOGIST_INITIATED" ||
    candidateCount > 0 ||
    staffSideCount > 1;

  const lastMessage = thread.messages[thread.messages.length - 1];
  const lastSender: "CANDIDATE" | "STAFF_SIDE" =
    lastMessage.senderType === "STUDENT" ? "CANDIDATE" : "STAFF_SIDE";

  return { threadType, candidateCount, staffSideCount, status, lastSender, showFull };
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
    font-size: 0.82rem;
    font-weight: 600;
  }
  .report-pill-muted {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 999px;
    background: rgba(95, 99, 104, 0.1);
    color: #5f6368;
    font-size: 0.82rem;
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
  .report-timeline-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .report-timeline-table {
    width: 100%;
    min-width: 760px;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  .report-timeline-table th {
    text-align: left;
    padding: 5px 10px;
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #5f6368;
    border-bottom: 2px solid rgba(95, 99, 104, 0.16);
    white-space: nowrap;
  }
  .report-timeline-table td {
    padding: 7px 10px;
    border-bottom: 1px solid rgba(95, 99, 104, 0.08);
    vertical-align: top;
  }
  .report-timeline-table tr:last-child td { border-bottom: none; }
  .report-timeline-row--candidate { background: rgba(52, 168, 83, 0.05); }
  .report-timeline-pill {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .report-timeline-pill--candidate { color: #2d7a47; background: rgba(52,168,83,0.12); }
  .report-timeline-pill--followup  { color: #1a73e8; background: rgba(26,115,232,0.12); }
  .report-timeline-pill--psych     { color: #5f6368; background: rgba(95,99,104,0.12); }
  .report-num {
    color: #5f6368;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
  .report-type-label {
    font-size: 0.8rem;
    color: #5f6368;
    white-space: nowrap;
  }
  .report-sender-label {
    font-size: 0.82rem;
    white-space: nowrap;
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

  const staffUploaderIds = new Set<string>();
  for (const message of session.messages) {
    for (const attachment of message.attachments) {
      if (attachment.uploadedByType === "STAFF" && attachment.uploadedById) {
        staffUploaderIds.add(attachment.uploadedById);
      }
    }
  }
  const staffUploaders = staffUploaderIds.size
    ? await prisma.user.findMany({
        where: { id: { in: Array.from(staffUploaderIds) } },
        select: { id: true, fullName: true }
      })
    : [];
  const staffUploaderNames = new Map(staffUploaders.map((user) => [user.id, user.fullName]));

  const attachmentUploaderLabel = new Map<string, string>();
  for (const message of session.messages) {
    for (const attachment of message.attachments) {
      if (!attachment.uploadedByType) continue;
      if (attachment.uploadedByType === "STUDENT") {
        attachmentUploaderLabel.set(attachment.id, `Candidate (${session.cycleStudent.fullName})`);
      } else if (attachment.uploadedByType === "STAFF") {
        const name = attachment.uploadedById ? staffUploaderNames.get(attachment.uploadedById) : null;
        attachmentUploaderLabel.set(attachment.id, name ? `Psychologist (${name})` : "Psychologist");
      } else {
        attachmentUploaderLabel.set(attachment.id, "Scenario system");
      }
    }
  }

  // Candidate global sequence numbers
  const candidateSequence = new Map(
    session.messages
      .filter((m) => m.senderType === "STUDENT")
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
      .map((m, i) => [m.id, i + 1])
  );

  // Timeline: index thread positions across ALL messages so that hidden
  // preloaded scenario emails still occupy #1 in their thread, then
  // render only messages actually sent during the exam (drop preloaded).
  const tlIsPreloaded = (m: ReportMessage) =>
    m.template?.kind === TemplateKind.PRELOADED || m.senderType === "SYSTEM";

  const tlAllSorted = [...session.messages].sort(
    (a, b) => a.sentAt.getTime() - b.sentAt.getTime()
  );

  const tlThreadCount = new Map<string, number>();
  const tlThreadIndex = new Map<string, number>();
  for (const msg of tlAllSorted) {
    const rootId = findRootId(msg.id);
    const count = (tlThreadCount.get(rootId) ?? 0) + 1;
    tlThreadCount.set(rootId, count);
    tlThreadIndex.set(msg.id, count);
  }

  const timelineMessages = tlAllSorted.filter((m) => !tlIsPreloaded(m));

  const sessionStartMs = session.startedAt ? session.startedAt.getTime() : (tlAllSorted[0]?.sentAt.getTime() ?? 0);

  function tlEntryType(msg: (typeof timelineMessages)[0]): string {
    if (msg.senderType === "STUDENT") return msg.replyToId ? "Candidate-reply" : "Candidate-initiated";
    if (msg.templateId) return "Follow-up";
    return msg.replyToId ? "Psych-reply" : "Psych-initiated";
  }

  function tlFormatDuration(ms: number) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `+${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function tlIsCandidate(msg: (typeof timelineMessages)[0]) {
    return msg.senderType === "STUDENT";
  }

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
                    <th style={{ width: 56 }}>Code</th>
                    <th>Subject</th>
                    <th style={{ width: 140 }}>Type</th>
                    <th style={{ width: 160 }}>Status</th>
                    <th style={{ width: 120 }}>Last sender</th>
                    <th style={{ textAlign: "right", width: 72 }}>Candidate</th>
                    <th style={{ textAlign: "right", width: 56 }}>Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {threads.map((thread, i) => {
                    const stats = threadStats[i];
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
                        <td>
                          <ThreadTypeLabel type={stats.threadType} />
                        </td>
                        <td>
                          <ThreadStatusBadge status={stats.status} />
                        </td>
                        <td>
                          <span className="report-sender-label" style={{ color: stats.lastSender === "CANDIDATE" ? "#2d7a47" : "#5f6368" }}>
                            {stats.lastSender === "CANDIDATE" ? "Candidate" : "Psychologist/Staff"}
                          </span>
                        </td>
                        <td className="report-num" style={{ textAlign: "right" }}>
                          {stats.candidateCount}
                        </td>
                        <td className="report-num" style={{ textAlign: "right" }}>
                          {stats.staffSideCount}
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

        {timelineMessages.length > 0 ? (
          <>
            <section>
              <p className="report-toc-heading">Session timeline</p>
              <div className="report-timeline-scroll">
                <table className="report-timeline-table">
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}>Time</th>
                      <th style={{ width: 70 }}>+Elapsed</th>
                      <th style={{ width: 170 }}>From → To</th>
                      <th>Subject</th>
                      <th style={{ width: 150 }}>Type</th>
                      <th style={{ width: 36, textAlign: "right" }}>#</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timelineMessages.map((msg) => {
                      const isCandidate = tlIsCandidate(msg);
                      const entryType = tlEntryType(msg);
                      const pillClass = isCandidate
                        ? "report-timeline-pill report-timeline-pill--candidate"
                        : msg.templateId
                          ? "report-timeline-pill report-timeline-pill--followup"
                          : "report-timeline-pill report-timeline-pill--psych";
                      const rootId = findRootId(msg.id);
                      const rootMsg = messagesById.get(rootId);
                      const elapsed = tlFormatDuration(msg.sentAt.getTime() - sessionStartMs);
                      return (
                        <tr key={msg.id} className={isCandidate ? "report-timeline-row--candidate" : ""}>
                          <td className="report-num" style={{ whiteSpace: "nowrap", fontFamily: "monospace" }}>{formatTimeOnly(msg.sentAt)}</td>
                          <td style={{ fontFamily: "monospace", color: "#5f6368" }}>{elapsed}</td>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>{msg.senderDisplayName}</div>
                            <div style={{ color: "#5f6368", fontSize: "0.82rem" }}>→ {msg.recipientName}</div>
                          </td>
                          <td>{rootMsg?.subject ?? msg.subject}</td>
                          <td><span className={pillClass}>{entryType}</span></td>
                          <td className="report-num" style={{ textAlign: "right" }}>
                            #{tlThreadIndex.get(msg.id) ?? 1}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
              <ReportThreadSection
                key={thread.rootId}
                index={i + 1}
                thread={thread}
                candidateSequence={candidateSequence}
                attachmentUploaderLabel={attachmentUploaderLabel}
              />
            );
          })
        )}
      </div>
    </>
  );
}

function ThreadTypeLabel({ type }: { type: ThreadType }) {
  const labels: Record<ThreadType, string> = {
    PRELOADED: "Preloaded",
    FOLLOW_UP: "Follow-up",
    PSYCHOLOGIST_INITIATED: "Psych-initiated",
    CANDIDATE_INITIATED: "Candidate-initiated"
  };
  return <span className="report-type-label">{labels[type]}</span>;
}

function ThreadStatusBadge({ status }: { status: ThreadStatus }) {
  switch (status) {
    case "ANSWERED_EXTENDED":
      return <span className="report-pill">Answered · Extended</span>;
    case "ANSWERED":
      return <span className="report-pill-green">Answered</span>;
    case "ADDRESSED":
      return <span className="report-pill-green">Addressed</span>;
    case "UNANSWERED":
      return <span className="report-pill-muted">Unanswered</span>;
    case "UNADDRESSED":
      return <span className="report-pill-muted">Unaddressed</span>;
  }
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="report-info-label">{label}</div>
      <div className="report-info-value">{value}</div>
    </div>
  );
}

function ReportThreadSection({
  index,
  thread,
  candidateSequence,
  attachmentUploaderLabel
}: {
  index: number;
  thread: Thread;
  candidateSequence: Map<string, number>;
  attachmentUploaderLabel: Map<string, string>;
}) {
  const itemLabel =
    thread.kind === TemplateKind.PRELOADED && thread.sendOrder
      ? `Item ${thread.sendOrder} · preloaded`
      : thread.kind === TemplateKind.PRELOADED
        ? "Preloaded item"
        : thread.kind === TemplateKind.FOLLOW_UP
          ? "Pre-built follow-up"
          : thread.root.senderType === "STUDENT"
            ? "Candidate-initiated thread"
            : "Psychologist-initiated thread";

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
        <ReportMessageBlock
          key={message.id}
          message={message}
          candidateN={candidateSequence.get(message.id)}
          attachmentUploaderLabel={attachmentUploaderLabel}
        />
      ))}
    </section>
  );
}

function ReportMessageBlock({
  message,
  candidateN,
  attachmentUploaderLabel
}: {
  message: ReportMessage;
  candidateN?: number;
  attachmentUploaderLabel: Map<string, string>;
}) {
  const isStudent = message.senderType === "STUDENT";
  const senderLabel = isStudent
    ? candidateN !== undefined ? `Candidate reply #${candidateN}` : "Candidate"
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
          {message.attachments.map((attachment) => {
            const uploader = attachmentUploaderLabel.get(attachment.id);
            return (
              <div key={attachment.id} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <a
                  href={`/api/attachments/${attachment.id}`}
                  className="report-attachment-link"
                  download
                >
                  Attachment: {attachment.fileName}
                </a>
                {uploader ? (
                  <span className="report-meta" style={{ fontSize: "0.78rem", paddingLeft: 10 }}>
                    Uploaded by {uploader}
                  </span>
                ) : null}
              </div>
            );
          })}
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
