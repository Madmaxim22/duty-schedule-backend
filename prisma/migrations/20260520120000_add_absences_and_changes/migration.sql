-- CreateEnum
CREATE TYPE "DutyChangeType" AS ENUM ('assigned', 'removed', 'replaced');

-- CreateEnum
CREATE TYPE "DutyChangeSource" AS ENUM ('import', 'manual');

-- CreateTable
CREATE TABLE "user_absences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "absence_date" DATE NOT NULL,
    "absence_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "duty_assignment_changes" (
    "id" TEXT NOT NULL,
    "duty_date" DATE NOT NULL,
    "section" "DutySection" NOT NULL,
    "office" TEXT NOT NULL,
    "previous_user_id" TEXT,
    "new_user_id" TEXT,
    "change_type" "DutyChangeType" NOT NULL,
    "source" "DutyChangeSource" NOT NULL,
    "batch_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMP(3),

    CONSTRAINT "duty_assignment_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_absences_user_id_absence_date_key" ON "user_absences"("user_id", "absence_date");

-- CreateIndex
CREATE INDEX "user_absences_absence_date_idx" ON "user_absences"("absence_date");

-- CreateIndex
CREATE INDEX "duty_assignment_changes_notified_at_created_at_idx" ON "duty_assignment_changes"("notified_at", "created_at");

-- CreateIndex
CREATE INDEX "duty_assignment_changes_created_at_idx" ON "duty_assignment_changes"("created_at");

-- AddForeignKey
ALTER TABLE "user_absences" ADD CONSTRAINT "user_absences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignment_changes" ADD CONSTRAINT "duty_assignment_changes_previous_user_id_fkey" FOREIGN KEY ("previous_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_assignment_changes" ADD CONSTRAINT "duty_assignment_changes_new_user_id_fkey" FOREIGN KEY ("new_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
