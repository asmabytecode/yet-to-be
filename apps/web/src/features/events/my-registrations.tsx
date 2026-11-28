import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/errors';
import { Spinner } from '../../shared/ui/card';
import { eventsApi, formatEventDate, MY_REGISTRATIONS_KEY } from './api';

/** «Мої записи» в профілі: найближчі події спершу. */
export function MyRegistrations() {
  const { t } = useTranslation();
  const query = useQuery({ queryKey: MY_REGISTRATIONS_KEY, queryFn: eventsApi.mine });
  if (query.isPending) return <Spinner label={t('app.loading')} />;
  if (query.isError) return <p role="alert">{errorMessage(query.error)}</p>;
  if (query.data.items.length === 0)
    return <p className="text-sm text-slate-600">{t('events.mineEmpty')}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {query.data.items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
          <Link
            to={`/events/${item.event.slug}`}
            className="font-medium text-indigo-800 hover:underline"
          >
            {item.event.title}
          </Link>
          <span className="text-sm text-slate-600">
            {formatEventDate(item.event.startsAt, item.event.timezone)}
          </span>
        </li>
      ))}
    </ul>
  );
}
