import { useTranslation } from 'react-i18next';
import { RegisterForm } from '../features/auth/register-form';
import { Card } from '../shared/ui/card';

export function RegisterPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <Card>
        <h1 className="mb-4 text-2xl font-semibold">{t('auth.registerTitle')}</h1>
        <RegisterForm />
      </Card>
    </main>
  );
}
