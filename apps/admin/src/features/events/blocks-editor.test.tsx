import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventBlock } from '@yet-to-be/shared';
import { describe, expect, it, vi } from 'vitest';
import { BlocksEditor } from './blocks-editor';

function setup(initial: EventBlock[]) {
  const onSave = vi.fn<(blocks: EventBlock[]) => void>();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <BlocksEditor initial={initial} onSave={onSave} saving={false} />
    </QueryClientProvider>,
  );
  return { onSave, user: userEvent.setup() };
}

const items = () => within(screen.getByRole('list')).getAllByRole('listitem');

describe('редактор блоків', () => {
  it('додає, переставляє й прибирає блоки та зберігає їх по порядку', async () => {
    const { onSave, user } = setup([{ type: 'text', data: { body: 'Перший' } }]);

    await user.selectOptions(screen.getByLabelText('Тип блоку'), 'link');
    await user.click(screen.getByRole('button', { name: 'Додати блок' }));
    await user.type(screen.getByLabelText('Підпис'), 'Сайт');
    await user.type(screen.getByLabelText('Посилання (https)'), 'example.com');

    const second = items()[1];
    if (second === undefined) throw new Error('no second block');
    await user.click(within(second).getByRole('button', { name: 'Вище' }));
    expect(within(items()[0] as HTMLElement).getByText('1. Посилання')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Тип блоку'), 'agenda_item');
    await user.click(screen.getByRole('button', { name: 'Додати блок' }));
    await user.click(within(items()[2] as HTMLElement).getByRole('button', { name: 'Прибрати' }));

    await user.click(screen.getByRole('button', { name: 'Зберегти наповнення' }));
    expect(onSave).toHaveBeenCalledWith([
      { type: 'link', data: { label: 'Сайт', url: 'https://example.com' } },
      { type: 'text', data: { body: 'Перший' } },
    ]);
  });

  it('не зберігає некоректний блок і вказує його номер', async () => {
    const { onSave, user } = setup([]);
    expect(screen.getByText('Блоків ще немає')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Додати блок' }));
    await user.click(screen.getByRole('button', { name: 'Зберегти наповнення' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Перевірте введені дані. (#1)');
    expect(onSave).not.toHaveBeenCalled();
  });
});
