import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { API, apiError, mockAdmin, OWNER, renderAdmin } from '../../test/render-admin';
import { server } from '../../test/server';

describe('налаштування MFA', () => {
  it('ключ → код → резервні коди показуються один раз → адмінка відкривається', async () => {
    let enabled = false;
    mockAdmin(OWNER);
    server.use(
      http.get(`*${API}/auth/mfa`, () =>
        HttpResponse.json({ enabled, required: true, sessionVerified: enabled, stepUpUntil: null }),
      ),
      http.post(`*${API}/auth/mfa/setup`, () =>
        HttpResponse.json({
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUri: 'otpauth://totp/YTB?secret=JBSWY3DPEHPK3PXP',
        }),
      ),
      http.post(`*${API}/auth/mfa/enable`, async ({ request }) => {
        const body = (await request.json()) as { code: string };
        if (body.code !== '654321') return apiError(400, 'MFA_INVALID_CODE');
        enabled = true;
        return HttpResponse.json({ recoveryCodes: ['aaaa-bbbb', 'cccc-dddd'] });
      }),
    );
    const { user } = renderAdmin('/');

    await user.click(await screen.findByRole('button', { name: 'Отримати ключ' }));
    expect(await screen.findByDisplayValue('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    // QR із тим самим otpauth-посиланням — для сканування телефоном.
    expect(screen.getByRole('img', { name: 'QR-код для застосунку-автентифікатора' }).tagName).toBe(
      'svg',
    );

    await user.type(screen.getByLabelText('Код із застосунку'), '000000');
    await user.click(screen.getByRole('button', { name: 'Увімкнути' }));
    expect(await screen.findByText('Невірний код.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Код із застосунку'));
    await user.type(screen.getByLabelText('Код із застосунку'), '654321');
    await user.click(screen.getByRole('button', { name: 'Увімкнути' }));
    expect(await screen.findByText('aaaa-bbbb')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Я зберіг коди' }));
    expect(await screen.findByRole('heading', { name: 'Огляд' })).toBeInTheDocument();
  });
});
