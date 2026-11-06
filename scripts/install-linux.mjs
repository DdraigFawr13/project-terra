// Puts the Linux build from `npm run dist:linux` (release/linux-unpacked) in the app grid: a launcher in
// ~/.local/bin and a desktop entry. Run it through `npm run install:linux`, again after each update (D-049).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const app = path.resolve("release/linux-unpacked/project-terra");
if (!fs.existsSync(app)) {
  console.error(`install-linux: ${app} is missing; run npm run dist:linux first`);
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
