import { cn } from '@yet-to-be/ui';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import { useAdminSession, useCan } from '../app/access';
import { SECTIONS } from '../app/registry';

export function AdminLayout() {
  const { t } = useTranslation();
  const session = useAdminSession();
  const can = useCan();
  const sections = SECTIONS.filter((section) => can(...section.permissions));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[14rem_1fr]">
      <aside className="bg-slate-900 p-4 text-slate-100">
        <p className="mb-6 text-sm font-semibold">{t('app.title')}</p>
        <nav aria-label={t('app.title')}>
          <ul className="space-y-1">
            {sections.map((section) => (
              <li key={section.path}>
                <NavLink
                  to={section.path}
                  end={section.path === '/'}
                  className={({ isActive }) =>
                    cn(
                      'block rounded px-3 py-2 text-sm',
                      isActive ? 'bg-slate-700 text-white' : 'text-slate-300 hover:bg-slate-800',
                    )
                  }
                >
                  {t(`nav.${section.label}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <div>
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3 text-sm">
          <span>
            {t('app.signedInAs')} <strong>{session.data?.user.displayName}</strong>
          </span>
          <a className="text-indigo-700 underline" href="/">
            {t('app.toSite')}
          </a>
        </header>
        <main className="space-y-6 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
