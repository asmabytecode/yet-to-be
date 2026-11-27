import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200', className)} {...props} />;
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center justify-center p-8 text-slate-600">
      {label}
    </div>
  );
}
