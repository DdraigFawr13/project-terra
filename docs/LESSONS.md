# Lessons

One line per mistake. Read the entries for an area before working in it. When a mistake repeats, bump its count; at ×2 it also becomes a rule (in DECISIONS, AGENTS.md, or proposed to AI-Master-Instructions). Mark retired entries SUPERSEDED; never delete them.

Format: `- <area> · <mistake> · <root cause> · <rule> · ×<n> (<YYYY-MM-DD>)`

- windows · Choosing the laptop's own screen for the table would have put the fullscreen table window over the DM window · placement only checked that a display existed · the table window is fullscreen only on a non-primary screen (`playerPlacement`) · ×1 (2026-10-28)
- windows · `npm run check` failed on every file in a Windows clone though CI passed · git's `core.autocrlf=true` checks out CRLF and Prettier wants LF · `.gitattributes` forces `eol=lf`; test the install on Windows, not only in Linux CI · ×1 (2026-10-28)
- e2e · read a page attribute once instead of waiting for it · the table shows "curtain" until its state arrives, so a slow start could fail the check · in e2e, wait for state (`waitForFunction`), never read it once · ×1 (2026-10-28)
- saves · a display id of -0 passed the integer check but saved as 0, so a saved state didn't load back equal; the property test caught it about 1 run in 10 · `Number.isInteger(-0)` is true and JSON writes -0 as 0 · normalise numbers from patches with `+ 0` before storing · ×2 (2026-10-28; again for a map's quarter turns, now a rule in AGENTS.md)
- ui · cards with `display: grid` ignored the `hidden` attribute, so the import screen, the empty-map card and the map view showed together · an author `display` rule beats the browser's `[hidden]` rule · keep the global `[hidden] { display: none !important }` in each window's CSS, and check every view state in a screenshot · ×1 (2026-10-28)
