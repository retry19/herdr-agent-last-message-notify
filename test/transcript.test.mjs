import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeLastMessage, codexLastMessage, lastAgentMessage, readTailLines } from "../transcript.mjs";
import { cleanMarkdown, formatBody, formatLocation, truncate } from "../format.mjs";

const assistant = (content, extra = {}) => ({ type: "assistant", message: { role: "assistant", content }, ...extra });

test("claude: returns the last assistant text and skips tool results and system entries", () => {
  const entries = [
    assistant([{ type: "text", text: "old" }]),
    { type: "user", message: { content: [{ type: "tool_result", content: "x" }] } },
    assistant([{ type: "text", text: "Done. Tests pass." }]),
    { type: "system" },
  ];
  assert.equal(claudeLastMessage(entries, "done"), "Done. Tests pass.");
});

test("claude: skips sidechain entries and tool-only entries when done", () => {
  const entries = [
    assistant([{ type: "text", text: "main" }]),
    assistant([{ type: "tool_use", name: "Bash", input: {} }]),
    assistant([{ type: "text", text: "sub" }], { isSidechain: true }),
  ];
  assert.equal(claudeLastMessage(entries, "done"), "main");
});

test("claude: describes the pending tool call when blocked", () => {
  const bash = assistant([
    { type: "text", text: "I will run it." },
    { type: "tool_use", name: "Bash", input: { command: "rm -rf build", description: "Remove build dir" } },
  ]);
  assert.equal(claudeLastMessage([bash], "blocked"), "Permission: Bash — Remove build dir");

  const ask = assistant([
    { type: "tool_use", name: "AskUserQuestion", input: { questions: [{ question: "Which DB?" }] } },
  ]);
  assert.equal(claudeLastMessage([ask], "blocked"), "Which DB?");
});

test("codex: prefers task_complete.last_agent_message", () => {
  const entries = [
    { type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "older" }] } },
    { type: "event_msg", payload: { type: "task_complete", last_agent_message: "Merged into main." } },
    { type: "event_msg", payload: { type: "token_count" } },
  ];
  assert.equal(codexLastMessage(entries), "Merged into main.");
});

test("readTailLines drops the partial first line", () => {
  const dir = mkdtempSync(join(tmpdir(), "herdr-notify-"));
  const file = join(dir, "t.jsonl");
  writeFileSync(file, '{"a":1}\n{"b":2}\n{"c":3}\n');
  assert.deepEqual(readTailLines(file, 12).lines, ['{"c":3}']);
  assert.equal(readTailLines(file, 1000).complete, true);
});

test("lastAgentMessage finds a claude transcript under CLAUDE_CONFIG_DIR", () => {
  const dir = mkdtempSync(join(tmpdir(), "herdr-notify-"));
  mkdirSync(join(dir, "projects", "-home-x"), { recursive: true });
  const id = "11111111-2222-3333-4444-555555555555";
  writeFileSync(
    join(dir, "projects", "-home-x", `${id}.jsonl`),
    `${JSON.stringify(assistant([{ type: "text", text: "hello" }]))}\n`,
  );
  process.env.CLAUDE_CONFIG_DIR = dir;
  assert.equal(lastAgentMessage("claude", { kind: "id", value: id }, "done"), "hello");
  assert.equal(lastAgentMessage("claude", { kind: "id", value: "../etc" }, "done"), undefined);
});

test("cleanMarkdown and truncate", () => {
  assert.equal(cleanMarkdown("## Title\n\n**Bold** `code`\n- item [link](http://x)"), "Title\nBold code\n• item link");
  assert.equal(truncate("abcdef", 4), "abc…");
});

test("formatLocation shows the workspace number only when enabled", () => {
  const workspace = { label: "shop", number: 2 };
  const tab = { label: "feat-login" };
  assert.equal(formatLocation(workspace, tab), "shop · 2 · feat-login");
  assert.equal(formatLocation(workspace, tab, { showWorkspaceNumber: false }), "shop · feat-login");
  assert.equal(formatLocation(undefined, tab), "feat-login");
});

test("formatLocation uses the separator", () => {
  const location = formatLocation({ label: "shop", number: 2 }, { label: "feat-login" }, { separator: "/" });
  assert.equal(location, "shop/2/feat-login");
});

test("formatBody adds the suffix only when a message follows", () => {
  assert.equal(formatBody("shop · 2 · tab", "Done.", ":"), "shop · 2 · tab:\nDone.");
  assert.equal(formatBody("shop · 2 · tab", "", ":"), "shop · 2 · tab");
  assert.equal(formatBody("", "Done.", ":"), "Done.");
});
