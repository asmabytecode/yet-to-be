-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL DEFAULT 'default',
    "uploadedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "rejectReason" TEXT,
    "originalSha256" TEXT NOT NULL,
    "originalSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "variants" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateIndex
CREATE INDEX "media_assets_uploadedById_createdAt_idx" ON "media_assets"("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "media_assets_status_idx" ON "media_assets"("status");
