// Turn agent Markdown into short plain text for a notification body.
export function cleanMarkdown(text) {
  return text
    .replace(/```[^\n]*\n?/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function truncate(text, max) {
  if (max <= 0 || text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

// Returns the workspace label, the workspace number, and the tab label,
// joined with the separator. Empty parts are not shown.
export function formatLocation(workspace, tab, { showWorkspaceNumber = true, separator = " · " } = {}) {
  return [workspace?.label, showWorkspaceNumber ? workspace?.number : undefined, tab?.label]
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join(separator);
}

// Returns the notification body. The suffix goes after the location only
// when a message follows it.
export function formatBody(location, message, suffix = "") {
  if (!location) return message || "";
  if (!message) return location;
  return `${location}${suffix}\n${message}`;
}

// Returns the title in the case of the mode. "title" makes the first letter
// of each word uppercase. Other modes return the title with no change.
export function formatTitle(title, mode = "none") {
  if (mode !== "title") return title;
  return title.replace(/(^|\s)(\S)/g, (_, space, letter) => space + letter.toUpperCase());
}
