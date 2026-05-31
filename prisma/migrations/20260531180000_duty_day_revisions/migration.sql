-- CreateTable
CREATE TABLE "duty_day_revisions" (
    "duty_date" DATE NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT,

    CONSTRAINT "duty_day_revisions_pkey" PRIMARY KEY ("duty_date")
);

-- AddForeignKey
ALTER TABLE "duty_day_revisions" ADD CONSTRAINT "duty_day_revisions_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill revisions for days that already have assignments
INSERT INTO "duty_day_revisions" ("duty_date", "revision", "updated_at")
SELECT DISTINCT "duty_date", 1, CURRENT_TIMESTAMP
FROM "duty_assignments"
ON CONFLICT ("duty_date") DO NOTHING;
