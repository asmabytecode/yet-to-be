import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Field, FormError } from '@yet-to-be/ui';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi, keys } from '../../api/admin-api';
import { errorMessage } from '../../shared-errors';

/**
 * Увімкнення TOTP: ключ (вручну або otpauth-посилання) → код → резервні коди показуються ОДИН
 * раз. QR-код не генеруємо, щоб не тягнути бібліотеку в адмінку (ADR 0008).
 */
export function MfaSetup({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);

  const setup = useMutation({ mutationFn: adminApi.mfa.setup });
  const enable = useMutation({
    mutationFn: () => adminApi.mfa.enable(code),
    onSuccess: (result) => {
      setRecovery(result.recoveryCodes);
    },
  });

  if (recovery !== null) {
    return (
      <Card className="space-y-4">
        <h2 className="text-lg font-semibold">{t('mfa.recoveryTitle')}</h2>
        <p className="text-sm text-slate-700">{t('mfa.recoveryText')}</p>
        <ul
          className="grid grid-cols-2 gap-2 font-mono text-sm"
          aria-label={t('mfa.recoveryTitle')}
        >
          {recovery.map((item) => (
            <li key={item} className="rounded bg-slate-100 px-2 py-1">
              {item}
            </li>
          ))}
        </ul>
        <Button
          onClick={() => {
            void client.invalidateQueries({ queryKey: keys.mfa });
            onDone?.();
          }}
        >
          {t('mfa.recoveryDone')}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">{t('mfa.setupTitle')}</h2>
      <p className="text-sm text-slate-700">{t('mfa.setupText')}</p>
      {setup.data === undefined ? (
        <Button
          disabled={setup.isPending}
          onClick={() => {
            setup.mutate();
          }}
        >
          {t('mfa.start')}
        </Button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            enable.mutate();
          }}
        >
          {/* QR малюється локально як SVG (без запитів назовні й без inline-стилів — CSP не страждає). */}
          <div className="flex justify-center">
            <QRCodeSVG
              value={setup.data.otpauthUri}
              size={192}
              level="M"
              marginSize={2}
              title={t('mfa.qr')}
              role="img"
              aria-label={t('mfa.qr')}
            />
          </div>
          <Field label={t('mfa.secret')} value={setup.data.secret} readOnly className="font-mono" />
          <Field
            label={t('mfa.uri')}
            value={setup.data.otpauthUri}
            readOnly
            className="font-mono text-xs"
          />
          <Field
            label={t('mfa.code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
          />
          <FormError message={enable.error === null ? null : errorMessage(enable.error)} />
          <Button type="submit" disabled={enable.isPending || code.trim() === ''}>
            {t('mfa.enable')}
          </Button>
        </form>
      )}
      <FormError message={setup.error === null ? null : errorMessage(setup.error)} />
    </Card>
  );
}
