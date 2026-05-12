"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Paperclip } from "lucide-react";

import { formatDateTime, toDomDir, toTextAlign } from "@/lib/utils";

type Message = {
  id: string;
  senderType: string;
  senderDisplayName: string;
  senderRoleId: string | null;
  recipientName: string;
  subject: string;
  body: string;
  bodyDirection: string | null;
  sentAt: string;
  replyToId: string | null;
  templateId: string | null;
  attachments: Array<{ id: string; fileName: string }>;
};

type Role = {
  id: string;
  name: string;
  category: string;
  accentColor?: string | null;
  description?: string | null;
  descriptionDirection?: string | null;
};

type ScenarioFile = {
  id: string;
  name: string;
  kind: string;
  textContent: string | null;
  textDirection?: string | null;
  fileName: string | null;
};

type Mailbox = "inbox" | "sent" | "files" | "timeline";
type View = "list" | "read";

type TimelineEntry = {
  messageId: string;
  sentAt: string;
  relativeMs: number;
  senderDisplayName: string;
  recipientName: string;
  subject: string;
  threadIndex: number;
  entryType: "CANDIDATE_INITIATED" | "CANDIDATE_REPLY" | "FOLLOW_UP" | "PSYCH_INITIATED" | "PSYCH_REPLY";
};

function getRootId(messageId: string, byId: Map<string, Message>): string {
  const visited = new Set<string>();
  let current = byId.get(messageId);
  while (current?.replyToId && byId.has(current.replyToId) && !visited.has(current.id)) {
    visited.add(current.id);
    current = byId.get(current.replyToId);
  }
  return current?.id ?? messageId;
}

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `+${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function SchoolAnswerPanel({ schoolAnswer, schoolAnswerDirection }: { schoolAnswer: string; schoolAnswerDirection: string | null }) {
  return (
    <div
      style={{
        padding: "16px 20px",
        background: "rgba(26, 115, 232, 0.05)",
        borderLeft: "3px solid rgba(26, 115, 232, 0.35)",
        borderRadius: "0 8px 8px 0",
        height: "100%",
        boxSizing: "border-box"
      }}
    >
      <div
        style={{
          fontSize: "0.72rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "#1a73e8",
          marginBottom: 10
        }}
      >
        School answer &amp; evaluation criteria
      </div>
      <div
        dir={toDomDir(schoolAnswerDirection)}
        style={{
          whiteSpace: "pre-wrap",
          lineHeight: 1.7,
          textAlign: toTextAlign(schoolAnswerDirection),
          color: "#202124"
        }}
      >
        {schoolAnswer}
      </div>
    </div>
  );
}

function MessageCard({ message, narrow }: { message: Message; narrow?: boolean }) {
  const isStudent = message.senderType === "STUDENT";
  return (
    <article
      className="panel"
      style={{
        padding: 24,
        minWidth: 0,
        overflowX: "auto",
        maxWidth: narrow ? undefined : 740,
        margin: narrow ? undefined : "0 auto",
        width: "100%",
        boxSizing: "border-box",
        borderColor: isStudent ? "rgba(52, 168, 83, 0.25)" : undefined,
        background: isStudent ? "rgba(52, 168, 83, 0.04)" : undefined
      }}
    >
      <div className="stack-sm">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>{message.subject}</h2>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              <strong>From:</strong> {message.senderDisplayName}{" "}
              <strong style={{ marginLeft: 8 }}>To:</strong> {message.recipientName}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {isStudent ? <span className="chip" style={{ color: "#2d7a47", background: "rgba(52,168,83,0.12)" }}>Candidate</span> : null}
            <div className="chip">{formatDateTime(message.sentAt)}</div>
          </div>
        </div>
        <div
          dir={toDomDir(message.bodyDirection)}
          style={{
            whiteSpace: "pre-wrap",
            lineHeight: 1.75,
            textAlign: toTextAlign(message.bodyDirection),
            overflowWrap: "break-word"
          }}
        >
          {message.body}
        </div>
        {message.attachments.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {message.attachments.map((attachment) => (
              <a key={attachment.id} href={`/api/attachments/${attachment.id}`} className="chip" download>
                <Paperclip size={14} />
                {attachment.fileName}
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ThreadView({
  thread,
  schoolAnswer
}: {
  thread: Message[];
  schoolAnswer: { schoolAnswer: string | null; schoolAnswerDirection: string | null } | null;
}) {
  const firstStudentIdx = thread.findIndex((m) => m.senderType === "STUDENT");
  const hasPairing = Boolean(schoolAnswer?.schoolAnswer) && firstStudentIdx !== -1;

  return (
    <div className="stack-md" style={{ minWidth: 0 }}>
      {thread.map((message, idx) => {
        if (hasPairing && idx === firstStudentIdx) {
          return (
            <div
              key={message.id}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "stretch" }}
            >
              <MessageCard message={message} narrow />
              <SchoolAnswerPanel
                schoolAnswer={schoolAnswer!.schoolAnswer!}
                schoolAnswerDirection={schoolAnswer!.schoolAnswerDirection ?? null}
              />
            </div>
          );
        }
        return <MessageCard key={message.id} message={message} narrow={hasPairing} />;
      })}
    </div>
  );
}

function TimelineView({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="panel" style={{ margin: 22, padding: 22 }}>
        No session activity recorded.
      </div>
    );
  }

  const typeConfig: Record<TimelineEntry["entryType"], { label: string; color: string; pillBg: string }> = {
    CANDIDATE_INITIATED: { label: "Candidate-initiated", color: "#2d7a47", pillBg: "rgba(52,168,83,0.13)" },
    CANDIDATE_REPLY:     { label: "Candidate-reply",     color: "#2d7a47", pillBg: "rgba(52,168,83,0.13)" },
    FOLLOW_UP:           { label: "Follow-up",           color: "#1a73e8", pillBg: "rgba(26,115,232,0.12)" },
    PSYCH_INITIATED:     { label: "Psych-initiated",     color: "#5f6368", pillBg: "rgba(95,99,104,0.12)" },
    PSYCH_REPLY:         { label: "Psych-reply",         color: "#5f6368", pillBg: "rgba(95,99,104,0.12)" }
  };

  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "90px 70px 180px minmax(0,1fr) 140px 40px",
          gap: "0 12px",
          padding: "8px 20px",
          borderBottom: "2px solid var(--line)",
          fontSize: "0.74rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: "#5f6368"
        }}
      >
        <span>Time</span>
        <span>+Elapsed</span>
        <span>From → To</span>
        <span>Subject</span>
        <span>Type</span>
        <span style={{ textAlign: "right" }}>#</span>
      </div>
      {entries.map((entry) => {
        const cfg = typeConfig[entry.entryType];
        const isCandidate = entry.entryType === "CANDIDATE_INITIATED" || entry.entryType === "CANDIDATE_REPLY";
        return (
          <div
            key={entry.messageId}
            style={{
              display: "grid",
              gridTemplateColumns: "90px 70px 180px minmax(0,1fr) 140px 40px",
              gap: "0 12px",
              padding: "11px 20px",
              borderBottom: "1px solid var(--line)",
              background: isCandidate ? "rgba(52, 168, 83, 0.06)" : "rgba(95, 99, 104, 0.04)",
              alignItems: "start"
            }}
          >
            <span style={{ fontSize: "0.82rem", color: "#5f6368", whiteSpace: "nowrap" }}>
              {formatDateTime(entry.sentAt)}
            </span>
            <span style={{ fontSize: "0.82rem", fontFamily: "monospace", color: "#5f6368", whiteSpace: "nowrap" }}>
              {formatDuration(entry.relativeMs)}
            </span>
            <div style={{ fontSize: "0.82rem", minWidth: 0 }}>
              <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.senderDisplayName}
              </div>
              <div style={{ color: "#5f6368", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                → {entry.recipientName}
              </div>
            </div>
            <div style={{ fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              {entry.subject}
            </div>
            <div>
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: cfg.color,
                  background: cfg.pillBg
                }}
              >
                {cfg.label}
              </span>
            </div>
            <span style={{ fontSize: "0.85rem", color: "#5f6368", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              #{entry.threadIndex}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ReviewWorkspace({
  studentName,
  sessionStatus,
  startedAt,
  messages,
  roles,
  files,
  templateSchoolAnswerMap,
  preloadedTemplateIds
}: {
  studentName: string;
  sessionStatus: string;
  startedAt: string | null;
  messages: Message[];
  roles: Role[];
  files: ScenarioFile[];
  templateSchoolAnswerMap: Record<string, { schoolAnswer: string | null; schoolAnswerDirection: string | null }>;
  preloadedTemplateIds?: string[];
}) {
  const messageById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  const inboxMessages = useMemo(
    () => messages.filter((m) => m.senderType === "STUDENT"),
    [messages]
  );
  const sentMessages = useMemo(
    () => messages.filter((m) => m.senderType === "STAFF" || m.senderType === "SYSTEM"),
    [messages]
  );

  const [mailbox, setMailbox] = useState<Mailbox>("inbox");
  const [view, setView] = useState<View>("list");
  const [selectedMessageId, setSelectedMessageId] = useState(
    inboxMessages[0]?.id ?? sentMessages[0]?.id ?? ""
  );
  const [selectedFileId, setSelectedFileId] = useState(files[0]?.id ?? "");

  const visibleMessages = mailbox === "inbox" ? inboxMessages : sentMessages;

  const selectedMessage = useMemo(
    () => messageById.get(selectedMessageId) ?? visibleMessages[0] ?? null,
    [messageById, selectedMessageId, visibleMessages]
  );

  const selectedThread = useMemo(() => {
    if (!selectedMessage) return [];
    const rootId = getRootId(selectedMessage.id, messageById);
    return messages
      .filter((m) => getRootId(m.id, messageById) === rootId)
      .sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
  }, [messageById, messages, selectedMessage]);

  const selectedFile = useMemo(
    () => files.find((f) => f.id === selectedFileId) ?? files[0] ?? null,
    [files, selectedFileId]
  );

  const threadSchoolAnswer = useMemo(() => {
    if (selectedThread.length === 0) return null;
    const root = selectedThread[0];
    if (!root.templateId) return null;
    const entry = templateSchoolAnswerMap[root.templateId];
    if (!entry?.schoolAnswer) return null;
    return entry;
  }, [selectedThread, templateSchoolAnswerMap]);

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const preloadedSet = new Set(preloadedTemplateIds ?? []);
    const isPreloaded = (m: Message) =>
      m.senderType === "SYSTEM" || (m.templateId !== null && preloadedSet.has(m.templateId));

    const allSorted = [...messages].sort(
      (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
    );

    const threadMessageIndex = new Map<string, number>();
    const threadCount = new Map<string, number>();
    for (const msg of allSorted) {
      const rootId = getRootId(msg.id, messageById);
      const count = (threadCount.get(rootId) ?? 0) + 1;
      threadCount.set(rootId, count);
      threadMessageIndex.set(msg.id, count);
    }

    const startMs = startedAt
      ? new Date(startedAt).getTime()
      : allSorted[0]
        ? new Date(allSorted[0].sentAt).getTime()
        : 0;

    return allSorted
      .filter((msg) => !isPreloaded(msg))
      .map((msg) => {
        const rootId = getRootId(msg.id, messageById);
        const root = messageById.get(rootId);
        const isCandidate = msg.senderType === "STUDENT";
        const isReply = Boolean(msg.replyToId);
        const hasTemplate = Boolean(msg.templateId);

        let entryType: TimelineEntry["entryType"];
        if (isCandidate) {
          entryType = isReply ? "CANDIDATE_REPLY" : "CANDIDATE_INITIATED";
        } else if (hasTemplate) {
          entryType = "FOLLOW_UP";
        } else if (isReply) {
          entryType = "PSYCH_REPLY";
        } else {
          entryType = "PSYCH_INITIATED";
        }

        return {
          messageId: msg.id,
          sentAt: msg.sentAt,
          relativeMs: new Date(msg.sentAt).getTime() - startMs,
          senderDisplayName: msg.senderDisplayName,
          recipientName: msg.recipientName,
          subject: root?.subject ?? msg.subject,
          threadIndex: threadMessageIndex.get(msg.id) ?? 1,
          entryType
        };
      });
  }, [messages, messageById, startedAt, preloadedTemplateIds]);

  const mailboxLabel = mailbox === "inbox" ? "Inbox" : mailbox === "sent" ? "Sent" : mailbox === "files" ? "Files" : "Timeline";

  return (
    <section className="panel" style={{ overflow: "hidden" }}>
      <header
        style={{
          padding: 18,
          borderBottom: "1px solid var(--line)",
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap"
        }}
      >
        <div className="stack-sm" style={{ gap: 6 }}>
          <strong style={{ fontSize: "1.15rem" }}>{studentName}</strong>
          <span className="muted">Status: {sessionStatus}</span>
        </div>
        <div className="chip">Read-only review</div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "230px minmax(0, 1fr)", minHeight: "calc(100vh - 400px)" }}>
        <aside
          style={{
            padding: 18,
            borderRight: "1px solid var(--line)",
            background: "var(--surface-google)"
          }}
        >
          <div className="stack-sm">
            {([
              { key: "inbox",    label: `Inbox ${inboxMessages.length}` },
              { key: "sent",     label: `Sent ${sentMessages.length}` },
              { key: "files",    label: `Files ${files.length}` },
              { key: "timeline", label: "Timeline" }
            ] as { key: Mailbox; label: string }[]).map((item) => (
              <button
                key={item.key}
                type="button"
                className="btn"
                onClick={() => {
                  setMailbox(item.key);
                  setView("list");
                }}
                style={{
                  justifyContent: "flex-start",
                  minHeight: 44,
                  background: mailbox === item.key ? "var(--blue-soft)" : "transparent",
                  color: mailbox === item.key ? "var(--blue)" : "var(--text)"
                }}
              >
                {item.label}
              </button>
            ))}

            {roles.length > 0 ? (
              <>
                <div className="divider" style={{ margin: "8px 0" }} />
                <div>
                  <strong style={{ fontSize: "0.85rem" }}>Scenario roles</strong>
                </div>
                {roles.map((role) => (
                  <div key={role.id} className="panel" style={{ padding: "8px 12px" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{role.name}</div>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>{role.category}</div>
                  </div>
                ))}
              </>
            ) : null}
          </div>
        </aside>

        <section style={{ display: "grid", gridTemplateRows: "auto 1fr", minWidth: 0 }}>
          <div style={{ padding: 14, borderBottom: "1px solid var(--line)" }}>
            <div className="chip">{mailboxLabel}</div>
          </div>

          <div style={{ minWidth: 0, overflow: "auto", minHeight: 0 }}>
            {mailbox === "timeline" ? (
              <TimelineView entries={timelineEntries} />
            ) : view === "read" && mailbox === "files" && selectedFile ? (
              <div style={{ padding: "28px clamp(18px, 3vw, 40px)", minHeight: "100%" }}>
                <div className="stack-md" style={{ width: "100%", maxWidth: 1100, margin: "0 auto" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setView("list")}>
                    <ArrowLeft size={16} />
                    Back to files
                  </button>
                  {selectedFile.fileName ? (
                    <a href={`/api/scenario-files/${selectedFile.id}`} className="btn btn-primary" style={{ width: "fit-content" }} download>
                      <Paperclip size={16} />
                      Download file
                    </a>
                  ) : null}
                  <article className="panel" style={{ padding: 24 }}>
                    <div className="stack-md">
                      <div>
                        <h2 style={{ margin: 0 }}>{selectedFile.name}</h2>
                        <p className="muted" style={{ margin: "8px 0 0" }}>
                          {selectedFile.textContent && selectedFile.fileName
                            ? `${selectedFile.fileName} with text preview`
                            : selectedFile.textContent
                              ? "Scenario text file"
                              : selectedFile.fileName ?? "Scenario uploaded file"}
                        </p>
                      </div>
                      {selectedFile.textContent ? (
                        <div
                          className="panel"
                          dir={toDomDir(selectedFile.textDirection)}
                          style={{ padding: 18, whiteSpace: "pre-wrap", lineHeight: 1.75, textAlign: toTextAlign(selectedFile.textDirection) }}
                        >
                          {selectedFile.textContent}
                        </div>
                      ) : null}
                      {!selectedFile.textContent && selectedFile.fileName ? (
                        <div className="panel" style={{ padding: 18 }}>
                          Download this file to open it.
                        </div>
                      ) : null}
                    </div>
                  </article>
                </div>
              </div>
            ) : view === "read" && selectedMessage ? (
              <div style={{ padding: "28px clamp(18px, 3vw, 40px)", minHeight: "100%" }}>
                <div className="stack-md" style={{ width: "100%", maxWidth: 1240, margin: "0 auto" }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setView("list")}>
                    <ArrowLeft size={16} />
                    Back to {mailboxLabel.toLowerCase()}
                  </button>
                  <ThreadView thread={selectedThread} schoolAnswer={threadSchoolAnswer} />
                </div>
              </div>
            ) : (
              <div style={{ minWidth: 0 }}>
                {mailbox === "files" ? (
                  files.length === 0 ? (
                    <div className="panel" style={{ margin: 22, padding: 22 }}>
                      No files available for this scenario.
                    </div>
                  ) : (
                    files.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => { setSelectedFileId(file.id); setView("read"); }}
                        style={{
                          width: "100%",
                          display: "grid",
                          gridTemplateColumns: "minmax(0, 1fr) auto",
                          alignItems: "center",
                          borderBottom: "1px solid var(--line)",
                          textAlign: "left",
                          padding: "18px 20px",
                          background: "transparent"
                        }}
                      >
                        <div>
                          <strong>{file.name}</strong>
                          <span className="muted">
                            {" · "}
                            {file.textContent && file.fileName
                              ? `${file.fileName} with text preview`
                              : file.textContent
                                ? "Text preview"
                                : file.fileName ?? "Downloadable file"}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {file.textContent ? <span className="chip">Text</span> : null}
                          {file.fileName ? <span className="chip">File</span> : null}
                        </div>
                      </button>
                    ))
                  )
                ) : visibleMessages.length === 0 ? (
                  <div className="panel" style={{ margin: 22, padding: 22 }}>
                    No {mailboxLabel.toLowerCase()} messages.
                  </div>
                ) : (
                  visibleMessages.map((message) => (
                    <button
                      key={message.id}
                      type="button"
                      onClick={() => { setSelectedMessageId(message.id); setView("read"); }}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "18px 20px",
                        borderBottom: "1px solid var(--line)",
                        background: message.senderType === "STUDENT" ? "rgba(52,168,83,0.04)" : "transparent"
                      }}
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "190px 1fr auto", gap: 14, alignItems: "center" }}>
                        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {message.senderDisplayName}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <strong>{message.subject}</strong>
                          <span className="muted"> · To: {message.recipientName}</span>
                          <span className="muted"> · {message.body.slice(0, 100)}</span>
                        </div>
                        <span className="muted" style={{ whiteSpace: "nowrap", fontSize: "0.82rem" }}>
                          {formatDateTime(message.sentAt)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
