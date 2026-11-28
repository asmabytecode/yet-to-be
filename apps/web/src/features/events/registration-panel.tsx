import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicEventDto } from '@yet-to-be/shared';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { errorMessage } from '../../shared/api/errors';
import { Button } from '../../shared/ui/button';
import { useToast } from '../../shared/ui/toast';
import { useSession } from '../auth/use-session';
import { eventKey, eventsApi, MY_REGISTRATIONS_KEY } from './api';

/** Блок запису на сторінці події: стан залежить від сесії, місць і того, чи користувач уже записаний. */
export function RegistrationPanel({ event }: { event: PublicEventDto }) {
  const { t } = useTranslation();
  const toast = useToast();
  const location = useLocation();
  const client = useQueryClient();
  const { data: user } = useSession();
  const signedIn = user !== null && user !== undefined;
  const mine = useQuery({
    queryKey: MY_REGISTRATIONS_KEY,
    queryFn: eventsApi.mine,
    enabled: signedIn,
  });
  const registered = mine.data?.items.some((item) => item.event.id === event.id) ?? false;

  const refresh = async (): Promise<void> => {
    await Promise.all([
      client.invalidateQueries({ queryKey: MY_REGISTRATIONS_KEY }),
      client.invalidateQueries({ queryKey: eventKey(event.slug) }),
    ]);
  };
  const register = useMutation({
    mutationFn: () => eventsApi.register(event.id),
    onSuccess: async () => {
      toast.success(t('events.registeredToast'));
      await refresh();
    },
    onError: async (error) => {
      toast.error(errorMessage(error));
      await refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: () => eventsApi.cancel(event.id),
    onSuccess: async () => {
      toast.success(t('events.cancelledToast'));
      await refresh();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
    },
  });

  const spots =
    event.spotsLeft === null
      ? t('events.unlimited')
      : t('events.spotsLeft', { count: event.spotsLeft });

  if (event.status === 'cancelled') {
    return <p className="font-medium text-red-800">{t('events.cancelled')}</p>;
  }
  return (
    <div className="space-y-2" aria-live="polite">
      <p className="text-sm text-slate-700">{spots}</p>
      {!signedIn ? (
        <Link
          to="/login"
          state={{ from: location.pathname }}
          className="inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
        >
          {t('events.loginToRegister')}
        </Link>
      ) : registered ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium text-emerald-800">{t('events.registered')}</span>
          {event.registrationOpen || new Date(event.startsAt) > new Date() ? (
            <Button
              variant="secondary"
              disabled={cancel.isPending}
              onClick={() => {
                cancel.mutate();
              }}
            >
              {t('events.cancelRegistration')}
            </Button>
          ) : null}
        </div>
      ) : event.registrationOpen ? (
        <Button
          disabled={register.isPending || mine.isPending}
          onClick={() => {
            register.mutate();
          }}
        >
          {t('events.register')}
        </Button>
      ) : (
        <p className="font-medium text-slate-700">
          {event.spotsLeft === 0 ? t('events.full') : t('events.closed')}
        </p>
      )}
    </div>
  );
}
