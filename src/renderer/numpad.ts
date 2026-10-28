// A number pad (D-028): pick who, tap the amount, tap an action such as Damage or Heal. No typing, so a finger or the
// pen is enough. Initiative uses it too, with a sign for negative rolls (D-032).

/** `zeroOk`: the action is allowed with an amount of 0 (temp HP to none, a roll of 0). */
export type PadAction = { label: string; kind: string; className: string; zeroOk?: boolean };

export type Numpad = {
  el: HTMLElement;
  /** Who the next action is for, shown beside the amount; null disables the actions. */
  setTarget: (label: string | null) => void;
};

const MAX = 999;

export function numpad(actions: PadAction[], onAct: (kind: string, amount: number) => void, opts: { signed?: boolean } = {}): Numpad {
  let amount = 0;
  let negative = false;
  let target: string | null = null;
  const el = document.createElement("div");
  el.className = "pad";
  const show = document.createElement("output");
  show.className = "pad-show";
  const who = document.createElement("span");
  const num = document.createElement("b");
  show.append(who, num);
  el.append(show);
  /** The bottom row: the actions (and a sign key), sharing the full width equally. */
  const row = document.createElement("div");
  row.className = "pad-acts";
  const key = (label: string, cls: string, aria: string, press: () => void, parent: HTMLElement = el) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `k ${cls}`;
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    b.addEventListener("click", press);
    parent.append(b);
    return b;
  };
  for (const d of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"])
    key(d, "digit", d, () => {
      amount = Math.min(MAX, amount * 10 + Number(d));
      render();
    });
  key("⌫", "", "Delete the last digit", () => {
    amount = Math.floor(amount / 10);
    render();
  });
  key("C", "", "Clear the amount", () => {
    amount = 0;
    negative = false;
    render();
  });
  el.append(row);
  if (opts.signed)
    key(
      "±",
      "",
      "Make it negative or positive",
      () => {
        negative = !negative;
        render();
      },
      row,
    );
  const acts = actions.map((a) =>
    key(
      a.label,
      `act ${a.className}`,
      a.label,
      () => {
        if (!target || (amount === 0 && !a.zeroOk)) return;
        onAct(a.kind, negative ? -amount : amount);
        amount = 0;
        negative = false;
        render();
      },
      row,
    ),
  );
  function render(): void {
    who.textContent = target ?? "Pick who";
    num.textContent = `${negative ? "−" : ""}${amount}`;
    acts.forEach((b, i) => (b.disabled = !target || (amount === 0 && !actions[i]!.zeroOk)));
  }
  render();
  return {
    el,
    setTarget: (t) => {
      // An amount typed for one creature never lands on another.
      if (t !== target) [amount, negative] = [0, false];
      target = t;
      render();
    },
  };
}
