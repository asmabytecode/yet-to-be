import { useQuery } from '@tanstack/react-query';
import { SelectField } from '@yet-to-be/ui';
import { useTranslation } from 'react-i18next';
import { adminApi, keys } from '../../api/admin-api';

/** Вибір готового зображення з медіатеки (посилатися можна лише на ready-файли). */
export function MediaSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const params = { status: 'ready', limit: 100 };
  const media = useQuery({
    queryKey: keys.media(params),
    queryFn: () => adminApi.media.list(params),
  });
  const items = media.data?.items ?? [];
  const selected = items.find((item) => item.id === value);
  return (
    <div className="space-y-2">
      <SelectField
        label={label}
        value={value ?? ''}
        onChange={(event) => {
          onChange(event.target.value === '' ? null : event.target.value);
        }}
      >
        <option value="">{t('events.noCover')}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {`${item.id.slice(0, 8)} · ${String(item.width ?? 0)}×${String(item.height ?? 0)}`}
          </option>
        ))}
      </SelectField>
      {selected?.variants?.thumb === undefined ? null : (
        <img src={selected.variants.thumb} alt="" className="h-20 rounded object-cover" />
      )}
    </div>
  );
}
