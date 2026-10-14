// Find an agent's session transcript and extract its last message.
import { closeSync, existsSync, openSync, readSync, readdirSync, fstatSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TAIL_STEPS = [256 * 1024, 4 * 1024 * 1024];

/**
 * Return the last message of the agent session, or undefined.
 * `session` is the `agent_session` object from `herdr pane get`.
 */
export function lastAgentMessage(agent, session, status) {
  const file = findTranscript(agent, session);
  if (!file) {
    return undefined;
  }
  const extract = agent === "codex" ? codexLastMessage : claudeLastMessage;
  for (const bytes of TAIL_STEPS) {
    const { lines, complete } = readTailLines(file, bytes);
    const message = extract(lines.map(parseJson).filter(Boolean), status);
    if (message || complete) {
      return message;
    }
  }
  return undefined;
}

export function findTranscript(agent, session) {
  if (!session) {
    return undefined;
  }
  if (session.kind === "path" && session.value && existsSync(session.value)) {
    return session.value;
  }
  const id = session.value;
  if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) {
    return undefined;
  }
  if (agent === "claude") {
    return findClaudeTranscript(id);
  }
  if (agent === "codex") {
    return findCodexTranscript(id);
  }
  return undefined;
}

function findClaudeTranscript(id) {
  const root = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects");
  for (const dir of safeReaddir(root)) {
    const file = join(root, dir, `${id}.jsonl`);
    if (existsSync(file)) {
      return file;
    }
  }
  return undefined;
}

function findCodexTranscript(id) {
  // Layout: sessions/YYYY/MM/DD/rollout-<timestamp>-<id>.jsonl. Newest first.
  const root = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "sessions");
  for (const year of newestFirst(root)) {
    for (const month of newestFirst(join(root, year))) {
      for (const day of newestFirst(join(root, year, month))) {
        const dir = join(root, year, month, day);
        const hit = safeReaddir(dir).find((name) => name.endsWith(`-${id}.jsonl`));
        if (hit) {
          return join(dir, hit);
        }
      }
    }
  }
  return undefined;
}

/**
 * Claude Code transcript: the last assistant entry of the main thread.
 * When the agent waits for input, the last entry is often a tool call,
 * so describe that call.
 */
export function claudeLastMessage(entries, status) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.isSidechain || entry.type !== "assistant") {
      continue;
    }
    const content = entry.message?.content;
    const blocks = Array.isArray(content) ? content : [{ type: "text", text: content }];
    if (status === "blocked") {
      const tool = [...blocks].reverse().find((block) => block?.type === "tool_use");
      if (tool) {
        return describeToolUse(tool);
      }
    }
    const text = blocks
      .filter((block) => block?.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (text) {
      return text;
    }
  }
  return undefined;
}

export function codexLastMessage(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const payload = entries[i].payload;
    if (!payload) {
      continue;
    }
    if (payload.type === "task_complete" && typeof payload.last_agent_message === "string") {
      return payload.last_agent_message.trim() || undefined;
    }
    if (payload.type === "agent_message" && typeof payload.message === "string") {
      return payload.message.trim() || undefined;
    }
    if (payload.type === "message" && payload.role === "assistant") {
      const text = (payload.content ?? [])
        .filter((block) => block?.type === "output_text")
        .map((block) => block.text)
        .join("\n")
        .trim();
      if (text) {
        return text;
      }
    }
  }
  return undefined;
}

function describeToolUse(tool) {
  const input = tool.input ?? {};
  if (tool.name === "AskUserQuestion" && Array.isArray(input.questions)) {
    return input.questions.map((q) => q.question).filter(Boolean).join(" ");
  }
  if (tool.name === "ExitPlanMode") {
    return "Plan ready for review";
  }
  const detail =
    input.description ?? input.command ?? input.file_path ?? input.url ?? input.pattern ?? "";
  return `Permission: ${tool.name}${detail ? ` — ${detail}` : ""}`;
}

/**
 * Read the last `bytes` of a file as lines. `complete` is true when
 * the whole file was read.
 */
export function readTailLines(file, bytes) {
  const fd = openSync(file, "r");
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    readSync(fd, buffer, 0, buffer.length, start);
    const lines = buffer.toString("utf8").split("\n");
    if (start > 0) {
      lines.shift(); // The first line can be partial.
    }
    return { lines: lines.filter((line) => line.trim()), complete: start === 0 };
  } finally {
    closeSync(fd);
  }
}

function parseJson(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function newestFirst(dir) {
  return safeReaddir(dir).sort().reverse();
}
