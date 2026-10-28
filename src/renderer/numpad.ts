// A number pad for HP (D-028): pick who, tap the amount, tap Damage or Heal. No typing, so a finger or the pen is enough.

export type PadAction = { label: string; kind: string; className: string };

export type Numpad = {
  el: HTMLElement;
  /** Who the next action is for, shown beside the amount; null disables the actions. */
  setTarget: (label: string | null) => void;
};

const MAX = 999;

export function numpad(actions: PadAction[], onAct: (kind: string, amount: number) => void): Numpad {
  let amount = 0;
  let target: string | null = null;
  const el = document.createElement("div");
  el.className = "pad";
  const show = document.createElement("output");
  show.className = "pad-show";
  const who = document.createElement("span");
  const num = document.createElement("b");
  show.append(who, num);
  el.append(show);
  const key = (label: string, cls: string, aria: string, press: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `k ${cls}`;
    b.textContent = label;
    b.setAttribute("aria-label", aria);
    b.addEventListener("click", press);
    el.append(b);
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
    render();
  });
  const acts = actions.map((a) =>
    key(a.label, `act ${a.className}`, a.label, () => {
      if (!target || (amount === 0 && a.kind !== "temp")) return;
      onAct(a.kind, amount);
      amount = 0;
      render();
    }),
  );
  function render(): void {
    who.textContent = target ?? "Pick who";
    num.textContent = String(amount);
    acts.forEach((b, i) => (b.disabled = !target || (amount === 0 && actions[i]!.kind !== "temp")));
  }
  render();
  return {
    el,
    setTarget: (t) => {
      target = t;
      render();
    },
  };
}
