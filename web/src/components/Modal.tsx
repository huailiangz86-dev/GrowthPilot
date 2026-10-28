import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Native dialogs keep background controls inert and contain keyboard focus. */
export default function Modal({ children, label, className, onClose, initialFocus }: { children: ReactNode; label: string; className?: string; onClose: () => void; initialFocus?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    dialog.querySelector<HTMLElement>(initialFocus ?? 'textarea:not([disabled])')?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [initialFocus]);
  return <dialog ref={ref} className={className} aria-label={label} onCancel={event => { event.preventDefault(); onClose(); }}>{children}</dialog>;
}
