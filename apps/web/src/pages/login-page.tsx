import { useTranslation } from 'react-i18next';
import { LoginForm } from '../features/auth/login-form';
import { Card } from '../shared/ui/card';

export function LoginPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <Card>
        <h1 className="mb-4 text-2xl font-semibold">{t('auth.loginTitle')}</h1>
        <LoginForm />
      </Card>
    </main>
  );
}
