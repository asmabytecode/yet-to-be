import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafeMarkdown, safeUrl } from './markdown';

describe('SafeMarkdown', () => {
  it('renders basic formatting and https links', () => {
    render(<SafeMarkdown>{'**Жирний** і [сайт](https://example.com)'}</SafeMarkdown>);
    expect(screen.getByText('Жирний').tagName).toBe('STRONG');
    const link = screen.getByRole('link', { name: 'сайт' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('rel', 'nofollow noopener noreferrer');
  });

  it('drops raw HTML, images and dangerous links', () => {
    const { container } = render(
      <SafeMarkdown>
        {
          '<script>alert(1)</script><img src=x onerror=alert(1)>\n\n![x](https://e.com/a.png) [зло](javascript:alert(1)) [дані](data:text/html,x)'
        }
      </SafeMarkdown>,
    );
    expect(container.querySelector('script, img, iframe')).toBeNull();
    for (const link of container.querySelectorAll('a')) {
      expect(link.getAttribute('href') ?? '').toMatch(/^https:|^mailto:/);
    }
    expect(screen.queryByRole('link', { name: 'зло' })).not.toBeInTheDocument();
  });

  it('allows only https and mailto URLs', () => {
    expect(safeUrl('https://a.b')).toBe('https://a.b');
    expect(safeUrl('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeUrl('http://a.b')).toBeNull();
    expect(safeUrl('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeUrl('/relative')).toBeNull();
  });
});
