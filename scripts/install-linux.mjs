// Puts the Linux build from `npm run dist:linux` (release/linux-unpacked) in the app grid: a launcher in
// ~/.local/bin and a desktop entry. Run it through `npm run install:linux`, again after each update (D-049).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const app = path.resolve("release/linux-unpacked/project-terra");
if (!fs.existsSync(app)) {
  console.error(`install-linux: ${app} is missing; run npm run dist:linux first`);
  process.exit(1);
}
// Ubuntu blocks the user namespaces Electron's sandbox normally uses, so Electron falls back to the
// chrome-sandbox helper, which must be owned by root with mode 4755. Each build writes it owned by
// the user, and the app then aborts at launch before any window opens (D-049).
const sandbox = path.join(path.dirname(app), "chrome-sandbox");
console.log(`install-linux: making ${sandbox} root-owned setuid (sudo)`);
execFileSync("sudo", ["chown", "root:root", sandbox], { stdio: "inherit" });
execFileSync("sudo", ["chmod", "4755", sandbox], { stdio: "inherit" });
const st = fs.statSync(sandbox);
if (st.uid !== 0 || (st.mode & 0o7777) !== 0o4755) {
  console.error(`install-linux: ${sandbox} is not root-owned with mode 4755; the app will not start`);
  process.exit(1);
}

const home = os.homedir();
const bin = path.join(home, ".local", "bin", "project-terra");
const entry = path.join(process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "applications", "project-terra.desktop");

// XWayland, not native Wayland: Wayland ignores where an app puts a window, so the table window
// couldn't go fullscreen on the projector (D-049).
const launcher = `#!/usr/bin/env bash
# Starts Project Terra. Written by scripts/install-linux.mjs.
exec ${JSON.stringify(app)} --ozone-platform=x11 "$@"
`;
const desktop = `[Desktop Entry]
Type=Application
Name=Project Terra
Comment=Projected tabletop battle map for D&D
Exec=${bin}
Icon=applications-games
Terminal=false
Categories=Game;
StartupWMClass=Project Terra
`;
for (const [file, text, mode] of [
  [bin, launcher, 0o755],
  [entry, desktop, 0o644],
]) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { mode });
  fs.chmodSync(file, mode);
  console.log(`install-linux: wrote ${file}`);
}
