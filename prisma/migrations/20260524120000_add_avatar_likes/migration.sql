-- CreateTable
CREATE TABLE "avatar_likes" (
    "id" TEXT NOT NULL,
    "liker_id" TEXT NOT NULL,
    "target_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),

    CONSTRAINT "avatar_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "avatar_likes_liker_id_target_user_id_key" ON "avatar_likes"("liker_id", "target_user_id");

-- CreateIndex
CREATE INDEX "avatar_likes_target_user_id_notified_at_idx" ON "avatar_likes"("target_user_id", "notified_at");

-- AddForeignKey
ALTER TABLE "avatar_likes" ADD CONSTRAINT "avatar_likes_liker_id_fkey" FOREIGN KEY ("liker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avatar_likes" ADD CONSTRAINT "avatar_likes_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
