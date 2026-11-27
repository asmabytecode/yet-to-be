import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

type Variant = 'primary' | 'secondary' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-indigo-700 text-white hover:bg-indigo-800',
  secondary: 'bg-white text-slate-900 ring-1 ring-slate-300 hover:bg-slate-100',
  danger: 'bg-red-700 text-white hover:bg-red-800',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Посилання, стилізоване як кнопка (наприклад, "Увійти через Google" — повна навігація). */
export function linkButtonClass(variant: Variant = 'secondary'): string {
  return cn(
    'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors',
    VARIANTS[variant],
  );
}
