-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "deleted_at" TIMESTAMP(3),
ADD COLUMN "deleted_by_id" TEXT;

-- CreateTable
CREATE TABLE "chat_message_user_hides" (
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hidden_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_user_hides_pkey" PRIMARY KEY ("message_id","user_id")
);

-- CreateIndex
CREATE INDEX "chat_message_user_hides_user_id_message_id_idx" ON "chat_message_user_hides"("user_id", "message_id");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_user_hides" ADD CONSTRAINT "chat_message_user_hides_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_user_hides" ADD CONSTRAINT "chat_message_user_hides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
