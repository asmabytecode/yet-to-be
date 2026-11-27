import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { linkButtonClass } from '../shared/ui/button';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto max-w-md space-y-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
      <Link to="/" className={linkButtonClass('primary')}>
        {t('notFound.back')}
      </Link>
    </main>
  );
}
