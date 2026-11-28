import { useQuery } from '@tanstack/react-query';
import type { PublicEventBlock, PublicEventDto } from '@yet-to-be/shared';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { eventKey, eventsApi, formatEventDate } from '../features/events/api';
import { RegistrationPanel } from '../features/events/registration-panel';
import { errorMessage } from '../shared/api/errors';
import { Card, Spinner } from '../shared/ui/card';
import { SafeMarkdown, safeUrl } from '../shared/ui/markdown';

function ExternalLink({ url, children }: { url: string; children: string }) {
  const href = safeUrl(url);
  if (href === null) return <span>{children}</span>;
  return (
    <a href={href} rel="nofollow noopener noreferrer" className="text-indigo-700 underline">
      {children}
    </a>
  );
}

function Blocks({ blocks }: { blocks: PublicEventBlock[] }) {
  const { t } = useTranslation();
  const agenda = blocks.filter((block) => block.type === 'agenda_item');
  const speakers = blocks.filter((block) => block.type === 'speaker');
  const links = blocks.filter((block) => block.type === 'link');
  const texts = blocks.filter((block) => block.type === 'text');
  return (
    <>
      {texts.map((block, index) => (
        // У публічному DTO блоки без id; порядок фіксований сервером, тож індекс — стабільний ключ.
        <SafeMarkdown key={String(index)}>{block.body}</SafeMarkdown>
      ))}
      {agenda.length === 0 ? null : (
        <section aria-labelledby="agenda" className="space-y-2">
          <h2 id="agenda" className="text-xl font-semibold">
            {t('events.agenda')}
          </h2>
          <ol className="space-y-2">
            {agenda.map((item, index) => (
              <li key={`${String(index)}-${item.time}`} className="flex gap-3">
                <span className="w-14 shrink-0 font-mono text-sm text-slate-600">{item.time}</span>
                <div>
                  <p className="font-medium">{item.title}</p>
                  {item.description === null ? null : (
                    <p className="text-sm text-slate-700">{item.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {speakers.length === 0 ? null : (
        <section aria-labelledby="speakers" className="space-y-3">
          <h2 id="speakers" className="text-xl font-semibold">
            {t('events.speakers')}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {speakers.map((speaker, index) => (
              <li key={`${String(index)}-${speaker.name}`} className="flex gap-3">
                {speaker.photo?.thumb === undefined ? null : (
                  <img
                    src={speaker.photo.thumb}
                    alt=""
                    className="h-16 w-16 rounded-full object-cover"
                    loading="lazy"
                  />
                )}
                <div>
                  <p className="font-medium">{speaker.name}</p>
                  {speaker.role === null ? null : (
                    <p className="text-sm text-slate-600">{speaker.role}</p>
                  )}
                  {speaker.bio === null ? null : (
                    <p className="mt-1 text-sm text-slate-800">{speaker.bio}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {links.length === 0 ? null : (
        <section aria-labelledby="links" className="space-y-2">
          <h2 id="links" className="text-xl font-semibold">
            {t('events.links')}
          </h2>
          <ul className="list-disc space-y-1 pl-5">
            {links.map((link, index) => (
              <li key={`${String(index)}-${link.url}`}>
                <ExternalLink url={link.url}>{link.label}</ExternalLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function EventView({ event }: { event: PublicEventDto }) {
  const { t } = useTranslation();
  const cover = event.cover?.lg ?? event.cover?.md;
  return (
    <article className="space-y-6">
      <Link to="/events" className="text-sm text-indigo-700 underline">
        {t('events.back')}
      </Link>
      {cover === undefined ? null : (
        <img src={cover} alt="" className="max-h-96 w-full rounded-lg object-cover" />
      )}
      <h1 className="text-3xl font-semibold">{event.title}</h1>
      {event.summary === null ? null : <p className="text-lg text-slate-700">{event.summary}</p>}
      <Card className="grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-medium text-slate-500">{t('events.when')}</h2>
          <p>
            {formatEventDate(event.startsAt, event.timezone)} —{' '}
            {formatEventDate(event.endsAt, event.timezone)}
          </p>
          <p className="text-xs text-slate-500">{t('events.timezone', { zone: event.timezone })}</p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-slate-500">{t('events.where')}</h2>
          {event.venueName === null ? null : <p>{event.venueName}</p>}
          {event.address === null ? null : (
            <p className="text-sm text-slate-700">{event.address}</p>
          )}
          {event.onlineUrl === null ? null : (
            <ExternalLink url={event.onlineUrl}>{t('events.joinOnline')}</ExternalLink>
          )}
        </div>
        <div className="sm:col-span-2">
          <RegistrationPanel event={event} />
        </div>
      </Card>
      {event.description === null ? null : <SafeMarkdown>{event.description}</SafeMarkdown>}
      <Blocks blocks={event.blocks} />
    </article>
  );
}

export function EventPage() {
  const { slug = '' } = useParams();
  const { t } = useTranslation();
  const query = useQuery({ queryKey: eventKey(slug), queryFn: () => eventsApi.get(slug) });
  if (query.isPending) return <Spinner label={t('app.loading')} />;
  if (query.isError) {
    return (
      <Card className="space-y-2">
        <p role="alert">{errorMessage(query.error)}</p>
        <Link to="/events" className="text-sm text-indigo-700 underline">
          {t('events.back')}
        </Link>
      </Card>
    );
  }
  return <EventView event={query.data} />;
}
