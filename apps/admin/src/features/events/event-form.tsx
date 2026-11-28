import { type AdminEventDto, type CreateEventInput, createEventSchema } from '@yet-to-be/shared';
import { Button, Card, Field, FormError, TextAreaField } from '@yet-to-be/ui';
import { useEffect } from 'react';
import { type FieldPath, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useBlocker } from 'react-router-dom';
import { fromLocalInput, toLocalInput } from '../../shared/lists';
import { MediaSelect } from '../media/media-select';

/** Значення форми — рядки з полів вводу; перед відправкою перетворюються й перевіряються спільною схемою. */
export interface EventFormValues {
  title: string;
  summary: string;
  description: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venueName: string;
  address: string;
  onlineUrl: string;
  capacity: string;
  tags: string;
  coverAssetId: string;
}

const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

export function toFormValues(event: AdminEventDto | null): EventFormValues {
  return {
    title: event?.title ?? '',
    summary: event?.summary ?? '',
    description: event?.description ?? '',
    startsAt: event === null ? '' : toLocalInput(event.startsAt),
    endsAt: event === null ? '' : toLocalInput(event.endsAt),
    timezone: event?.timezone ?? browserTimeZone(),
    venueName: event?.venueName ?? '',
    address: event?.address ?? '',
    onlineUrl: event?.onlineUrl ?? '',
    capacity:
      event?.capacity === null || event?.capacity === undefined ? '' : String(event.capacity),
    tags: event?.tags.join(', ') ?? '',
    coverAssetId: event?.coverAssetId ?? '',
  };
}

const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/** Рядки форми → вхід API (ще не перевірений). */
export function toEventInput(values: EventFormValues): Record<string, unknown> {
  return {
    title: values.title,
    summary: orNull(values.summary),
    description: orNull(values.description),
    startsAt: fromLocalInput(values.startsAt),
    endsAt: fromLocalInput(values.endsAt),
    timezone: values.timezone.trim(),
    venueName: orNull(values.venueName),
    address: orNull(values.address),
    onlineUrl: orNull(values.onlineUrl),
    capacity: values.capacity.trim() === '' ? null : Number(values.capacity),
    tags: values.tags
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag !== ''),
    coverAssetId: orNull(values.coverAssetId),
  };
}

/**
 * Форма події. Ті самі правила, що на сервері (createEventSchema): помилка показується біля
 * поля ще до відправки. Незбережені зміни захищені від випадкового переходу зі сторінки.
 */
export function EventForm({
  initial,
  pending,
  serverError,
  onSubmit,
}: {
  initial: AdminEventDto | null;
  pending: boolean;
  serverError: string | null;
  onSubmit: (input: CreateEventInput, values: EventFormValues) => void;
}) {
  const { t } = useTranslation();
  const form = useForm<EventFormValues>({ defaultValues: toFormValues(initial) });
  const { register, handleSubmit, setError, formState, reset, watch, setValue } = form;

  useEffect(() => {
    reset(toFormValues(initial));
  }, [initial, reset]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      formState.isDirty && !pending && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(t('events.leaveWarning'))) blocker.proceed();
    else blocker.reset();
  }, [blocker, t]);

  const submit = handleSubmit((values) => {
    const parsed = createEventSchema.safeParse(toEventInput(values));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'title') as FieldPath<EventFormValues>;
        // Тип = код zod: Field перекладає його через validation.* (невідомі коди → загальний текст).
        setError(field, { type: issue.code });
      }
      return;
    }
    onSubmit(parsed.data, values);
  });

  const field = (name: keyof EventFormValues, type = 'text', max = 300) => (
    <Field
      label={t(`events.fields.${name}`)}
      type={type}
      maxLength={type === 'text' || type === 'url' ? max : undefined}
      error={formState.errors[name]}
      {...register(name)}
    />
  );

  return (
    <Card>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => void submit(event)}
        noValidate
      >
        <div className="sm:col-span-2">{field('title', 'text', 140)}</div>
        <div className="sm:col-span-2">{field('summary', 'text', 300)}</div>
        <div className="sm:col-span-2">
          <TextAreaField
            label={t('events.fields.description')}
            rows={8}
            maxLength={20_000}
            error={formState.errors.description}
            {...register('description')}
          />
        </div>
        {field('startsAt', 'datetime-local')}
        {field('endsAt', 'datetime-local')}
        {field('timezone', 'text', 64)}
        {field('capacity', 'number')}
        {field('venueName', 'text', 120)}
        {field('address', 'text', 300)}
        {field('onlineUrl', 'url', 2048)}
        {field('tags', 'text', 300)}
        <div className="sm:col-span-2">
          <MediaSelect
            label={t('events.fields.cover')}
            value={orNull(watch('coverAssetId'))}
            onChange={(id) => {
              setValue('coverAssetId', id ?? '', { shouldDirty: true });
            }}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <FormError message={serverError} />
          <Button type="submit" disabled={pending}>
            {initial === null ? t('common.create') : t('common.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
