-- CreateTable
CREATE TABLE "ShortUrl" (
    "code" VARCHAR(32) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "longUrl" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessAt" TIMESTAMPTZ,

    CONSTRAINT "ShortUrl_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "idx_short_urls_expires_at" ON "ShortUrl"("expiresAt");

-- CreateIndex
CREATE INDEX "idx_short_urls_last_access_at" ON "ShortUrl"("lastAccessAt");
