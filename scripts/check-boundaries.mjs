// Перевіряє межі модулів API: код поза modules/<name>/ може імпортувати модуль лише
// через його публічний вхід (modules/<name> або modules/<name>/index). Так внутрішні
// репозиторії й сервіси одного модуля не стають залежністю іншого.
//   node scripts/check-boundaries.mjs <srcDir>
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const IMPORT_RE =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;

/** Специфікатори відносних імпортів у файлі. */
export function importsOf(source) {
  const result = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const spec = match[1] ?? match[2] ?? match[3];
    if (spec !== undefined && spec.startsWith('.')) result.push(spec);
  }
  return result;
}

/** Назва модуля, якому належить шлях (відносно src), або null. */
function moduleOf(relPath) {
  const parts = relPath.split(/[\\/]/);
  return parts[0] === 'modules' && parts.length >= 2 ? parts[1] : null;
}

/**
 * @param {{ path: string, source: string }[]} files шляхи відносно src
 * @returns {string[]} опис порушень
 */
export function findViolations(files) {
  const violations = [];
  for (const file of files) {
    const own = moduleOf(file.path);
    for (const spec of importsOf(file.source)) {
      const target = relative('.', join(dirname(file.path), spec))
        .split(sep)
        .join('/');
      const targetModule = moduleOf(target);
      if (targetModule === null || targetModule === own) continue;
      const publicEntry = [`modules/${targetModule}`, `modules/${targetModule}/index`];
      if (!publicEntry.includes(target)) {
        violations.push(`${file.path}: imports "${spec}" — use modules/${targetModule} (index)`);
      }
    }
  }
  return violations;
}

function collect(dir, root, out) {
  for (const name of readdirSync(dir)) {
    if (name === 'generated' || name === 'node_modules') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full, root, out);
    else if (/\.(ts|tsx|mts|cts)$/.test(name)) {
      out.push({
        path: relative(root, full).split(sep).join('/'),
        source: readFileSync(full, 'utf8'),
      });
    }
  }
  return out;
}

const isMain = process.argv[1]?.endsWith('check-boundaries.mjs');
if (isMain) {
  const root = resolve(process.argv[2] ?? 'src');
  const violations = findViolations(collect(root, root, []));
  if (violations.length > 0) {
    console.error(`Module boundary violations (${violations.length}):\n${violations.join('\n')}`);
    process.exit(1);
  }
  console.log('Module boundaries OK');
}
