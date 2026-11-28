-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "actorId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "hash" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "prevHash" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "requestId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "seq" INTEGER;
ALTER TABLE "audit_logs" ADD COLUMN "targetId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "targetType" TEXT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "mfaVerifiedAt" DATETIME;
ALTER TABLE "sessions" ADD COLUMN "stepUpAt" DATETIME;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "blockReason" TEXT;
ALTER TABLE "users" ADD COLUMN "blockedAt" DATETIME;
ALTER TABLE "users" ADD COLUMN "blockedById" TEXT;
ALTER TABLE "users" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "user_mfa" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "secretEncrypted" TEXT NOT NULL,
    "enabledAt" DATETIME,
    "lastUsedStep" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_mfa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mfa_recovery_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mfa_recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_seq_key" ON "audit_logs"("seq");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_idx" ON "audit_logs"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "mfa_recovery_codes_userId_idx" ON "mfa_recovery_codes"("userId");

-- Дані: для старих записів журналу актор — сам користувач (записи до Етапу 14 не входять у ланцюжок).
UPDATE "audit_logs" SET "actorId" = "userId" WHERE "actorId" IS NULL;
