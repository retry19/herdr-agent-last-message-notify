# Agent last message notify

This Herdr plugin adds the last message of the agent to the desktop notification. Herdr shows only the agent, the state, and the location of the pane. This plugin also shows what the agent said.

```text
claude finished
shop · 2 · feat-login
All tests pass. The login fix is ready for review.
```

## How it works

1. Herdr starts `notify.mjs` on each `pane.agent_status_changed` event.
2. The plugin waits `NOTIFY_DELAY_MS`. If the pane is in a different state after this time, the plugin stops.
3. The plugin reads the session reference of the agent from `herdr pane get`.
4. The plugin reads the end of the session transcript and finds the last message.
5. The plugin sends the notification. A new notification for a pane replaces the old notification for the same pane.

The plugin reads these transcripts:

| Agent | Transcript | Message |
|---|---|---|
| `claude` | `~/.claude/projects/*/<session-id>.jsonl` | The last assistant text. If the agent needs input, the pending tool call or question. |
| `codex` | `~/.codex/sessions/YYYY/MM/DD/rollout-*-<session-id>.jsonl` | `last_agent_message` of `task_complete`, or the last assistant message. |

For other agents, the notification shows the location of the pane only.

The plugin does not send a notification for the pane that you look at now. Herdr does the same for its own toasts.

## Prerequisites

- Herdr 0.9.0 or later
- Node.js 18 or later
- On Linux: `notify-send` (package `libnotify-bin` or `libnotify`)

## Install the plugin

1. Install the plugin from GitHub:

   ```bash
   herdr plugin install retry19/herdr-agent-last-message-notify
   ```

2. Download the example configuration to the config directory of the plugin:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/retry19/herdr-agent-last-message-notify/master/.env.example \
     -o "$(herdr plugin config-dir agent-last-message-notify)/.env"
   ```

3. Disable the toasts of Herdr in `~/.config/herdr/config.toml`:

   ```toml
   [ui.toast]
   delivery = "off"
   ```

4. Reload the configuration:

   ```bash
   herdr server reload-config
   ```

If you do not do step 3, you get two notifications for each event. The sounds of Herdr do not change.

To get the latest version of the plugin, run the following command:

```bash
herdr plugin update agent-last-message-notify
```

### Install from a local clone

Use this procedure to change the code of the plugin.

1. Clone the repository:

   ```bash
   git clone git@github.com:retry19/herdr-agent-last-message-notify.git
   cd herdr-agent-last-message-notify
   ```

2. Link the plugin directory:

   ```bash
   herdr plugin link .
   ```

3. Copy the example configuration:

   ```bash
   cp .env.example "$(herdr plugin config-dir agent-last-message-notify)/.env"
   ```

4. Do steps 3 and 4 of the procedure above.

Herdr does not install a plugin over a linked plugin with the same ID. Before you install from GitHub, run `herdr plugin unlink agent-last-message-notify`.

## Test the plugin

To send a notification for the focused pane, run the following command:

```bash
herdr plugin action invoke test --plugin agent-last-message-notify
```

To see the logs of the plugin, run the following command:

```bash
herdr plugin log list --plugin agent-last-message-notify
```

To run the unit tests, run the following command:

```bash
npm test
```

## Configuration

Set these variables in `.env` in the config directory of the plugin.

| Variable | Description | Default |
|---|---|---|
| `NOTIFY_STATUSES` | The agent states that send a notification. | `done,blocked` |
| `NOTIFY_DELAY_MS` | The wait time before the notification, in milliseconds. | `1000` |
| `NOTIFY_MAX_CHARS` | The maximum length of the message. `0` shows the full message. | `300` |
| `NOTIFY_WHEN_FOCUSED` | `1` also sends a notification for the focused pane. | `0` |
| `NOTIFY_TITLE_CASE` | The case of the title. `none` keeps the title as it is. `title` makes the first letter of each word uppercase. | `none` |
| `NOTIFY_SHOW_WORKSPACE_NUMBER` | `1` shows the workspace number between the workspace label and the tab label. `0` hides it. | `1` |
| `NOTIFY_LOCATION_SEPARATOR` | The text between the parts of the location line. Use quotes to keep spaces, for example `" · "`. | `" · "` |
| `NOTIFY_LOCATION_SUFFIX` | The text after the location line, for example `:`. The plugin adds it only when a message follows. | empty |
| `NOTIFY_BACKEND` | `auto`, `notify-send`, `osascript`, or `herdr`. | `auto` |
| `NOTIFY_APP_NAME` | The application name for `notify-send`. | `Herdr` |
| `NOTIFY_ICON` | The icon name or path for `notify-send`. | empty |
| `NOTIFY_URGENCY_BLOCKED` | The urgency for `notify-send` when the agent needs input. | `critical` |
| `NOTIFY_CLICK_TO_FOCUS` | `1` focuses the pane of the agent in Herdr when you click the notification. Linux only. | `0` |
| `NOTIFY_CLICK_DESKTOP_ENTRY` | The desktop entry of your terminal, for example `kitty`. On a click, GNOME Shell shows the window of this terminal. Refer to [Click to focus](#click-to-focus). | empty |
| `NOTIFY_CLICK_TIMEOUT_S` | The time in seconds that the plugin waits for a click. `0` waits until the notification closes. | `600` |
| `NOTIFY_DEBUG` | `1` writes the last event to `last-invocation.json` in the state directory. | `0` |

The `herdr` backend uses `herdr notification show`. This backend uses the `[ui.toast]` delivery of Herdr, and Herdr cuts the body to 240 characters. Thus, do not set `delivery = "off"` with this backend.

Examples of the title:

| Configuration | Result |
|---|---|
| Default | `claude finished` |
| `NOTIFY_TITLE_CASE=title` | `Claude Finished` |

Examples of the location line:

| Configuration | Result |
|---|---|
| Default | `shop · 2 · feat-login` |
| `NOTIFY_LOCATION_SEPARATOR=/` | `shop/2/feat-login` |
| `NOTIFY_LOCATION_SUFFIX=:` | `shop · 2 · feat-login:` |
| `NOTIFY_SHOW_WORKSPACE_NUMBER=0` | `shop · feat-login` |

## Click to focus

If `NOTIFY_CLICK_TO_FOCUS=1`, a click on the notification focuses the pane of the agent. The plugin runs `herdr agent focus <pane-id>`. Herdr then shows the workspace and the tab of the pane, and marks the agent as seen.

To also show the window of your terminal on a click, set `NOTIFY_CLICK_DESKTOP_ENTRY` to the desktop entry of your terminal. To find the desktop entry, run the following command:

```bash
ls /usr/share/applications ~/.local/share/applications | grep -i <terminal-name>
```

Use the file name without `.desktop`, for example `kitty`.

The plugin uses one of these tools to make a notification that you can click:

1. `gjs` with `dbus-notify.js`, if `gjs` is available. GNOME installs `gjs`.
2. `notify-send --wait` in other conditions. This tool cannot show the window of your terminal.

GNOME Shell sends the click only to the process that sent the notification. Thus the event hook stays open until the notification closes or `NOTIFY_CLICK_TIMEOUT_S` expires.

### Behavior with a desktop entry

GNOME Shell shows the window of an application on a click only if the notification has no default action. Thus, if `NOTIFY_CLICK_DESKTOP_ENTRY` has a value, the notification has no default action. On a click, GNOME Shell shows the terminal and closes the notification. The plugin then focuses the pane in Herdr.

GNOME Shell gives the same close reason for a click and for the close button. Thus the close button also focuses the pane in Herdr, but it does not show the terminal.

If `NOTIFY_CLICK_DESKTOP_ENTRY` is empty, the notification has a default action. A click focuses the pane in Herdr only. The close button does nothing.

## Troubleshooting

### The notification does not show the message

The transcript of the agent is not available. Make sure that `herdr pane get <pane-id>` shows an `agent_session` value. To see the event, set `NOTIFY_DEBUG=1`.

### A click on the notification does nothing

Make sure that `NOTIFY_CLICK_TO_FOCUS=1`. If `gjs` is not available, `notify-send` can show the message "Actions are not supported by this notifications server". In this condition, install `gjs`.

### Each event shows two notifications

The toasts of Herdr are on. To correct the problem, set `delivery = "off"` in `[ui.toast]`.
