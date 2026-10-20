// A program's menu bar (LP-103): File, View, Help and any of its own, in the
// Windows 3.x style. One menu opens at a time; Esc or a click elsewhere closes
// it, the arrow keys move between items and menus, and an item either runs an
// action or follows a link.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export type MenuItem =
  | {
      label: string;
      /** Run on choosing it; or `href` to follow a link. */
      onSelect?(): void;
      href?: string;
      id?: string;
      disabled?: boolean;
      /** Ticked (a radio-like choice, such as the theme). */
      checked?: boolean;
    }
  | "-";

export interface Menu {
  label: string;
  items: MenuItem[];
}

export default function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  // A click anywhere else closes the open menu.
  useEffect(() => {
    if (open === null) return;
    const away = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);

  // Opening a menu puts the focus on its first item.
  useEffect(() => {
    if (open === null) return;
    bar.current
      ?.querySelector<HTMLElement>(`[data-menu="${open}"] [role^="menuitem"]:not([aria-disabled="true"])`)
      ?.focus();
  }, [open]);

  const close = (refocus: boolean) => {
    const was = open;
    setOpen(null);
    if (refocus && was !== null) bar.current?.querySelector<HTMLElement>(`[data-top="${was}"]`)?.focus();
  };

  const onMenuKey = (e: KeyboardEvent<HTMLElement>, i: number) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const moveTo = (n: number) => items[(n + items.length) % items.length]?.focus();
    if (e.key === "Escape") close(true);
    else if (e.key === "ArrowDown") moveTo(at + 1);
    else if (e.key === "ArrowUp") moveTo(at - 1);
    else if (e.key === "Home") moveTo(0);
    else if (e.key === "End") moveTo(items.length - 1);
    else if (e.key === "ArrowRight") setOpen((i + 1) % menus.length);
    else if (e.key === "ArrowLeft") setOpen((i - 1 + menus.length) % menus.length);
    else return;
    e.preventDefault();
  };

  return (
    <div className="menu-bar" role="menubar" ref={bar}>
      {menus.map((m, i) => (
        <div className="menu" key={m.label}>
          <button
            type="button"
            className={"menu-top" + (open === i ? " open" : "")}
            id={"menu-" + m.label.toLowerCase()}
            data-top={i}
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            // Moving along the bar while a menu is open opens the next one, as in Windows.
            onPointerEnter={() => open !== null && open !== i && setOpen(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setOpen(i);
              }
            }}
          >
            {m.label}
          </button>
          {open === i && (
            <ul className="menu-list" role="menu" aria-label={m.label} data-menu={i} onKeyDown={(e) => onMenuKey(e, i)}>
              {m.items.map((item, j) =>
                item === "-" ? (
                  <li key={j} className="menu-sep" role="separator" />
                ) : (
                  <li key={j} role="none">
                    {item.href && !item.disabled ? (
                      <a
                        href={item.href}
                        id={item.id}
                        role={item.checked === undefined ? "menuitem" : "menuitemradio"}
                        aria-checked={item.checked}
                        tabIndex={-1}
                        onClick={() => close(false)}
                      >
                        {item.label}
                      </a>
                    ) : (
                      <button
                        type="button"
                        id={item.id}
                        role={item.checked === undefined ? "menuitem" : "menuitemradio"}
                        aria-checked={item.checked}
                        aria-disabled={item.disabled || undefined}
                        tabIndex={-1}
                        onClick={() => {
                          if (item.disabled) return;
                          close(false);
                          item.onSelect?.();
                        }}
                      >
                        {item.label}
                      </button>
                    )}
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
