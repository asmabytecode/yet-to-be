import { screen, waitFor } from '@testing-library/react';
import type { AuditEntryDto } from '@yet-to-be/shared';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { access, API, mockAdmin, renderAdmin } from '../test/render-admin';
import { server } from '../test/server';

const ENTRY: AuditEntryDto = {
  id: 'a1',
  seq: 7,
  action: 'admin.user.block',
  actorId: 'u1',
  actorName: 'Ада',
  targetType: 'user',
  targetId: '22222222-2222-4222-8222-222222222222',
  metadata: { reason: '<script>alert(1)</script>' },
  requestId: 'r1',
  createdAt: '2030-01-01T00:00:00.000Z',
};

describe('журнал дій', () => {
  it('показує записи як текст і передає фільтр дії в запит', async () => {
    const queries: string[] = [];
    mockAdmin(access('audit:read'), { required: false });
    server.use(
      http.get(`*${API}/admin/audit`, ({ request }) => {
        queries.push(new URL(request.url).search);
        return HttpResponse.json({
          items: [ENTRY, { ...ENTRY, id: 'a2', actorName: null, actorId: null, metadata: null }],
          nextCursor: null,
        });
      }),
    );
    const { user } = renderAdmin('/audit');

    const table = await screen.findByRole('table');
    expect(await screen.findAllByText('admin.user.block')).toHaveLength(2);
    expect(screen.getByText('система')).toBeInTheDocument();
    expect(screen.getAllByText('user:22222222')).toHaveLength(2);
    // Метадані — лише текст: тег не стає елементом.
    expect(table.querySelector('script')).toBeNull();
    expect(screen.getByText(/<script>/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Дія (напр. admin.user.block)'), 'admin.role.create');
    await user.tab();
    await waitFor(() => {
      expect(queries.some((query) => query.includes('action=admin.role.create'))).toBe(true);
    });
  });
});
