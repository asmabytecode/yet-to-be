import { useInfiniteQuery } from '@tanstack/react-query';
import type { PublicEventSummary } from '@yet-to-be/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { eventsApi, EVENTS_KEY, formatEventDate } from '../features/events/api';
import { errorMessage } from '../shared/api/errors';
import { Button } from '../shared/ui/button';
import { Card, Spinner } from '../shared/ui/card';

function EventCard({ event }: { event: PublicEventSummary }) {
  const { t } = useTranslation();
  return (
    <Card className="flex gap-4">
      {event.cover?.thumb === undefined ? null : (
        <img
          src={event.cover.thumb}
          alt=""
          className="h-24 w-32 shrink-0 rounded object-cover"
          loading="lazy"
        />
      )}
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">
          <Link to={`/events/${event.slug}`} className="text-indigo-800 hover:underline">
            {event.title}
          </Link>
        </h2>
        <p className="text-sm text-slate-700">{formatEventDate(event.startsAt, event.timezone)}</p>
        <p className="text-sm text-slate-600">
          {[event.venueName, event.online ? t('events.online') : null].filter(Boolean).join(' · ')}
        </p>
        {event.summary === null ? null : <p className="text-sm text-slate-800">{event.summary}</p>}
      </div>
    </Card>
  );
}

export function EventsPage() {
  const { t } = useTranslation();
  const query = useInfiniteQuery({
    queryKey: EVENTS_KEY,
    queryFn: ({ pageParam }) => eventsApi.list(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('events.title')}</h1>
      {query.isPending ? <Spinner label={t('app.loading')} /> : null}
      {query.isError ? <p role="alert">{errorMessage(query.error)}</p> : null}
      {query.isSuccess && items.length === 0 ? (
        <p className="text-slate-600">{t('events.empty')}</p>
      ) : null}
      <ul className="space-y-4">
        {items.map((event) => (
          <li key={event.id}>
            <EventCard event={event} />
          </li>
        ))}
      </ul>
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={query.isFetchingNextPage}
          onClick={() => {
            void query.fetchNextPage();
          }}
        >
          {t('events.loadMore')}
        </Button>
      ) : null}
    </>
  );
}
