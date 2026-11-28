import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MEDIA_STATUSES, type MediaAssetDto } from '@yet-to-be/shared';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  FormError,
  SelectField,
  useToast,
} from '@yet-to-be/ui';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../api/admin-api';
import { Can } from '../app/access';
import { errorMessage } from '../shared-errors';
import { formatDateTime, useCursorList, useUrlFilters } from '../shared/lists';

const STATUS_TONE = { processing: 'info', ready: 'success', rejected: 'danger' } as const;
const ACCEPT = 'image/jpeg,image/png,image/webp';

function MediaCard({ asset, onDelete }: { asset: MediaAssetDto; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <Card>
      <div className="space-y-2">
        {asset.variants?.thumb === undefined ? (
          <div className="flex h-32 items-center justify-center rounded bg-slate-100 text-sm text-slate-500">
            {t(`media.status.${asset.status}`)}
          </div>
        ) : (
          <img
            src={asset.variants.thumb}
            alt=""
            className="h-32 w-full rounded object-cover"
            loading="lazy"
          />
        )}
        <div className="flex items-center justify-between gap-2">
          <Badge tone={STATUS_TONE[asset.status]}>{t(`media.status.${asset.status}`)}</Badge>
          <span className="text-xs text-slate-500">{formatDateTime(asset.createdAt)}</span>
        </div>
        {asset.rejectReason === null ? null : (
          <p className="text-xs text-red-800">{t(`media.reasons.${asset.rejectReason}`)}</p>
        )}
        {asset.width === null || asset.height === null ? null : (
          <p className="text-xs text-slate-600">{`${String(asset.width)}×${String(asset.height)}`}</p>
        )}
        <Can permissions={['media:delete']}>
          <Button variant="secondary" onClick={onDelete}>
            {t('common.delete')}
          </Button>
        </Can>
      </div>
    </Card>
  );
}

export function MediaPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const inputId = useId();
  const { values, set } = useUrlFilters(['status'] as const);
  const params = { status: values.status, limit: 48 };
  const list = useCursorList(['media', params], (cursor) =>
    adminApi.media.list({ ...params, cursor }),
  );
  const [target, setTarget] = useState<MediaAssetDto | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Поки є файли в обробці — тихо оновлюємо список, щоб статус змінився без перезавантаження.
  const processing = list.items.some((item) => item.status === 'processing');
  const { refetch } = list;
  useEffect(() => {
    if (!processing) return undefined;
    const timer = setInterval(() => {
      void refetch();
    }, 2000);
    return () => {
      clearInterval(timer);
    };
  }, [processing, refetch]);

  const upload = useMutation({
    mutationFn: (file: File) => adminApi.media.upload(file),
    onSuccess: () => {
      setUploadError(null);
      toast.success(t('media.uploaded'));
      void client.invalidateQueries({ queryKey: ['media'] });
    },
    onError: (failure) => {
      setUploadError(errorMessage(failure));
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => adminApi.media.remove(id),
    onSuccess: () => {
      setTarget(null);
      toast.success(t('common.deleted'));
      void client.invalidateQueries({ queryKey: ['media'] });
    },
    onError: (failure) => {
      setTarget(null);
      toast.error(errorMessage(failure));
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('media.title')}</h1>
      <Card>
        <div className="space-y-2">
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
            {t('media.upload')}
          </label>
          <input
            id={inputId}
            type="file"
            accept={ACCEPT}
            disabled={upload.isPending}
            className="block text-sm"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file !== undefined) upload.mutate(file);
            }}
          />
          <p className="text-xs text-slate-600">{t('media.uploadHint')}</p>
          <FormError message={uploadError} />
        </div>
      </Card>
      <div className="max-w-xs">
        <SelectField
          label={t('events.columns.status')}
          value={values.status}
          onChange={(event) => {
            set('status', event.target.value);
          }}
        >
          <option value="">{t('common.all')}</option>
          {MEDIA_STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`media.status.${status}`)}
            </option>
          ))}
        </SelectField>
      </div>
      {list.items.length === 0 && !list.isPending ? (
        <p className="text-sm text-slate-600">{t('common.empty')}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={t('media.title')}>
          {list.items.map((asset) => (
            <li key={asset.id}>
              <MediaCard
                asset={asset}
                onDelete={() => {
                  setTarget(asset);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      {list.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={list.isFetchingNextPage}
          onClick={() => {
            void list.fetchNextPage();
          }}
        >
          {t('common.loadMore')}
        </Button>
      ) : null}
      <ConfirmDialog
        open={target !== null}
        title={t('media.deleteTitle')}
        description={t('media.deleteText')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        pending={remove.isPending}
        onCancel={() => {
          setTarget(null);
        }}
        onConfirm={() => {
          if (target !== null) remove.mutate(target.id);
        }}
      />
    </div>
  );
}
