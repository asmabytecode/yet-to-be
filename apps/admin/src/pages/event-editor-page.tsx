import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AdminEventDetailDto,
  type AdminEventDto,
  type CreateEventInput,
  EVENT_ACTIONS,
  type EventAction,
  type EventBlock,
  ERROR_CODES,
  nextStatus,
} from '@yet-to-be/shared';
import {
  ApiError,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  Spinner,
  linkButtonClass,
  useToast,
} from '@yet-to-be/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { adminApi, keys } from '../api/admin-api';
import { Can, useCan } from '../app/access';
import { useStepUp } from '../app/step-up';
import { BlocksEditor } from '../features/events/blocks-editor';
import { EventForm } from '../features/events/event-form';
import { errorMessage, isApiError } from '../shared-errors';
import { EventStatusBadge } from './events-list-page';

/** Блоки з сервера мають id; редактору й API він не потрібен. */
const withoutIds = (blocks: AdminEventDetailDto['blocks']): EventBlock[] =>
  blocks.map(({ type, data }) => ({ type, data }) as EventBlock);

export function EventNewPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  // Один ключ на відкриту форму: повторна відправка (подвійний клік, повтор після збою мережі)
  // поверне ту саму подію, а не створить другу.
  const idempotencyKey = useRef(crypto.randomUUID());
  const create = useMutation({
    mutationFn: (input: CreateEventInput) => adminApi.events.create(input, idempotencyKey.current),
    onSuccess: (event) => {
      client.setQueryData(keys.event(event.id), event);
      void client.invalidateQueries({ queryKey: ['events'] });
      toast.success(t('events.created'));
      void navigate(`/events/${event.id}`, { replace: true });
    },
  });

  return (
    <div className="space-y-4">
      <Link className="text-sm text-indigo-700 underline" to="/events">
        {t('common.back')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('events.newTitle')}</h1>
      <EventForm
        initial={null}
        pending={create.isPending || create.isSuccess}
        serverError={create.error === null ? null : errorMessage(create.error)}
        onSubmit={(input) => {
          create.mutate(input);
        }}
      />
    </div>
  );
}

export function EventEditorPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const query = useQuery({ queryKey: keys.event(id), queryFn: () => adminApi.events.get(id) });

  if (query.isPending) return <Spinner label={t('app.loading')} />;
  if (query.isError) {
    return (
      <Card>
        <p role="alert">{errorMessage(query.error)}</p>
      </Card>
    );
  }
  return <EventEditor event={query.data} />;
}

function EventEditor({ event }: { event: AdminEventDetailDto }) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const stepUp = useStepUp();
  const can = useCan();
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  /** Після будь-якої зміни сервер повертає нову версію — кладемо її в кеш, щоб наступний запит ішов з нею. */
  const remember = (next: AdminEventDto | AdminEventDetailDto): void => {
    client.setQueryData<AdminEventDetailDto>(keys.event(event.id), (current) =>
      'blocks' in next ? next : { ...next, blocks: current?.blocks ?? event.blocks },
    );
    void client.invalidateQueries({ queryKey: ['events'] });
  };

  const onError = (failure: unknown): void => {
    if (isApiError(failure, ERROR_CODES.EVENT_VERSION_CONFLICT)) {
      setConflict(true);
      return;
    }
    if (isApiError(failure, ERROR_CODES.EVENT_INCOMPLETE) && failure instanceof ApiError) {
      const fields = failure.issues.map((issue) => t(`events.fields.${issue.path}`)).join(', ');
      setActionError(t('events.incomplete', { fields }));
      return;
    }
    setActionError(errorMessage(failure));
  };

  const update = useMutation({
    mutationFn: (input: CreateEventInput) =>
      adminApi.events.update(event.id, { ...input, version: event.version }),
    onSuccess: (next) => {
      remember(next);
      toast.success(t('common.saved'));
    },
    onError,
  });
  const blocks = useMutation({
    mutationFn: (list: EventBlock[]) =>
      adminApi.events.replaceBlocks(event.id, event.version, list),
    onSuccess: (next) => {
      remember(next);
      toast.success(t('common.saved'));
    },
    onError,
  });
  const transition = useMutation({
    mutationFn: (action: EventAction) =>
      adminApi.events.transition(event.id, { action, version: event.version }),
    onSuccess: (next) => {
      setActionError(null);
      remember(next);
      toast.success(t('events.transitioned'));
    },
    onError,
  });
  const duplicate = useMutation({
    mutationFn: () => adminApi.events.duplicate(event.id),
    onSuccess: (copy) => {
      client.setQueryData(keys.event(copy.id), copy);
      void client.invalidateQueries({ queryKey: ['events'] });
      toast.success(t('events.duplicated'));
      void navigate(`/events/${copy.id}`);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => stepUp(() => adminApi.events.remove(event.id)),
    onSuccess: () => {
      setConfirmDelete(false);
      client.removeQueries({ queryKey: keys.event(event.id) });
      void client.invalidateQueries({ queryKey: ['events'] });
      toast.success(t('common.deleted'));
      void navigate('/events', { replace: true });
    },
    onError: (failure) => {
      setConfirmDelete(false);
      if (failure instanceof Error && failure.message === 'Step-up cancelled') return;
      onError(failure);
    },
  });

  const editable = can('events:write') && event.status !== 'archived';
  const actions = EVENT_ACTIONS.filter((action) => nextStatus(event.status, action) !== null);
  const busy = update.isPending || blocks.isPending || transition.isPending;

  return (
    <div className="space-y-4">
      <Link className="text-sm text-indigo-700 underline" to="/events">
        {t('common.back')}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{event.title}</h1>
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <EventStatusBadge status={event.status} />
            <span>/{event.slug}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Can permissions={['events:publish']}>
            {actions.map((action) => (
              <Button
                key={action}
                variant={action === 'publish' ? 'primary' : 'secondary'}
                disabled={busy}
                onClick={() => {
                  transition.mutate(action);
                }}
              >
                {t(`events.actions.${action}`)}
              </Button>
            ))}
          </Can>
          <Can permissions={['events:write']}>
            <Button
              variant="secondary"
              disabled={duplicate.isPending}
              onClick={() => {
                duplicate.mutate();
              }}
            >
              {t('events.actions.duplicate')}
            </Button>
          </Can>
          <Can permissions={['registrations:read']}>
            <Link className={linkButtonClass('secondary')} to={`/events/${event.id}/registrations`}>
              {t('events.registrations')}
            </Link>
          </Can>
          <Can permissions={['events:delete']}>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmDelete(true);
              }}
            >
              {t('common.delete')}
            </Button>
          </Can>
        </div>
      </div>
      {actionError === null ? null : (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {actionError}
        </p>
      )}
      {editable ? (
        <>
          <EventForm
            initial={event}
            pending={update.isPending}
            serverError={null}
            onSubmit={(input) => {
              update.mutate(input);
            }}
          />
          <BlocksEditor
            key={event.id}
            initial={withoutIds(event.blocks)}
            saving={blocks.isPending}
            onSave={(list) => {
              blocks.mutate(list);
            }}
          />
        </>
      ) : (
        <Card>
          <p className="text-sm text-slate-700">{event.summary ?? '—'}</p>
        </Card>
      )}

      <Dialog
        open={conflict}
        title={t('events.conflictTitle')}
        onClose={() => {
          setConflict(false);
        }}
        actions={
          <Button
            onClick={() => {
              setConflict(false);
              void client.invalidateQueries({ queryKey: keys.event(event.id) });
            }}
          >
            {t('events.reload')}
          </Button>
        }
      >
        <p className="text-sm text-slate-700">{t('events.conflictText')}</p>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        title={t('events.deleteTitle')}
        description={t('events.deleteText')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        typeToConfirm={event.title}
        pending={remove.isPending}
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          remove.mutate();
        }}
      />
    </div>
  );
}
