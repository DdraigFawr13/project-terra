// Which screen the player window goes on. Pure, so it can be tested without Electron.

export type DisplayInfo = {
  id: number;
  label: string;
  width: number;
  height: number;
  primary: boolean;
};

/** The chosen display if it is connected, otherwise the first screen that isn't the laptop's own. */
export function choosePlayerDisplay(displays: DisplayInfo[], preferredId: number | null): DisplayInfo | null {
  const preferred = displays.find((d) => d.id === preferredId);
  if (preferred) return preferred;
  return displays.find((d) => !d.primary) ?? null;
}

export type Placement = { display: DisplayInfo | null; fullscreen: boolean };

/** Fullscreen only on a screen other than the laptop's, so the table never covers the DM window. */
export function playerPlacement(displays: DisplayInfo[], preferredId: number | null): Placement {
  const display = choosePlayerDisplay(displays, preferredId);
  return { display, fullscreen: !!display && !display.primary };
}

export function describeDisplay(d: DisplayInfo): string {
  const name = d.label || `Screen ${d.id}`;
  return `${name} (${d.width} × ${d.height})${d.primary ? ", this laptop" : ""}`;
}
