import {
  EVENT_BLOCK_TYPES,
  type EventBlock,
  type EventBlockType,
  eventBlockSchema,
} from '@yet-to-be/shared';
import { Button, Card, Field, FormError, SelectField, TextAreaField } from '@yet-to-be/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MediaSelect } from '../media/media-select';

/** Редагований блок: id потрібен лише для ключів React, на сервер не йде. */
interface DraftBlock {
  key: string;
  block: EventBlock;
}

let counter = 0;
const nextKey = (): string => `b${String((counter += 1))}`;

function emptyBlock(type: EventBlockType): EventBlock {
  switch (type) {
    case 'text':
      return { type, data: { body: '' } };
    case 'agenda_item':
      return { type, data: { time: '10:00', title: '' } };
    case 'speaker':
      return { type, data: { name: '' } };
    case 'link':
      return { type, data: { label: '', url: 'https://' } };
  }
}

/** Порожні необов'язкові поля не надсилаємо: схема очікує або значення, або відсутність. */
function compact(block: EventBlock): EventBlock {
  const data = Object.fromEntries(
    Object.entries(block.data).filter(([, value]) => value !== '' && value !== undefined),
  );
  return { ...block, data } as EventBlock;
}

/**
 * Список блоків наповнення: додати, змінити, переставити, прибрати. Зберігається одним
 * запитом (PUT /blocks) з версією події — паралельні правки не перезапишуть одна одну.
 */
export function BlocksEditor({
  initial,
  onSave,
  saving,
}: {
  initial: readonly EventBlock[];
  onSave: (blocks: EventBlock[]) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [blocks, setBlocks] = useState<DraftBlock[]>(() =>
    initial.map((block) => ({ key: nextKey(), block })),
  );
  const [type, setType] = useState<EventBlockType>('text');
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, data: Record<string, string | undefined>): void => {
    setBlocks((current) =>
      current.map((item) =>
        item.key === key
          ? {
              ...item,
              block: { ...item.block, data: { ...item.block.data, ...data } } as EventBlock,
            }
          : item,
      ),
    );
  };
  const move = (index: number, delta: number): void => {
    setBlocks((current) => {
      const next = [...current];
      const target = index + delta;
      const [item] = next.splice(index, 1);
      if (item === undefined || target < 0 || target > next.length) return current;
      next.splice(target, 0, item);
      return next;
    });
  };

  const save = (): void => {
    const prepared = blocks.map((item) => compact(item.block));
    const invalid = prepared.findIndex((block) => !eventBlockSchema.safeParse(block).success);
    if (invalid !== -1) {
      setError(`${t('errors.VALIDATION_FAILED')} (#${String(invalid + 1)})`);
      return;
    }
    setError(null);
    onSave(prepared);
  };

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">{t('blocks.title')}</h2>
      {blocks.length === 0 ? <p className="text-sm text-slate-500">{t('blocks.empty')}</p> : null}
      <ol className="space-y-4">
        {blocks.map((item, index) => (
          <li key={item.key} className="space-y-3 rounded-md border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <strong className="text-sm">
                {`${String(index + 1)}. ${t(`blocks.types.${item.block.type}`)}`}
              </strong>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={index === 0}
                  onClick={() => {
                    move(index, -1);
                  }}
                >
                  {t('blocks.up')}
                </Button>
                <Button
                  variant="secondary"
                  disabled={index === blocks.length - 1}
                  onClick={() => {
                    move(index, 1);
                  }}
                >
                  {t('blocks.down')}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setBlocks((current) => current.filter((other) => other.key !== item.key));
                  }}
                >
                  {t('blocks.remove')}
                </Button>
              </div>
            </div>
            <BlockFields
              item={item}
              onChange={(data) => {
                update(item.key, data);
              }}
            />
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-48">
          <SelectField
            label={t('blocks.type')}
            value={type}
            onChange={(event) => {
              setType(event.target.value as EventBlockType);
            }}
          >
            {EVENT_BLOCK_TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`blocks.types.${value}`)}
              </option>
            ))}
          </SelectField>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setBlocks((current) => [...current, { key: nextKey(), block: emptyBlock(type) }]);
          }}
        >
          {t('blocks.add')}
        </Button>
        <Button disabled={saving} onClick={save}>
          {t('blocks.save')}
        </Button>
      </div>
      <FormError message={error} />
    </Card>
  );
}

function BlockFields({
  item,
  onChange,
}: {
  item: DraftBlock;
  onChange: (data: Record<string, string | undefined>) => void;
}) {
  const { t } = useTranslation();
  const { block } = item;
  const text = (name: string, label: string, value: string | undefined, max: number) => (
    <Field
      label={label}
      maxLength={max}
      value={value ?? ''}
      onChange={(event) => {
        onChange({ [name]: event.target.value });
      }}
    />
  );
  const area = (name: string, label: string, value: string | undefined, max: number) => (
    <TextAreaField
      label={label}
      maxLength={max}
      value={value ?? ''}
      onChange={(event) => {
        onChange({ [name]: event.target.value });
      }}
    />
  );
  switch (block.type) {
    case 'text':
      return area('body', t('blocks.body'), block.data.body, 5000);
    case 'agenda_item':
      return (
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          {text('time', t('blocks.time'), block.data.time, 5)}
          {text('title', t('blocks.itemTitle'), block.data.title, 120)}
          <div className="sm:col-span-2">
            {area('description', t('blocks.itemDescription'), block.data.description, 500)}
          </div>
        </div>
      );
    case 'speaker':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {text('name', t('blocks.name'), block.data.name, 80)}
          {text('role', t('blocks.role'), block.data.role, 120)}
          <div className="sm:col-span-2">{area('bio', t('blocks.bio'), block.data.bio, 1000)}</div>
          <MediaSelect
            label={t('blocks.photo')}
            value={block.data.photoAssetId ?? null}
            onChange={(id) => {
              onChange({ photoAssetId: id ?? undefined });
            }}
          />
        </div>
      );
    case 'link':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {text('label', t('blocks.label'), block.data.label, 80)}
          {text('url', t('blocks.url'), block.data.url, 2048)}
        </div>
      );
  }
}
