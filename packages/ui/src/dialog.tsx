import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from './button';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Кнопки внизу; якщо не задано — лише «Закрити». */
  actions?: ReactNode;
  closeLabel?: string;
}

/**
 * Модальне вікно без бібліотек: role=dialog + aria-modal, фокус переходить усередину,
 * Esc закриває, після закриття фокус повертається туди, де був. Без inline-стилів (CSP).
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  actions,
  closeLabel = 'Закрити',
}: DialogProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // Останній onClose у ref: інакше inline-функція батька перезапускала б ефект на кожен рендер
  // і фокус стрибав би з поля, у яке користувач саме друкує.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = panel.current?.querySelector<HTMLElement>(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    );
    (first ?? panel.current)?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-lg space-y-4 rounded-lg bg-white p-6 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <div className="space-y-3">{children}</div>
        <div className="flex justify-end gap-2">
          {actions ?? (
            <Button variant="secondary" onClick={onClose}>
              {closeLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Для руйнівних дій: користувач має ввести це слово, щоб підтвердити. */
  typeToConfirm?: string | undefined;
  typeToConfirmLabel?: string;
  pending?: boolean;
}

/** Підтвердження дії. Руйнівні дії вимагають ввести назву — випадковий клік нічого не зламає. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  typeToConfirm,
  typeToConfirmLabel,
  pending = false,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const ready = typeToConfirm === undefined || typed.trim() === typeToConfirm;
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant="danger" disabled={!ready || pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-700">{description}</p>
      {typeToConfirm === undefined ? null : (
        <div className="space-y-1">
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
            {typeToConfirmLabel ?? typeToConfirm}
          </label>
          <input
            id={inputId}
            value={typed}
            autoComplete="off"
            onChange={(event) => {
              setTyped(event.target.value);
            }}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      )}
    </Dialog>
  );
}
