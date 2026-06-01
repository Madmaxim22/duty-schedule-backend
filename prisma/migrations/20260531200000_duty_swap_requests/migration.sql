-- CreateEnum
CREATE TYPE "DutySwapRequestStatus" AS ENUM ('pending_counterparty', 'rejected_counterparty', 'pending_admin', 'approved', 'rejected_admin', 'cancelled');

-- CreateEnum
CREATE TYPE "ChatMessageKind" AS ENUM ('text', 'duty_swap_request');

-- AlterEnum
ALTER TYPE "DutyChangeSource" ADD VALUE 'swap';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'duty_swap';

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "kind" "ChatMessageKind" NOT NULL DEFAULT 'text';
ALTER TABLE "chat_messages" ADD COLUMN "payload" JSONB;

-- CreateTable
CREATE TABLE "duty_swap_requests" (
    "id" TEXT NOT NULL,
    "requester_id" TEXT NOT NULL,
    "counterparty_id" TEXT NOT NULL,
    "requester_duty_date" DATE NOT NULL,
    "requester_section" "DutySection" NOT NULL,
    "requester_office" TEXT NOT NULL,
    "counterparty_duty_date" DATE NOT NULL,
    "counterparty_section" "DutySection" NOT NULL,
    "counterparty_office" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DutySwapRequestStatus" NOT NULL DEFAULT 'pending_counterparty',
    "counterparty_reject_reason" TEXT,
    "counterparty_responded_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "admin_comment" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "chat_message_id" TEXT,
    "chat_room_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "duty_swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "duty_swap_requests_chat_message_id_key" ON "duty_swap_requests"("chat_message_id");

-- CreateIndex
CREATE INDEX "duty_swap_requests_status_created_at_idx" ON "duty_swap_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "duty_swap_requests_requester_id_idx" ON "duty_swap_requests"("requester_id");

-- CreateIndex
CREATE INDEX "duty_swap_requests_counterparty_id_idx" ON "duty_swap_requests"("counterparty_id");

-- AddForeignKey
ALTER TABLE "duty_swap_requests" ADD CONSTRAINT "duty_swap_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_swap_requests" ADD CONSTRAINT "duty_swap_requests_counterparty_id_fkey" FOREIGN KEY ("counterparty_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_swap_requests" ADD CONSTRAINT "duty_swap_requests_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "duty_swap_requests" ADD CONSTRAINT "duty_swap_requests_chat_message_id_fkey" FOREIGN KEY ("chat_message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
