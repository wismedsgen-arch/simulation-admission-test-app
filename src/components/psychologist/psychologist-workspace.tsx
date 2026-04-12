"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCheck,
  Info,
  MessageSquareMore,
  Paperclip,
  RotateCcw,
  SendHorizonal,
  Star,
  Trash2,
  X
} from "lucide-react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";

import { ActionForm } from "@/components/shared/action-form";
import { ActionSubmitButton } from "@/components/shared/action-submit-button";
import { CountdownBadge } from "@/components/shared/countdown-badge";
import { RoleHoverCard } from "@/components/shared/role-hover-card";
import { TextDirectionToggle } from "@/components/shared/text-direction-toggle";
import { UiSelect } from "@/components/shared/ui-select";
import {
  markMessageResolvedAction,
  psychologistSendMessageAction,
  restorePsychologistMessageAction,
  sendTemplateEmailAction,
  trashPsychologistMessageAction
} from "@/lib/actions/psychologist";
import { formatDateTime, formatRelativeTime, toDomDir, toTextAlign } from "@/lib/utils";

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
  requiresResponse: boolean;
  resolvedAt: string | null;
  deletedByStaffAt: string | null;
  attachments: Array<{ id: string; fileName: string }>;
};

type Role = {
  id: string;
  name: string;
  category: string;
  accentColor?: string;
  description?: string | null;
  descriptionDirection?: string | null;
};

type Template = {
  id: string;
  subject: string;
  body: string;
  roleName: string;
};

type Draft = {
  subject: string;
  body: string;
  recipientRoleId: string | null;
};

type ScenarioFile = {
  id: string;
  name: string;
  kind: string;
  textContent: string | null;
  textDirection?: string | null;
  fileName: string | null;
};

type ActionResult = {
  error?: string;
  success?: string;
};

type WorkspaceView = "list" | "read" | "compose";
type Mailbox = "inbox" | "sent" | "trash" | "files";

function getRootId(messageId: string, byId: Map<string, Message>) {
  let current = byId.get(messageId);

  while (current?.replyToId && byId.has(current.replyToId)) {
    current = byId.get(current.replyToId);
  }

  return current?.id ?? messageId;
}

function PsychologistRowActions({
  mailbox,
  messageId,
  canResolve
}: {
  mailbox: Mailbox;
  messageId: string;
  canResolve: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {mailbox === "inbox" && canResolve ? (
        <ActionForm action={markMessageResolvedAction} hideMessages className="">
          <input type="hidden" name="messageId" value={messageId} />
          <button type="submit" className="icon-btn" aria-label="Mark message handled" title="Mark message handled">
            <CheckCheck size={17} />
          </button>
        </ActionForm>
      ) : null}

      {mailbox === "trash" ? (
        <ActionForm action={restorePsychologistMessageAction} hideMessages className="">
          <input type="hidden" name="messageId" value={messageId} />
          <button type="submit" className="icon-btn" aria-label="Restore email" title="Restore email">
            <RotateCcw size={17} />
          </button>
        </ActionForm>
      ) : (
        <ActionForm action={trashPsychologistMessageAction} hideMessages className="">
          <input type="hidden" name="messageId" value={messageId} />
          <button type="submit" className="icon-btn icon-btn-danger" aria-label="Move email to trash" title="Move email to trash">
            <Trash2 size={17} />
          </button>
        </ActionForm>
      )}
    </div>
  );
}

export function PsychologistWorkspace({
  sessionId,
  studentName,
  sessionStatus,
  endsAt,
  extensionMinutes,
  openingTitle,
  openingInstructions,
  openingInstructionsDirection,
  psychologistInstructions,
  psychologistInstructionsDirection,
  messages,
  roles,
  files,
  templates,
  draft
}: {
  sessionId: string;
  studentName: string;
  sessionStatus: string;
  endsAt?: string | null;
  extensionMinutes?: number;
  openingTitle: string;
  openingInstructions: string;
  openingInstructionsDirection?: string | null;
  psychologistInstructions: string;
  psychologistInstructionsDirection?: string | null;
  messages: Message[];
  roles: Role[];
  files: ScenarioFile[];
  templates: Template[];
  draft?: Draft | null;
}) {
  const router = useRouter();
  const messageById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const inboxMessages = useMemo(
    () => messages.filter((message) => message.senderType === "STUDENT" && !message.deletedByStaffAt),
    [messages]
  );
  const sentMessages = useMemo(
    () => messages.filter((message) => message.senderType === "STAFF" && !message.deletedByStaffAt),
    [messages]
  );
  const trashedMessages = useMemo(
    () => messages.filter((message) => Boolean(message.deletedByStaffAt)),
    [messages]
  );

  const [mailbox, setMailbox] = useState<Mailbox>("inbox");
  const [view, setView] = useState<WorkspaceView>("list");
  const [selectedMessageId, setSelectedMessageId] = useState(
    inboxMessages[0]?.id ?? sentMessages[0]?.id ?? trashedMessages[0]?.id ?? ""
  );
  const [replyOpen, setReplyOpen] = useState(false);
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [senderRoleId, setSenderRoleId] = useState(draft?.recipientRoleId ?? roles[0]?.id ?? "");
  const [replyBody, setReplyBody] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructionTab, setInstructionTab] = useState<"psychologist" | "student">("psychologist");
  const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[0]?.id ?? "");
  const [selectedFileId, setSelectedFileId] = useState<string>(files[0]?.id ?? "");
  const [composeBodyDirection, setComposeBodyDirection] = useState<"AUTO" | "LTR" | "RTL">("AUTO");
  const [replyBodyDirection, setReplyBodyDirection] = useState<"AUTO" | "LTR" | "RTL">("AUTO");
  const [state, formAction] = useActionState<ActionResult, FormData>(psychologistSendMessageAction, {});
  const [templateState, templateAction] = useActionState<ActionResult, FormData>(sendTemplateEmailAction, {});

  const visibleMessages = mailbox === "inbox" ? inboxMessages : mailbox === "sent" ? sentMessages : trashedMessages;
  const selectedMessage =
    messageById.get(selectedMessageId) ??
    visibleMessages[0] ??
    inboxMessages[0] ??
    sentMessages[0] ??
    trashedMessages[0] ??
    null;

  const selectedThread = useMemo(() => {
    if (!selectedMessage) {
      return [];
    }

    const rootId = getRootId(selectedMessage.id, messageById);

    return messages
      .filter((message) => getRootId(message.id, messageById) === rootId)
      .sort((left, right) => new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime());
  }, [messageById, messages, selectedMessage]);
  const selectedFile = useMemo(
    () => files.find((file) => file.id === selectedFileId) ?? files[0] ?? null,
    [files, selectedFileId]
  );

  useEffect(() => {
    if (selectedMessageId && messageById.has(selectedMessageId)) {
      return;
    }

    setSelectedMessageId(visibleMessages[0]?.id ?? inboxMessages[0]?.id ?? sentMessages[0]?.id ?? trashedMessages[0]?.id ?? "");
  }, [inboxMessages, messageById, selectedMessageId, sentMessages, trashedMessages, visibleMessages]);

  useEffect(() => {
    if (selectedFileId && files.some((file) => file.id === selectedFileId)) {
      return;
    }

    setSelectedFileId(files[0]?.id ?? "");
  }, [files, selectedFileId]);

  useEffect(() => {
    if (!state.success) {
      return;
    }

    setSubject("");
    setBody("");
    setReplyBody("");
    setComposeBodyDirection("AUTO");
    setReplyBodyDirection("AUTO");
    setReplyOpen(false);
    setView("list");
    setMailbox("inbox");
    setToast("Mail sent");
    router.refresh();
  }, [router, state.success]);

  useEffect(() => {
    if (!templateState.success) {
      return;
    }

    setView("list");
    setMailbox("inbox");
    setToast("Mail sent");
    router.refresh();
  }, [router, templateState.success]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const controller = new AbortController();

    const timeout = window.setTimeout(async () => {
      await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          subject,
          body,
          recipientRoleId: senderRoleId
        }),
        signal: controller.signal
      }).catch(() => undefined);
    }, 700);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [body, senderRoleId, sessionId, subject]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    if (showInstructions) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showInstructions]);

  useEffect(() => {
    if (showInstructions) {
      setInstructionTab("psychologist");
    }
  }, [showInstructions]);

  return (
    <>
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
            <span className="muted">Session status: {sessionStatus}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {extensionMinutes ? <span className="chip">+{extensionMinutes} min added</span> : null}
            <CountdownBadge endsAt={endsAt} active={sessionStatus === "ACTIVE"} inactiveLabel="Session ended" />
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "270px minmax(0, 1fr)", minHeight: "calc(100vh - 320px)" }}>
          <aside
            style={{
              padding: 18,
              borderRight: "1px solid var(--line)",
              background: "var(--surface-google)"
            }}
          >
            <div className="stack-md">
              <button
                type="button"
                className="btn btn-primary"
                style={{ justifyContent: "flex-start" }}
                onClick={() => {
                  setView("compose");
                  setReplyOpen(false);
                }}
              >
                <SendHorizonal size={16} />
                Compose
              </button>

              <div className="stack-sm">
                {[
                  { key: "inbox", label: `Inbox ${inboxMessages.length}` },
                  { key: "sent", label: `Sent ${sentMessages.length}` },
                  { key: "trash", label: `Trash ${trashedMessages.length}` },
                  { key: "files", label: `Files ${files.length}` }
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="btn"
                    onClick={() => {
                      setMailbox(item.key as Mailbox);
                      setView("list");
                      setReplyOpen(false);
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
              </div>

              <div className="divider" />

              <button type="button" className="btn btn-secondary" style={{ justifyContent: "flex-start" }} onClick={() => setShowInstructions(true)}>
                <Info size={16} />
                Show instructions
              </button>

              <div className="divider" />

              <div className="stack-sm">
                {roles.map((role) => (
                  <RoleHoverCard
                    key={role.id}
                    name={role.name}
                    category={role.category}
                    accentColor={role.accentColor ?? "#1a73e8"}
                    description={role.description}
                    descriptionDirection={role.descriptionDirection}
                    selected={selectedRoleId === role.id}
                    onSelect={() => setSelectedRoleId(role.id)}
                  />
                ))}
              </div>

              <div className="divider" />

              <div className="stack-sm">
                <div>
                  <strong>Prepared library</strong>
                  <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.9rem" }}>
                    Each prepared email can be used once per student.
                  </p>
                </div>
                {templateState.error ? (
                  <div className="panel" style={{ padding: 12, color: "#d93025", background: "#fff6f5" }}>
                    {templateState.error}
                  </div>
                ) : null}
                {templates.length === 0 ? (
                  <div className="panel" style={{ padding: 12 }}>
                    No prepared emails left for this student.
                  </div>
                ) : (
                  templates.map((template) => (
                    <form key={template.id} action={templateAction} className="panel" style={{ padding: 12 }}>
                      <input type="hidden" name="sessionId" value={sessionId} />
                      <input type="hidden" name="templateId" value={template.id} />
                      <div className="stack-sm">
                        <strong>{template.subject}</strong>
                        <span className="muted">{template.roleName}</span>
                        <ActionSubmitButton label="Send prepared email" pendingLabel="Sending..." className="btn btn-secondary" />
                      </div>
                    </form>
                  ))
                )}
              </div>
            </div>
          </aside>

          <section style={{ display: "grid", gridTemplateRows: "auto 1fr", minWidth: 0 }}>
            <div style={{ padding: 14, borderBottom: "1px solid var(--line)" }}>
              <div className="chip">
                {mailbox === "inbox" ? "Inbox" : mailbox === "sent" ? "Sent" : mailbox === "trash" ? "Trash" : "Files"}
              </div>
            </div>

            <div style={{ minWidth: 0, overflow: "auto", minHeight: 0 }}>
              {view === "compose" ? (
                <div style={{ padding: "28px clamp(18px, 3vw, 40px)", minHeight: "100%" }}>
                  <div className="stack-md" style={{ width: "100%", maxWidth: 1240, margin: "0 auto" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <h2 style={{ margin: 0 }}>Compose email</h2>
                        <p className="muted" style={{ margin: "8px 0 0" }}>
                          Send a live message to the student from any scenario role.
                        </p>
                      </div>
                      <button type="button" className="btn btn-secondary" onClick={() => setView("list")}>
                        <ArrowLeft size={16} />
                        Back to {mailbox}
                      </button>
                    </div>

                    <form action={formAction} className="stack-md">
                      {state.error ? (
                        <div className="panel" style={{ padding: 14, color: "#d93025", background: "#fff6f5" }}>
                          {state.error}
                        </div>
                      ) : null}
                      <input type="hidden" name="sessionId" value={sessionId} />
                      <input type="hidden" name="recipientName" value={studentName} />
                      <input type="hidden" name="bodyDirection" value={composeBodyDirection} />
                      <input type="hidden" name="replyToId" value="" />
                      <div className="panel" style={{ padding: 28, minHeight: "max(560px, calc(100vh - 360px))" }}>
                        <div className="stack-md">
                          <div className="field">
                            <label htmlFor="senderRoleId">From</label>
                            <UiSelect
                              id="senderRoleId"
                              name="senderRoleId"
                              value={senderRoleId}
                              onChange={setSenderRoleId}
                              options={roles.map((role) => ({
                                value: role.id,
                                label: role.name
                              }))}
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="psych-compose-subject">Subject</label>
                            <input
                              id="psych-compose-subject"
                              name="subject"
                              value={subject}
                              onChange={(event) => setSubject(event.target.value)}
                              required
                            />
                          </div>
                          <div className="field">
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                              <label htmlFor="psych-compose-body">Message</label>
                              <TextDirectionToggle value={composeBodyDirection} onChange={setComposeBodyDirection} />
                            </div>
                            <textarea
                              id="psych-compose-body"
                              name="body"
                              value={body}
                              onChange={(event) => setBody(event.target.value)}
                              required
                              dir={toDomDir(composeBodyDirection)}
                              style={{ minHeight: 300 }}
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="psych-compose-attachments">Attachments</label>
                            <input id="psych-compose-attachments" name="attachments" type="file" multiple />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                            <div className="chip">Drafts auto-save while you type</div>
                            <ActionSubmitButton label="Send email" pendingLabel="Sending..." />
                          </div>
                        </div>
                      </div>
                    </form>
                  </div>
                </div>
              ) : view === "read" && mailbox === "files" && selectedFile ? (
                <div style={{ padding: "28px clamp(18px, 3vw, 40px)", minHeight: "100%" }}>
                  <div className="stack-md" style={{ width: "100%", maxWidth: 1100, margin: "0 auto", minHeight: "calc(100vh - 320px)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setView("list")}>
                        <ArrowLeft size={16} />
                        Back to files
                      </button>
                      {selectedFile.fileName ? (
                        <a href={`/api/scenario-files/${selectedFile.id}`} className="btn btn-primary" download>
                          <Paperclip size={16} />
                          Download file
                        </a>
                      ) : null}
                    </div>

                    <article className="panel" style={{ padding: 24, minHeight: "max(220px, calc(100vh - 560px))" }}>
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
                            style={{
                              padding: 18,
                              whiteSpace: "pre-wrap",
                              lineHeight: 1.75,
                              textAlign: toTextAlign(selectedFile.textDirection)
                            }}
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
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setView("list")}>
                        <ArrowLeft size={16} />
                        Back to {mailbox}
                      </button>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        {mailbox !== "trash" &&
                        selectedMessage.senderType === "STUDENT" &&
                        selectedMessage.requiresResponse &&
                        !selectedMessage.resolvedAt ? (
                          <ActionForm action={markMessageResolvedAction} hideMessages className="">
                            <input type="hidden" name="messageId" value={selectedMessage.id} />
                            <button type="submit" className="btn btn-secondary">
                              <CheckCheck size={16} />
                              Mark handled
                            </button>
                          </ActionForm>
                        ) : null}
                        {mailbox !== "trash" && selectedMessage.senderType === "STUDENT" ? (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => setReplyOpen((current) => !current)}
                          >
                            <MessageSquareMore size={16} />
                            Reply
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <div className="stack-md">
                      {selectedThread.map((message) => (
                        <article
                          key={message.id}
                          className="panel"
                          style={{
                            padding: 24,
                            minHeight: "max(220px, calc(100vh - 560px))",
                            borderColor:
                              message.senderType === "STUDENT" && message.requiresResponse && !message.resolvedAt
                                ? "rgba(217, 48, 37, 0.18)"
                                : undefined,
                            background:
                              message.senderType === "STUDENT" && message.requiresResponse && !message.resolvedAt
                                ? "linear-gradient(180deg, #fff9f8 0%, #ffffff 100%)"
                                : undefined
                          }}
                        >
                          <div className="stack-sm">
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                              <div>
                                <h2 style={{ margin: 0 }}>{message.subject}</h2>
                                <p className="muted" style={{ margin: "8px 0 0" }}>
                                  <strong>From:</strong> {message.senderDisplayName} <strong style={{ marginLeft: 8 }}>To:</strong> {message.recipientName}
                                </p>
                              </div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                {message.senderType === "STUDENT" && message.requiresResponse && !message.resolvedAt ? (
                                  <span className="chip" style={{ color: "var(--red)", background: "#fff1f0" }}>
                                    Needs response
                                  </span>
                                ) : null}
                                {message.senderType === "STUDENT" && message.resolvedAt ? (
                                  <span className="chip">Handled</span>
                                ) : null}
                                <div className="chip">{formatDateTime(message.sentAt)}</div>
                              </div>
                            </div>
                            <div
                              dir={toDomDir(message.bodyDirection)}
                              style={{
                                whiteSpace: "pre-wrap",
                                lineHeight: 1.75,
                                textAlign: toTextAlign(message.bodyDirection)
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
                      ))}
                    </div>

                    {replyOpen && selectedMessage.senderType === "STUDENT" && mailbox !== "trash" ? (
                      <form action={formAction} className="stack-md">
                        {state.error ? (
                          <div className="panel" style={{ padding: 14, color: "#d93025", background: "#fff6f5" }}>
                            {state.error}
                          </div>
                        ) : null}
                        <input type="hidden" name="sessionId" value={sessionId} />
                        <input type="hidden" name="recipientName" value={studentName} />
                        <input type="hidden" name="bodyDirection" value={replyBodyDirection} />
                        <input type="hidden" name="replyToId" value={selectedMessage.id} />
                        <input type="hidden" name="subject" value={selectedMessage.subject} />
                        <div className="panel" style={{ padding: 24 }}>
                          <div className="stack-md">
                            <div className="chip">Replying with subject: {selectedMessage.subject}</div>
                            <div className="field">
                              <label htmlFor="psych-reply-role">From</label>
                              <UiSelect
                                id="psych-reply-role"
                                name="senderRoleId"
                                value={senderRoleId}
                                onChange={setSenderRoleId}
                                options={roles.map((role) => ({
                                  value: role.id,
                                  label: role.name
                                }))}
                              />
                            </div>
                            <div className="field">
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                                <label htmlFor="psych-reply-body">Reply</label>
                                <TextDirectionToggle value={replyBodyDirection} onChange={setReplyBodyDirection} />
                              </div>
                              <textarea
                                id="psych-reply-body"
                                name="body"
                                value={replyBody}
                                onChange={(event) => setReplyBody(event.target.value)}
                                required
                                dir={toDomDir(replyBodyDirection)}
                                style={{ minHeight: 220 }}
                              />
                            </div>
                            <div className="field">
                              <label htmlFor="psych-reply-attachments">Attachments</label>
                              <input id="psych-reply-attachments" name="attachments" type="file" multiple />
                            </div>
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
                              <button type="button" className="btn btn-secondary" onClick={() => setReplyOpen(false)}>
                                Cancel
                              </button>
                              <ActionSubmitButton label="Send reply" pendingLabel="Sending..." />
                            </div>
                          </div>
                        </div>
                      </form>
                    ) : null}
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
                          onClick={() => {
                            setSelectedFileId(file.id);
                            setView("read");
                          }}
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
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {file.textContent ? <span className="chip">Text</span> : null}
                            {file.fileName ? <span className="chip">File</span> : null}
                          </div>
                        </button>
                      ))
                    )
                  ) : visibleMessages.length === 0 ? (
                    <div className="panel" style={{ margin: 22, padding: 22 }}>
                      No {mailbox} messages yet.
                    </div>
                  ) : (
                    visibleMessages.map((message) => {
                      const needsResponse = mailbox === "inbox" && message.requiresResponse && !message.resolvedAt;

                      return (
                        <div
                          key={message.id}
                          style={{
                            width: "100%",
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) auto",
                            alignItems: "stretch",
                            borderBottom: "1px solid var(--line)",
                            background: needsResponse ? "rgba(217, 48, 37, 0.04)" : "transparent"
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedMessageId(message.id);
                              setReplyOpen(false);
                              setView("read");
                            }}
                            style={{
                              textAlign: "left",
                              padding: "18px 20px",
                              background: "transparent"
                            }}
                          >
                            <div style={{ display: "grid", gridTemplateColumns: "190px 1fr auto", gap: 14, alignItems: "center" }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  fontWeight: 700,
                                  color: needsResponse ? "var(--red)" : undefined
                                }}
                              >
                                <Star size={14} color={needsResponse ? "#d93025" : "#dadce0"} />
                                <span>From: {message.senderDisplayName}</span>
                              </div>
                              <div>
                                <strong>{message.subject}</strong>
                                <span className="muted"> · To: {message.recipientName}</span>
                                <span className="muted"> · {message.body.slice(0, 110)}</span>
                                {needsResponse ? (
                                  <span className="chip" style={{ marginLeft: 12, color: "var(--red)", background: "#fff1f0" }}>
                                    Needs response
                                  </span>
                                ) : null}
                              </div>
                              <span className="muted" style={{ whiteSpace: "nowrap" }}>
                                {formatRelativeTime(message.sentAt)}
                              </span>
                            </div>
                          </button>
                          <div style={{ display: "grid", placeItems: "center", padding: "0 14px" }}>
                            <PsychologistRowActions mailbox={mailbox} messageId={message.id} canResolve={needsResponse} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>

      {toast ? (
        <div className="panel" style={{ position: "fixed", right: 24, bottom: 24, padding: "12px 16px", zIndex: 60 }}>
          {toast}
        </div>
      ) : null}

      {showInstructions ? (
        <div className="modal-backdrop" style={{ zIndex: 80 }}>
          <div className="modal-card" style={{ width: "min(720px, 100%)" }}>
            <div className="stack-md">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div>
                  <h2 style={{ margin: 0 }}>{openingTitle}</h2>
                </div>
                <button type="button" className="icon-btn" aria-label="Close instructions" onClick={() => setShowInstructions(false)}>
                  <X size={18} />
                </button>
              </div>
              <div className="admin-tabs" style={{ width: "fit-content" }}>
                <button
                  type="button"
                  className={`admin-tab${instructionTab === "psychologist" ? " admin-tab--active" : ""}`}
                  onClick={() => setInstructionTab("psychologist")}
                >
                  Psychologist instructions
                </button>
                <button
                  type="button"
                  className={`admin-tab${instructionTab === "student" ? " admin-tab--active" : ""}`}
                  onClick={() => setInstructionTab("student")}
                >
                  Student instructions
                </button>
              </div>
              <div
                className="panel"
                style={{
                  padding: 18,
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.7,
                  textAlign:
                    instructionTab === "psychologist"
                      ? toTextAlign(psychologistInstructionsDirection)
                      : toTextAlign(openingInstructionsDirection)
                }}
                dir={instructionTab === "psychologist" ? toDomDir(psychologistInstructionsDirection) : toDomDir(openingInstructionsDirection)}
              >
                {instructionTab === "psychologist" ? psychologistInstructions : openingInstructions}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
