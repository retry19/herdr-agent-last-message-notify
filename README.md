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

1. Link the plugin directory:

   ```bash
   herdr plugin link /path/to/herdr-descriptive-notification
   ```

2. Copy the example configuration:

   ```bash
   cp .env.example "$(herdr plugin config-dir agent-last-message-notify)/.env"
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
| `NOTIFY_SHOW_WORKSPACE_NUMBER` | `1` shows the workspace number between the workspace label and the tab label. `0` hides it. | `1` |
| `NOTIFY_LOCATION_SEPARATOR` | The text between the parts of the location line. Use quotes to keep spaces, for example `" · "`. | `" · "` |
| `NOTIFY_LOCATION_SUFFIX` | The text after the location line, for example `:`. The plugin adds it only when a message follows. | empty |
| `NOTIFY_BACKEND` | `auto`, `notify-send`, `osascript`, or `herdr`. | `auto` |
| `NOTIFY_APP_NAME` | The application name for `notify-send`. | `Herdr` |
| `NOTIFY_ICON` | The icon name or path for `notify-send`. | empty |
| `NOTIFY_URGENCY_BLOCKED` | The urgency for `notify-send` when the agent needs input. | `critical` |
| `NOTIFY_DEBUG` | `1` writes the last event to `last-invocation.json` in the state directory. | `0` |

The `herdr` backend uses `herdr notification show`. This backend uses the `[ui.toast]` delivery of Herdr, and Herdr cuts the body to 240 characters. Thus, do not set `delivery = "off"` with this backend.

Examples of the location line:

| Configuration | Result |
|---|---|
| Default | `shop · 2 · feat-login` |
| `NOTIFY_LOCATION_SEPARATOR=/` | `shop/2/feat-login` |
| `NOTIFY_LOCATION_SUFFIX=:` | `shop · 2 · feat-login:` |
| `NOTIFY_SHOW_WORKSPACE_NUMBER=0` | `shop · feat-login` |

## Troubleshooting

### The notification does not show the message

The transcript of the agent is not available. Make sure that `herdr pane get <pane-id>` shows an `agent_session` value. To see the event, set `NOTIFY_DEBUG=1`.

### Each event shows two notifications

The toasts of Herdr are on. To correct the problem, set `delivery = "off"` in `[ui.toast]`.
