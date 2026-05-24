-- CreateTable
CREATE TABLE "user_photos" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_likes" (
    "id" TEXT NOT NULL,
    "liker_id" TEXT NOT NULL,
    "photo_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),

    CONSTRAINT "photo_likes_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "current_photo_id" TEXT;

-- CreateIndex
CREATE INDEX "user_photos_user_id_is_current_idx" ON "user_photos"("user_id", "is_current");

-- CreateIndex
CREATE INDEX "user_photos_user_id_created_at_idx" ON "user_photos"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_current_photo_id_key" ON "users"("current_photo_id");

-- CreateIndex
CREATE UNIQUE INDEX "photo_likes_liker_id_photo_id_key" ON "photo_likes"("liker_id", "photo_id");

-- CreateIndex
CREATE INDEX "photo_likes_photo_id_notified_at_idx" ON "photo_likes"("photo_id", "notified_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_current_photo_id_fkey" FOREIGN KEY ("current_photo_id") REFERENCES "user_photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_photos" ADD CONSTRAINT "user_photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_likes" ADD CONSTRAINT "photo_likes_liker_id_fkey" FOREIGN KEY ("liker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_likes" ADD CONSTRAINT "photo_likes_photo_id_fkey" FOREIGN KEY ("photo_id") REFERENCES "user_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing avatars into user_photos
INSERT INTO "user_photos" ("id", "user_id", "url", "is_current", "created_at")
SELECT gen_random_uuid()::text, "id", COALESCE("avatar_url", '/uploads/avatars/' || "id" || '.webp'), true, NOW()
FROM "users"
WHERE "avatar_url" IS NOT NULL;

UPDATE "user_photos" SET "url" = '/uploads/photos/' || "id" || '.webp';

UPDATE "users" u
SET "current_photo_id" = p."id",
    "avatar_url" = '/uploads/photos/' || p."id" || '.webp'
FROM "user_photos" p
WHERE p."user_id" = u."id" AND p."is_current" = true AND u."avatar_url" IS NOT NULL;

-- Migrate avatar_likes to photo_likes (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'avatar_likes') THEN
    INSERT INTO "photo_likes" ("id", "liker_id", "photo_id", "created_at", "notified_at")
    SELECT al."id", al."liker_id", p."id", al."created_at", al."notified_at"
    FROM "avatar_likes" al
    INNER JOIN "user_photos" p ON p."user_id" = al."target_user_id" AND p."is_current" = true;

    DROP TABLE "avatar_likes";
  END IF;
END $$;
