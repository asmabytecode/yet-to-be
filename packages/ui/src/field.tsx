import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import type { FieldError } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: FieldError | undefined;
  ref?: Ref<HTMLInputElement>;
}

/** Текст помилки: серверна несе готове повідомлення, клієнтська — тип проблеми zod. */
function messageFor(error: FieldError, t: (key: string) => string): string {
  if (error.type === 'server' && error.message !== undefined && error.message !== '')
    return error.message;
  const key = `validation.${error.type}`;
  const translated = t(key);
  return translated === key ? t('validation.unknown') : translated;
}

/** Поле з підписом і помилкою; помилка зв'язана через aria-describedby й оголошується читачами екрана. */
export function Field({ label, error, id, className, ref, ...props }: FieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const errorId = `${inputId}-error`;
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'block w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm',
          error ? 'border-red-600' : 'border-slate-300',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {messageFor(error, t)}
        </p>
      ) : null}
    </div>
  );
}

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'ref'> {
  label: string;
  error?: FieldError | undefined;
  ref?: Ref<HTMLTextAreaElement>;
}

export function TextAreaField({ label, error, id, className, ref, ...props }: TextAreaProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const errorId = `${inputId}-error`;
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <textarea
        id={inputId}
        ref={ref}
        rows={4}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'block w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm',
          error ? 'border-red-600' : 'border-slate-300',
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {messageFor(error, t)}
        </p>
      ) : null}
    </div>
  );
}

/** Загальна помилка форми (не прив'язана до поля). */
export function FormError({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'ref'> {
  label: string;
  error?: FieldError | undefined;
  ref?: Ref<HTMLSelectElement>;
  children: ReactNode;
}

export function SelectField({ label, error, id, className, ref, children, ...props }: SelectProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const errorId = `${inputId}-error`;
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <select
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'block w-full rounded-md border bg-white px-3 py-2 text-sm shadow-sm',
          error ? 'border-red-600' : 'border-slate-300',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-red-700">
          {messageFor(error, t)}
        </p>
      ) : null}
    </div>
  );
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'ref'> {
  label: string;
  hint?: string;
  ref?: Ref<HTMLInputElement>;
}

export function CheckboxField({ label, hint, id, ref, ...props }: CheckboxProps) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <div className="flex items-start gap-2">
      <input
        id={inputId}
        ref={ref}
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-slate-300"
        {...props}
      />
      <label htmlFor={inputId} className="text-sm text-slate-800">
        {label}
        {hint === undefined ? null : <span className="block text-xs text-slate-500">{hint}</span>}
      </label>
    </div>
  );
}
