# Lessons

One line per mistake. Read the entries for an area before working in it. When a mistake repeats, bump its count; at ×2 it also becomes a rule (in DECISIONS, AGENTS.md, or proposed to AI-Master-Instructions). Mark retired entries SUPERSEDED; never delete them.

Format: `- <area> · <mistake> · <root cause> · <rule> · ×<n> (<YYYY-MM-DD>)`

- windows · Choosing the laptop's own screen for the table would have put the fullscreen table window over the DM window · placement only checked that a display existed · the table window is fullscreen only on a non-primary screen (`playerPlacement`) · ×1 (2026-10-28)
- e2e · read a page attribute once instead of waiting for it · the table shows "curtain" until its state arrives, so a slow start could fail the check · in e2e, wait for state (`waitForFunction`), never read it once · ×1 (2026-10-28)
