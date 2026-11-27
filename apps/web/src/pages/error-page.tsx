import { useTranslation } from 'react-i18next';
import { Button } from '../shared/ui/button';

/** Показується замість білого екрана, якщо рендер або lazy-завантаження впали. Деталі помилки не показуємо. */
export function ErrorPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto max-w-md space-y-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">{t('errorPage.title')}</h1>
      <Button
        onClick={() => {
          window.location.reload();
        }}
      >
        {t('errorPage.retry')}
      </Button>
    </main>
  );
}
