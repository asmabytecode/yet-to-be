import { useTranslation } from 'react-i18next';
import { useSession } from '../features/auth/use-session';
import { LinkedAccounts } from '../features/profile/linked-accounts';
import { PasswordForm } from '../features/profile/password-form';
import { ProfileForm } from '../features/profile/profile-form';
import { SessionsList } from '../features/profile/sessions-list';
import { Card } from '../shared/ui/card';

export function ProfilePage() {
  const { t } = useTranslation();
  const { data: user } = useSession();
  if (user === null || user === undefined) return null; // ProtectedRoute гарантує користувача

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('profile.title')}</h1>
      <Card aria-labelledby="profile-data">
        <h2 id="profile-data" className="mb-4 text-lg font-semibold">
          {t('profile.data')}
        </h2>
        <ProfileForm key={user.id} user={user} />
      </Card>
      <Card aria-labelledby="profile-password">
        <h2 id="profile-password" className="mb-4 text-lg font-semibold">
          {t('profile.password')}
        </h2>
        <PasswordForm
          key={String(user.providers.includes('password'))}
          hasPassword={user.providers.includes('password')}
        />
      </Card>
      <Card aria-labelledby="profile-accounts">
        <h2 id="profile-accounts" className="mb-4 text-lg font-semibold">
          {t('profile.accounts')}
        </h2>
        <LinkedAccounts user={user} />
      </Card>
      <Card aria-labelledby="profile-sessions">
        <h2 id="profile-sessions" className="mb-4 text-lg font-semibold">
          {t('profile.sessions')}
        </h2>
        <SessionsList />
      </Card>
    </>
  );
}
