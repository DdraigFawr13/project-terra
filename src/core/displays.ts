// Which screen the player window goes on. Pure, so it can be tested without Electron.

export type DisplayInfo = {
  id: number;
  label: string;
  width: number;
  height: number;
  /** Windows' main display. */
  primary: boolean;
  /** A built-in screen, such as the laptop's own panel. */
  internal: boolean;
};

/** The laptop's own screen is the built-in one. If no screen reports itself as built-in, it is Windows' main display. */
function isLaptop(d: DisplayInfo, all: DisplayInfo[]): boolean {
  return all.some((x) => x.internal) ? d.internal : d.primary;
}

/** The laptop's own screen, where the DM window belongs. */
export function laptopDisplay(displays: DisplayInfo[]): DisplayInfo | null {
  return displays.find((d) => isLaptop(d, displays)) ?? displays[0] ?? null;
}

/** The chosen display if it is connected, otherwise the first screen that isn't the laptop's own. */
export function choosePlayerDisplay(displays: DisplayInfo[], preferredId: number | null): DisplayInfo | null {
  const preferred = displays.find((d) => d.id === preferredId);
  if (preferred) return preferred;
  return displays.find((d) => !isLaptop(d, displays)) ?? null;
}

/**
 * Where the table window goes. Fullscreen only on a screen other than the laptop's, so the table never covers the
 * DM window. `surfaceKey` names what the table is drawn on, so each projector keeps its own calibration.
 */
export type Placement = { display: DisplayInfo | null; fullscreen: boolean; surfaceKey: string };

export function playerPlacement(displays: DisplayInfo[], preferredId: number | null): Placement {
  const display = choosePlayerDisplay(displays, preferredId);
  const fullscreen = !!display && !isLaptop(display, displays);
  return { display, fullscreen, surfaceKey: fullscreen ? `display:${display.id}` : "window" };
}

/** A screen's name in the DM's picker: the laptop by what it is, short enough not to be cut off in the panel. */
export function describeDisplay(d: DisplayInfo, all: DisplayInfo[]): string {
  if (isLaptop(d, all)) return "This laptop, in a window";
  return `${d.label || `Screen ${d.id}`} (${d.width} × ${d.height})`;
}
