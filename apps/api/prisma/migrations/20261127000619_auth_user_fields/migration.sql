/*
  Warnings:

  - You are about to drop the column `displayNameEncrypted` on the `users` table. All the data in the column will be lost.
  - Added the required column `displayName` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailEncrypted" TEXT NOT NULL,
    "emailBlindIndex" TEXT NOT NULL,
    "passwordHash" TEXT,
    "displayName" TEXT NOT NULL,
    "firstNameEncrypted" TEXT,
    "lastNameEncrypted" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "emailVerifiedAt" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("createdAt", "emailBlindIndex", "emailEncrypted", "emailVerifiedAt", "id", "lastLoginAt", "passwordHash", "role", "updatedAt") SELECT "createdAt", "emailBlindIndex", "emailEncrypted", "emailVerifiedAt", "id", "lastLoginAt", "passwordHash", "role", "updatedAt" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_emailBlindIndex_key" ON "users"("emailBlindIndex");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
