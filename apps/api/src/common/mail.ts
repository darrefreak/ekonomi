import { Socket, createConnection } from "node:net";
import { randomUUID } from "node:crypto";
import { logger } from "./logger";

/**
 * Minimal SMTP client for local dev delivery (Mailpit, SMTP_HOST/SMTP_PORT).
 * No auth/TLS — matches Mailpit's plaintext listener. Never throws: callers
 * must be able to persist the underlying record (e.g. an invite) even when
 * mail delivery fails.
 */
export type SendMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type SendMailResult = { sent: boolean; error?: string };

const CONNECT_TIMEOUT_MS = 5000;
const COMMAND_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/** Reads one full (possibly multi-line) SMTP response per call. */
function createResponseReader(socket: Socket) {
  let buffer = "";
  const queue: Array<{
    resolve: (lines: string[]) => void;
    reject: (err: Error) => void;
  }> = [];
  let pendingLines: string[] = [];

  const flushIfComplete = () => {
    let idx: number;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const rawLine = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line.length === 0) continue;
      pendingLines.push(line);
      const isFinal = /^\d{3}/.test(line) && !/^\d{3}-/.test(line);
      if (isFinal) {
        const lines = pendingLines;
        pendingLines = [];
        const waiter = queue.shift();
        waiter?.resolve(lines);
      }
    }
  };

  socket.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    flushIfComplete();
  });

  socket.on("error", (err: Error) => {
    while (queue.length) {
      queue.shift()?.reject(err);
    }
  });

  socket.on("close", () => {
    while (queue.length) {
      queue.shift()?.reject(new Error("SMTP connection closed unexpectedly"));
    }
  });

  return {
    next(): Promise<string[]> {
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject });
      });
    },
  };
}

function responseCode(lines: string[]): number {
  const first = lines[0] ?? "";
  return Number(first.slice(0, 3)) || 0;
}

/** RFC 5321 dot-stuffing + CRLF normalization for the DATA section. */
function encodeDataSection(body: string): string {
  return body
    .split(/\r\n|\n/)
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function buildMimeMessage(input: {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}): string {
  const messageId = `<${randomUUID()}@ffos.local>`;
  const date = new Date().toUTCString();
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `Date: ${date}`,
    `Message-Id: ${messageId}`,
    `MIME-Version: 1.0`,
  ];

  if (!input.html) {
    headers.push(`Content-Type: text/plain; charset=utf-8`);
    return `${headers.join("\r\n")}\r\n\r\n${input.text}`;
  }

  const boundary = `ffos-${randomUUID().replace(/-/g, "")}`;
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  const body = [
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    input.text,
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    input.html,
    `--${boundary}--`,
    ``,
  ].join("\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

async function sendViaSmtp(input: {
  host: string;
  port: number;
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const socket = await withTimeout(
    new Promise<Socket>((resolve, reject) => {
      const s = createConnection({ host: input.host, port: input.port });
      const onError = (err: Error) => reject(err);
      s.once("error", onError);
      s.once("connect", () => {
        s.removeListener("error", onError);
        resolve(s);
      });
    }),
    CONNECT_TIMEOUT_MS,
    "SMTP connect",
  );

  const reader = createResponseReader(socket);

  const command = async (cmd: string | null, expectCode: number) => {
    if (cmd !== null) socket.write(`${cmd}\r\n`);
    const lines = await withTimeout(reader.next(), COMMAND_TIMEOUT_MS, `SMTP command "${cmd ?? "<greeting>"}"`);
    const code = responseCode(lines);
    if (code !== expectCode) {
      throw new Error(
        `Unexpected SMTP response to "${cmd ?? "<greeting>"}": ${lines.join(" | ")}`,
      );
    }
    return lines;
  };

  try {
    await command(null, 220);
    await command(`EHLO ffos-api`, 250);
    await command(`MAIL FROM:<${input.from}>`, 250);
    await command(`RCPT TO:<${input.to}>`, 250);
    await command(`DATA`, 354);
    const message = buildMimeMessage(input);
    socket.write(`${encodeDataSection(message)}\r\n.\r\n`);
    const lines = await withTimeout(reader.next(), COMMAND_TIMEOUT_MS, "SMTP DATA");
    if (responseCode(lines) !== 250) {
      throw new Error(`SMTP DATA rejected: ${lines.join(" | ")}`);
    }
    socket.write(`QUIT\r\n`);
  } finally {
    socket.end();
    socket.destroy();
  }
}

/**
 * Send an email via SMTP_HOST/SMTP_PORT (Mailpit in dev). Always resolves —
 * failures are logged and reported via `sent: false` so callers can persist
 * the underlying record (e.g. an invitation) regardless of mail delivery.
 */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const host = process.env.SMTP_HOST ?? "localhost";
  const port = Number(process.env.SMTP_PORT ?? 1025);
  const from = process.env.SMTP_FROM ?? "no-reply@ffos.local";

  try {
    await sendViaSmtp({ host, port, from, ...input });
    logger.info("mail_sent", { to: input.to, subject: input.subject });
    return { sent: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("mail_send_failed", {
      to: input.to,
      subject: input.subject,
      error: message,
    });
    return { sent: false, error: message };
  }
}
