import { Card } from '@yet-to-be/ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <Card className="mx-auto max-w-md space-y-3 text-center">
      <h1 className="text-xl font-semibold">{t('gate.notFound')}</h1>
      <Link className="text-sm text-indigo-700 underline" to="/">
        {t('nav.dashboard')}
      </Link>
    </Card>
  );
}
