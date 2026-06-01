-- CreateTable
CREATE TABLE "user_release_acks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "release_id" TEXT NOT NULL,
    "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_release_acks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "achievement_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seen_at" TIMESTAMP(3),

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_release_acks_user_id_idx" ON "user_release_acks"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_release_acks_user_id_release_id_key" ON "user_release_acks"("user_id", "release_id");

-- CreateIndex
CREATE INDEX "user_achievements_user_id_period_idx" ON "user_achievements"("user_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "user_achievements_user_id_achievement_id_period_key" ON "user_achievements"("user_id", "achievement_id", "period");

-- AddForeignKey
ALTER TABLE "user_release_acks" ADD CONSTRAINT "user_release_acks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
