import { useTranslation } from 'react-i18next';
import { linkButtonClass } from '../../shared/ui/button';

/** Повна навігація (не fetch): OAuth-редірект іде через браузер, cookies виставляє сервер. */
export function GoogleButton({ returnTo = '/', label }: { returnTo?: string; label?: string }) {
  const { t } = useTranslation();
  return (
    <a
      href={`/api/v1/auth/google?returnTo=${encodeURIComponent(returnTo)}`}
      className={`${linkButtonClass()} w-full`}
    >
      {label ?? t('auth.google')}
    </a>
  );
}
