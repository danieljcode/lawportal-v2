// A Win95 window around a native <dialog> (design §UI components: Dialog).
//
// `open` drives showModal()/close(). The native `close` event (Esc, or the
// title-bar ✕) reports back through onClose. A close caused by `open` turning
// false is not reported, so switching from one dialog to another never closes
// the new one. The contents mount only while open, so each opening starts fresh.

import { useEffect, useRef, type ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onClose(): void;
  /** id of the title element (aria-labelledby). */
  titleId: string;
  title: ReactNode;
  id?: string;
  className?: string;
  children?: ReactNode;
}

export default function Dialog({ open, onClose, titleId, title, id, className, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    openRef.current = open;
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      // jsdom (tests) has no showModal; the attribute keeps the contents visible there.
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
    } else if (!open && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onNativeClose = () => {
      if (openRef.current) onCloseRef.current();
    };
    el.addEventListener("close", onNativeClose);
    return () => el.removeEventListener("close", onNativeClose);
  }, []);

  const close = () => {
    const el = ref.current;
    if (el && typeof el.close === "function") el.close();
    else onCloseRef.current();
  };

  return (
    <dialog ref={ref} id={id} className={className} aria-labelledby={titleId}>
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" data-close="" aria-label="Close" title="Close" onClick={close}>
          ✕
        </button>
      </div>
      {open && <div className="dialog-body">{children}</div>}
    </dialog>
  );
}
