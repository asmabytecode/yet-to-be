-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "requiresMfa" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,

    PRIMARY KEY ("roleId", "permission"),
    CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "grantedById" TEXT,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "roleId"),
    CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- Seed: системні ролі (id збігаються з apps/api/src/modules/iam/iam.constants.ts).
-- owner отримує всі права в коді, тож рядків у role_permissions для нього немає.
INSERT INTO "roles" ("id", "key", "name", "description", "isSystem", "requiresMfa", "createdAt", "updatedAt") VALUES
    ('00000000-0000-4000-8000-000000000001', 'owner', 'Власник', 'Повний доступ. Призначається лише командою owner:grant.', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('00000000-0000-4000-8000-000000000002', 'admin', 'Адміністратор', 'Стартовий набір прав адміністратора.', true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "role_permissions" ("roleId", "permission") VALUES
    ('00000000-0000-4000-8000-000000000002', 'events:read'),
    ('00000000-0000-4000-8000-000000000002', 'events:write'),
    ('00000000-0000-4000-8000-000000000002', 'events:publish'),
    ('00000000-0000-4000-8000-000000000002', 'events:delete'),
    ('00000000-0000-4000-8000-000000000002', 'registrations:read'),
    ('00000000-0000-4000-8000-000000000002', 'registrations:manage'),
    ('00000000-0000-4000-8000-000000000002', 'media:write'),
    ('00000000-0000-4000-8000-000000000002', 'media:delete'),
    ('00000000-0000-4000-8000-000000000002', 'users:read'),
    ('00000000-0000-4000-8000-000000000002', 'users:block'),
    ('00000000-0000-4000-8000-000000000002', 'roles:read'),
    ('00000000-0000-4000-8000-000000000002', 'audit:read');

-- Перенесення: наявні адміністратори (users.role = 'admin') отримують системну роль admin.
INSERT INTO "user_roles" ("userId", "roleId", "grantedAt")
    SELECT "id", '00000000-0000-4000-8000-000000000002', CURRENT_TIMESTAMP FROM "users" WHERE "role" = 'admin';
