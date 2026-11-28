import Markdown, { type Components } from 'react-markdown';

/** Дозволені протоколи посилань. Усе інше (javascript:, data:, відносні трюки) відкидається. */
export function safeUrl(url: string): string | null {
  return /^(https:\/\/|mailto:)/i.test(url.trim()) ? url.trim() : null;
}

const ALLOWED = [
  'p',
  'br',
  'strong',
  'em',
  'ul',
  'ol',
  'li',
  'a',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'code',
  'pre',
  'hr',
];

const components: Components = {
  // Посилання з тексту організатора: без передачі referrer і без «підкріплення» SEO.
  a: ({ href, children }) =>
    href === undefined ? (
      <span>{children}</span>
    ) : (
      <a href={href} rel="nofollow noopener noreferrer" className="text-indigo-700 underline">
        {children}
      </a>
    ),
};

/**
 * Markdown з контенту адмінки. Сирий HTML не рендериться взагалі (skipHtml), зображень немає
 * (лише медіатека), заголовок h1 зарезервований для сторінки. Жодного dangerouslySetInnerHTML.
 */
export function SafeMarkdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 leading-relaxed text-slate-800">
      <Markdown
        skipHtml
        allowedElements={ALLOWED}
        unwrapDisallowed
        urlTransform={(url) => safeUrl(url)}
        components={components}
      >
        {children}
      </Markdown>
    </div>
  );
}
