// Sends a notification over D-Bus and waits for a click. Runs with gjs.
//
// GNOME Shell sends ActionInvoked only to the connection that sent the
// notification. Thus this script sends and listens on one connection.
//
// Input: one JSON argument with app_name, replaces_id, summary, body,
// urgency (0, 1, or 2), desktop_entry, raise_app, and timeout_s.
// Output: the notification ID on the first line. On a click, the action
// name on the second line.
//
// If raise_app is true, the notification has no default action. On a
// click, GNOME Shell then shows the window of desktop_entry and closes
// the notification. The output is then "dismissed". The close button
// also gives "dismissed", because GNOME Shell gives the same reason.
const { Gio, GLib } = imports.gi;

const NAME = "org.freedesktop.Notifications";
const PATH = "/org/freedesktop/Notifications";

const options = JSON.parse(ARGV[0] || "{}");
const loop = new GLib.MainLoop(null, false);
const bus = Gio.DBus.session;
let id = 0;
let exitCode = 0;

function onSignal(_connection, _sender, _path, _iface, signal, params) {
  const values = params.deep_unpack();
  if (values[0] !== id) {
    return;
  }
  if (signal === "ActionInvoked") {
    print(values[1]);
    loop.quit();
  } else if (signal === "NotificationClosed") {
    // Reason 2 means that the user closed the notification.
    if (values[1] === 2 && options.raise_app) {
      print("dismissed");
    }
    loop.quit();
  }
}

for (const signal of ["ActionInvoked", "NotificationClosed"]) {
  bus.signal_subscribe(NAME, NAME, signal, PATH, null, Gio.DBusSignalFlags.NONE, onSignal);
}

const hints = { urgency: new GLib.Variant("y", options.urgency ?? 1) };
if (options.desktop_entry) {
  hints["desktop-entry"] = new GLib.Variant("s", options.desktop_entry);
}

bus.call(
  NAME,
  PATH,
  NAME,
  "Notify",
  new GLib.Variant("(susssasa{sv}i)", [
    options.app_name || "Herdr",
    options.replaces_id || 0,
    "",
    options.summary || "",
    options.body || "",
    options.raise_app ? [] : ["default", "Open"],
    hints,
    -1,
  ]),
  new GLib.VariantType("(u)"),
  Gio.DBusCallFlags.NONE,
  -1,
  null,
  (connection, result) => {
    try {
      [id] = connection.call_finish(result).deep_unpack();
      print(id);
    } catch (error) {
      printerr(`Notify failed: ${error.message}`);
      exitCode = 1;
      loop.quit();
    }
  },
);

if (options.timeout_s > 0) {
  GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, options.timeout_s, () => {
    loop.quit();
    return GLib.SOURCE_REMOVE;
  });
}

loop.run();
imports.system.exit(exitCode);
