/** Транслітерація (українська — за постановою КМУ № 55 від 2010 р., плюс кілька російських літер). */
const TRANSLIT: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ie',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'iu',
  я: 'ia',
  ё: 'io',
  ы: 'y',
  э: 'e',
  ъ: '',
  "'": '',
  ʼ: '',
  '’': '',
};

export const SLUG_MAX = 60;

/** Slug з назви: лише [a-z0-9-], без крайніх і подвійних дефісів. Порожній → "event". */
export function slugify(title: string): string {
  const transliterated = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/./gsu, (char) => TRANSLIT[char] ?? char)
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036F]/g, '');
  const slug = transliterated
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
  return slug === '' ? 'event' : slug;
}

/** Наступний кандидат при колізії: base, base-2, base-3… (довжина не перевищує ліміт). */
export function slugCandidate(base: string, attempt: number): string {
  if (attempt <= 1) return base;
  const suffix = `-${String(attempt)}`;
  return `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
}
