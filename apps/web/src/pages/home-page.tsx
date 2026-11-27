import { useTranslation } from 'react-i18next';
import { useSession } from '../features/auth/use-session';
import { Card } from '../shared/ui/card';

export function HomePage() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  return (
    <Card>
      {/* React екранує текст: displayName безпечно виводити як звичайний вузол */}
      <h1 className="text-2xl font-semibold">{t('home.welcome', { name: user?.displayName ?? '' })}</h1>
      <p className="mt-2 text-slate-600">{t('home.empty')}</p>
    </Card>
  );
}
