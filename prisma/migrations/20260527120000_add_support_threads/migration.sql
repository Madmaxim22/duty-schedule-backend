-- CreateEnum
CREATE TYPE "SupportThreadStatus" AS ENUM ('open', 'closed');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'support_message';

-- CreateTable
CREATE TABLE "support_threads" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "status" "SupportThreadStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_threads_author_id_updated_at_idx" ON "support_threads"("author_id", "updated_at");

-- CreateIndex
CREATE INDEX "support_threads_status_updated_at_idx" ON "support_threads"("status", "updated_at");

-- CreateIndex
CREATE INDEX "support_messages_thread_id_created_at_idx" ON "support_messages"("thread_id", "created_at");

-- AddForeignKey
ALTER TABLE "support_threads" ADD CONSTRAINT "support_threads_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "support_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
