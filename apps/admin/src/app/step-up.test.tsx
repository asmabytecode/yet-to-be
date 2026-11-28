import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@yet-to-be/ui';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API, apiError } from '../test/render-admin';
import { server } from '../test/server';
import { StepUpProvider, useStepUp } from './step-up';

function Probe({
  action,
  onResult,
}: {
  action: () => Promise<string>;
  onResult: (value: string) => void;
}) {
  const run = useStepUp();
  return (
    <button
      type="button"
      onClick={() => {
        run(action).then(onResult, (error: unknown) => {
          onResult(error instanceof Error ? error.message : 'error');
        });
      }}
    >
      go
    </button>
  );
}

function setup(action: () => Promise<string>) {
  const results: string[] = [];
  document.cookie = 'ytb_csrf=test-token; path=/';
  render(
    <StepUpProvider>
      <Probe
        action={action}
        onResult={(value) => {
          results.push(value);
        }}
      />
    </StepUpProvider>,
  );
  return { results, user: userEvent.setup() };
}

describe('підтвердження критичних дій', () => {
  it('без REAUTH_REQUIRED дія виконується одразу', async () => {
    const { results, user } = setup(() => Promise.resolve('ok'));
    await user.click(screen.getByRole('button', { name: 'go' }));
    expect(results).toEqual(['ok']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('кодом TOTP: підтверджує й повторює дію', async () => {
    let calls = 0;
    server.use(http.post(`*${API}/auth/mfa/verify`, () => new HttpResponse(null, { status: 204 })));
    const { results, user } = setup(() => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new ApiError(403, 'REAUTH_REQUIRED', 'x'))
        : Promise.resolve('done');
    });
    await user.click(screen.getByRole('button', { name: 'go' }));
    await user.click(await screen.findByRole('button', { name: 'Підтвердити кодом' }));
    await user.type(screen.getByLabelText('Код із застосунку'), '123456');
    await user.click(screen.getByRole('button', { name: 'Підтвердити' }));
    await waitFor(() => {
      expect(results).toEqual(['done']);
    });
    expect(calls).toBe(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('невірний пароль лишає вікно відкритим; скасування відхиляє дію', async () => {
    server.use(http.post(`*${API}/auth/step-up`, () => apiError(400, 'AUTH_INVALID_CREDENTIALS')));
    const { results, user } = setup(() =>
      Promise.reject(new ApiError(403, 'REAUTH_REQUIRED', 'x')),
    );
    await user.click(screen.getByRole('button', { name: 'go' }));
    await user.type(await screen.findByLabelText('Пароль'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Підтвердити' }));
    expect(await screen.findByText('Невірний пароль.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(results).toEqual(['Step-up cancelled']);
  });
});
