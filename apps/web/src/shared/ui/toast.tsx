import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';

type ToastKind = 'success' | 'error';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}
interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const TTL_MS = 5000;
let nextId = 1;

/** Прості тости без бібліотек і inline-стилів (сумісно зі строгим CSP). Живий регіон оголошується читачами екрана. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++;
    setItems((current) => [...current, { id, kind, message }]);
    setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
    }, TTL_MS);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => {
        push('success', m);
      },
      error: (m) => {
        push('error', m);
      },
    }),
    [push],
  );

  return (
    <ToastContext value={api}>
      {children}
      <div aria-live="polite" className="fixed right-4 bottom-4 z-50 flex flex-col gap-2">
        {items.map((item) => (
          <p
            key={item.id}
            className={cn(
              'rounded-md px-4 py-2 text-sm text-white shadow-lg',
              item.kind === 'success' ? 'bg-emerald-700' : 'bg-red-700',
            )}
          >
            {item.message}
          </p>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const api = use(ToastContext);
  if (api === null) throw new Error('useToast must be used inside ToastProvider');
  return api;
}
