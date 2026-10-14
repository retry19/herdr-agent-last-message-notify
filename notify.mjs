// Herdr event hook: send a desktop notification that includes the last
// agent message when an agent is done or waits for input.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanMarkdown, formatBody, formatLocation, truncate } from "./format.mjs";
import { lastAgentMessage } from "./transcript.mjs";

const herdrBin = process.env.HERDR_BIN_PATH || "herdr";
const stateDir = process.env.HERDR_PLUGIN_STATE_DIR;
const testMode = process.argv.includes("--test");

loadDotEnv(process.env.HERDR_PLUGIN_CONFIG_DIR && join(process.env.HERDR_PLUGIN_CONFIG_DIR, ".env"));

const config = {
  statuses: listEnv("NOTIFY_STATUSES", ["done", "blocked"]),
  delayMs: intEnv("NOTIFY_DELAY_MS", 1000),
  maxChars: intEnv("NOTIFY_MAX_CHARS", 300),
  whenFocused: flagEnv("NOTIFY_WHEN_FOCUSED", false),
  showWorkspaceNumber: flagEnv("NOTIFY_SHOW_WORKSPACE_NUMBER", true),
  locationSeparator: process.env.NOTIFY_LOCATION_SEPARATOR ?? " · ",
  locationSuffix: process.env.NOTIFY_LOCATION_SUFFIX ?? "",
  backend: process.env.NOTIFY_BACKEND || "auto",
  appName: process.env.NOTIFY_APP_NAME || "Herdr",
  icon: process.env.NOTIFY_ICON || "",
  urgencyBlocked: process.env.NOTIFY_URGENCY_BLOCKED || "critical",
  debug: flagEnv("NOTIFY_DEBUG", false),
};

const context = readJsonEnv("HERDR_PLUGIN_CONTEXT_JSON");
const event = readJsonEnv("HERDR_PLUGIN_EVENT_JSON");
debugWrite("last-invocation.json", { argv: process.argv, context, event });

await main();

async function main() {
  const paneId =
    event?.data?.pane_id ?? event?.pane_id ?? process.env.HERDR_PANE_ID ?? context.pane_id;
  if (!paneId) {
    console.error("no pane id in the event");
    return;
  }
  const eventStatus = lower(event?.data?.agent_status ?? event?.agent_status);
  if (!testMode && !config.statuses.includes(eventStatus)) {
    return;
  }

  // Wait like the built-in toast: send only when the state is stable.
  if (!testMode && config.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, config.delayMs));
  }

  const pane = herdr(["pane", "get", paneId])?.pane;
  if (!pane) {
    console.error(`pane ${paneId} not found`);
    return;
  }
  const status = testMode ? lower(pane.agent_status) : eventStatus;
  if (!testMode && lower(pane.agent_status) !== status) {
    return;
  }

  const workspace = herdr(["workspace", "list"])?.workspaces?.find(
    (item) => item.workspace_id === pane.workspace_id,
  );
  const tab = herdr(["tab", "list", "--workspace", pane.workspace_id])?.tabs?.find(
    (item) => item.tab_id === pane.tab_id,
  );
  if (!testMode && !config.whenFocused && workspace?.focused && tab?.focused) {
    return;
  }

  const agent = pane.agent || event?.data?.agent || "agent";
  let message;
  try {
    message = lastAgentMessage(agent, pane.agent_session, status);
  } catch (error) {
    console.error(`cannot read transcript: ${error.message}`);
  }

  const title = `${agent} ${statusText(status)}`;
  const location = formatLocation(workspace, tab, {
    showWorkspaceNumber: config.showWorkspaceNumber,
    separator: config.locationSeparator,
  });
  const summary = message ? truncate(cleanMarkdown(message), config.maxChars) : "";
  const body = formatBody(location, summary, config.locationSuffix);

  if (isDuplicate(paneId, status, body)) {
    return;
  }
  send({ paneId, status, title, body });
}

function send({ paneId, status, title, body }) {
  const backend = config.backend === "auto" ? autoBackend() : config.backend;
  if (backend === "notify-send") {
    sendNotifySend({ paneId, status, title, body });
  } else if (backend === "osascript") {
    run("osascript", [
      "-e",
      `display notification ${appleString(body)} with title ${appleString(config.appName)} subtitle ${appleString(title)}`,
    ]);
  } else {
    // Uses the [ui.toast] delivery of Herdr. Herdr cuts the body to 240 characters.
    herdr(["notification", "show", title, "--body", body.replace(/\n/g, " — ")]);
  }
}

function sendNotifySend({ paneId, status, title, body }) {
  // Replace the previous notification of the same pane, so only one stays on screen.
  const ids = readState("notification-ids.json", {});
  const args = ["--app-name", config.appName, "--print-id"];
  args.push("--urgency", status === "blocked" ? config.urgencyBlocked : "normal");
  if (config.icon) {
    args.push("--icon", config.icon);
  }
  if (ids[paneId]) {
    args.push("--replace-id", String(ids[paneId]));
  }
  args.push("--", title, escapeMarkup(body));
  const result = run("notify-send", args);
  const id = Number.parseInt(result?.stdout ?? "", 10);
  if (Number.isFinite(id)) {
    ids[paneId] = id;
    writeState("notification-ids.json", ids);
  }
}

function autoBackend() {
  if (process.platform === "darwin") {
    return "osascript";
  }
  if (process.platform === "linux" && hasCommand("notify-send")) {
    return "notify-send";
  }
  return "herdr";
}

function statusText(status) {
  if (status === "done") return "finished";
  if (status === "blocked") return "needs input";
  return status || "updated";
}

// Notification servers parse a small subset of markup in the body.
function escapeMarkup(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function appleString(text) {
  return `"${String(text).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function isDuplicate(paneId, status, body) {
  const last = readState("last-sent.json", {});
  const key = `${status}\n${body}`;
  const now = Date.now();
  if (last[paneId]?.key === key && now - last[paneId].at < 10_000) {
    return true;
  }
  last[paneId] = { key, at: now };
  writeState("last-sent.json", last);
  return false;
}

function herdr(args) {
  const result = run(herdrBin, args);
  if (!result || result.status !== 0) {
    return undefined;
  }
  try {
    return JSON.parse(result.stdout).result;
  } catch {
    return undefined;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 10_000 });
  if (result.error) {
    console.error(`${command} failed to start: ${result.error.message}`);
    return undefined;
  }
  if (result.status !== 0) {
    console.error(`${command} ${args[0]} exited ${result.status}: ${result.stderr?.trim()}`);
  }
  return result;
}

function hasCommand(command) {
  return (process.env.PATH ?? "")
    .split(":")
    .some((dir) => dir && existsSync(join(dir, command)));
}

function readState(name, fallback) {
  if (!stateDir) return fallback;
  try {
    return JSON.parse(readFileSync(join(stateDir, name), "utf8"));
  } catch {
    return fallback;
  }
}

function writeState(name, value) {
  if (!stateDir) return;
  try {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, name), JSON.stringify(value));
  } catch (error) {
    console.error(`cannot write state ${name}: ${error.message}`);
  }
}

function debugWrite(name, value) {
  if (config.debug) writeState(name, value);
}

function readJsonEnv(name) {
  try {
    return JSON.parse(process.env[name] || "{}") ?? {};
  } catch {
    return {};
  }
}

function lower(value) {
  return typeof value === "string" ? value.toLowerCase() : undefined;
}

function listEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw?.trim()) return fallback;
  return raw.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function intEnv(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function flagEnv(name, fallback) {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return !["0", "false", "no", "off"].includes(raw);
}

function loadDotEnv(path) {
  if (!path || !existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    const equals = line.indexOf("=");
    if (!line || line.startsWith("#") || equals === -1) continue;
    const key = line.slice(0, equals).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = line.slice(equals + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  }
}
