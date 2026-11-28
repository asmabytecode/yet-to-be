import { describe, expect, it } from 'vitest';
import { findViolations, importsOf } from './check-boundaries.mjs';

describe('importsOf', () => {
  it('collects relative static, side-effect and dynamic imports', () => {
    const source = [
      "import { a } from './a';",
      "import type { B } from '../b';",
      "export { c } from './c';",
      "import './side-effect';",
      "const d = await import('./d');",
      "import { z } from 'zod';",
    ].join('\n');
    expect(importsOf(source)).toEqual(['./a', '../b', './c', './side-effect', './d']);
  });
});

describe('findViolations', () => {
  it('allows imports through the public entry and inside the same module', () => {
    const files = [
      { path: 'app.module.ts', source: "import { IamModule } from './modules/iam';" },
      { path: 'auth/auth.module.ts', source: "import { IamModule } from '../modules/iam/index';" },
      {
        path: 'modules/iam/iam.service.ts',
        source: "import { RolesRepository } from './roles.repository';",
      },
      { path: 'modules/iam/iam.service.ts', source: "import { AuditService } from '../audit';" },
    ];
    expect(findViolations(files)).toEqual([]);
  });

  it('reports deep imports into another module', () => {
    const files = [
      {
        path: 'auth/auth.service.ts',
        source: "import { RolesRepository } from '../modules/iam/roles.repository';",
      },
      {
        path: 'modules/events/events.service.ts',
        source: "import { AuditService } from '../audit/audit.service';",
      },
    ];
    const violations = findViolations(files);
    expect(violations).toHaveLength(2);
    expect(violations[0]).toContain('modules/iam');
    expect(violations[1]).toContain('modules/audit');
  });

  it('ignores package imports and code outside modules', () => {
    const files = [
      {
        path: 'users/users.service.ts',
        source: "import { x } from '../common/x';\nimport y from 'zod';",
      },
    ];
    expect(findViolations(files)).toEqual([]);
  });
});
