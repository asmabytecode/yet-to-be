// Перевіряє захисні заголовки розгорнутого стеку (Nginx + API). Використовується в CI після
// `docker compose up` і як smoke-тест після деплою.
//   node scripts/check-headers.mjs http://localhost:8080
// Exit code 1, якщо знайдено хоч одну проблему.

const REQUIRED_SPA = {
  'content-security-policy': (v) =>
    v.includes("default-src 'self'") && v.includes("frame-ancestors 'none'"),
  'x-content-type-options': (v) => v === 'nosniff',
  'x-frame-options': (v) => v.toUpperCase() === 'DENY',
  'referrer-policy': (v) => v.length > 0,
  'permissions-policy': (v) => v.includes('camera=()'),
  'cross-origin-opener-policy': (v) => v === 'same-origin',
};

const REQUIRED_API = {
  'content-security-policy': (v) => v.includes("frame-ancestors 'none'"),
  'x-content-type-options': (v) => v.includes('nosniff'),
  'cache-control': (v) => v.includes('no-store'),
};

/** Заголовки, що не повинні розкривати технології чи версії. */
function leakProblems(headers) {
  const problems = [];
  if (headers.get('x-powered-by') !== null) problems.push('x-powered-by must be absent');
  const server = headers.get('server');
  if (server !== null && /\d/.test(server))
    problems.push(`server header leaks a version: "${server}"`);
  return problems;
}

/**
 * Чиста функція: перевіряє набір заголовків за правилами. Повертає список проблем.
 * @param {Headers} headers
 * @param {Record<string, (value: string) => boolean>} rules
 */
export function checkHeaders(headers, rules) {
  const problems = leakProblems(headers);
  for (const [name, isValid] of Object.entries(rules)) {
    const value = headers.get(name);
    if (value === null) problems.push(`${name} is missing`);
    else if (!isValid(value)) problems.push(`${name} has unexpected value "${value}"`);
  }
  return problems;
}

/** Знаходить шлях першого JS-бандла в index.html, щоб перевірити заголовки статики. */
const ASSET_PATTERNS = {
  '': /src="(\/assets\/[^"]+\.js)"/,
  '/admin': /src="(\/admin\/assets\/[^"]+\.js)"/,
};

/** @param {string} html @param {'' | '/admin'} [prefix] застосунок: сайт або адмінка */
export function firstAssetPath(html, prefix = '') {
  return ASSET_PATTERNS[prefix].exec(html)?.[1] ?? null;
}

const NOINDEX = { 'x-robots-tag': (v) => v.includes('noindex') };

async function run(baseUrl) {
  const report = [];
  const get = (path) => fetch(new URL(path, baseUrl), { redirect: 'manual' });

  const index = await get('/');
  const html = await index.text();
  report.push([
    '/',
    checkHeaders(index.headers, {
      ...REQUIRED_SPA,
      'cache-control': (v) => v.includes('no-store'),
    }),
  ]);

  const asset = firstAssetPath(html);
  if (asset === null) {
    report.push(['/assets/*', ['no /assets/*.js script found in index.html']]);
  } else {
    const res = await get(asset);
    report.push([
      asset,
      checkHeaders(res.headers, {
        ...REQUIRED_SPA,
        'cache-control': (v) => v.includes('immutable'),
      }),
    ]);
  }

  // SPA-фолбек теж має всі заголовки.
  const deep = await get('/profile');
  report.push(['/profile', checkHeaders(deep.headers, REQUIRED_SPA)]);

  // Адмінка: ті самі заголовки + noindex; глибокі посилання віддають index.html адмінки.
  const admin = await get('/admin/');
  const adminHtml = await admin.text();
  report.push([
    '/admin/',
    checkHeaders(admin.headers, {
      ...REQUIRED_SPA,
      ...NOINDEX,
      'cache-control': (v) => v.includes('no-store'),
    }),
  ]);
  const adminAsset = firstAssetPath(adminHtml, '/admin');
  if (adminAsset === null) {
    report.push(['/admin/assets/*', ['no /admin/assets/*.js script found in admin index.html']]);
  } else {
    const res = await get(adminAsset);
    report.push([
      adminAsset,
      checkHeaders(res.headers, {
        ...REQUIRED_SPA,
        'cache-control': (v) => v.includes('immutable'),
      }),
    ]);
  }
  const adminDeep = await get('/admin/events/new');
  const adminDeepProblems = checkHeaders(adminDeep.headers, { ...REQUIRED_SPA, ...NOINDEX });
  if (!(await adminDeep.text()).includes('/admin/assets/'))
    adminDeepProblems.push('deep link must serve the admin index.html');
  report.push(['/admin/events/new', adminDeepProblems]);

  const health = await get('/api/v1/health');
  const healthProblems = checkHeaders(health.headers, REQUIRED_API);
  if (health.status !== 200) healthProblems.push(`expected 200, got ${health.status}`);
  report.push(['/api/v1/health', healthProblems]);

  for (const path of ['/.env', '/.git/config', `${asset ?? '/assets/index.js'}.map`]) {
    const res = await get(path);
    report.push([
      path,
      res.status === 403 || res.status === 404 ? [] : [`expected 403/404, got ${res.status}`],
    ]);
  }
  return report;
}

const isMain = process.argv[1]?.endsWith('check-headers.mjs');
if (isMain) {
  const baseUrl = process.argv[2] ?? 'http://localhost:8080';
  const report = await run(baseUrl);
  let failed = false;
  for (const [path, problems] of report) {
    if (problems.length === 0) {
      console.log(`OK   ${path}`);
    } else {
      failed = true;
      for (const problem of problems) console.log(`FAIL ${path}: ${problem}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
