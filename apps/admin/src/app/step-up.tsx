import { ERROR_CODES } from '@yet-to-be/shared';
import { Button, Dialog, Field, FormError } from '@yet-to-be/ui';
import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../api/admin-api';
import { errorMessage, isApiError } from '../shared-errors';

type Runner = <T>(action: () => Promise<T>) => Promise<T>;

const StepUpContext = createContext<Runner | null>(null);

/**
 * Критичні дії (ролі, блокування адміна, видалення подій) сервер пропускає лише після свіжого
 * підтвердження. `run(action)`: якщо сервер відповів REAUTH_REQUIRED — показуємо вікно
 * (пароль або TOTP), підтверджуємо й повторюємо ту саму дію один раз.
 */
export function StepUpProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const waiter = useRef<{ resolve: () => void; reject: (reason: unknown) => void } | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setValue('');
    setError(null);
    waiter.current?.reject(new Error('Step-up cancelled'));
    waiter.current = null;
  }, []);

  const confirm = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      if (mode === 'password') await adminApi.mfa.stepUp(value);
      else await adminApi.mfa.verify({ code: value });
      const current = waiter.current;
      waiter.current = null;
      setOpen(false);
      setValue('');
      current?.resolve();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setPending(false);
    }
  };

  const run = useCallback<Runner>(async (action) => {
    try {
      return await action();
    } catch (failure) {
      if (!isApiError(failure, ERROR_CODES.REAUTH_REQUIRED)) throw failure;
      await new Promise<void>((resolve, reject) => {
        waiter.current = { resolve, reject };
        setOpen(true);
      });
      return action();
    }
  }, []);

  const value_ = useMemo(() => run, [run]);
  return (
    <StepUpContext value={value_}>
      {children}
      <Dialog
        open={open}
        title={t('stepUp.title')}
        onClose={close}
        actions={
          <>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={pending || value === ''}
              onClick={() => {
                void confirm();
              }}
            >
              {t('stepUp.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">{t('stepUp.text')}</p>
        {mode === 'password' ? (
          <Field
            label={t('stepUp.password')}
            type="password"
            autoComplete="current-password"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
            }}
          />
        ) : (
          <Field
            label={t('stepUp.code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
            }}
          />
        )}
        <button
          type="button"
          className="text-sm text-indigo-700 underline"
          onClick={() => {
            setMode(mode === 'password' ? 'code' : 'password');
            setValue('');
          }}
        >
          {mode === 'password' ? t('stepUp.useCode') : t('stepUp.usePassword')}
        </button>
        <FormError message={error} />
      </Dialog>
    </StepUpContext>
  );
}

export function useStepUp(): Runner {
  const runner = use(StepUpContext);
  if (runner === null) throw new Error('useStepUp must be used inside StepUpProvider');
  return runner;
}
