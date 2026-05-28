-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "reply_to_message_id" TEXT;

-- CreateIndex
CREATE INDEX "chat_messages_reply_to_message_id_idx" ON "chat_messages"("reply_to_message_id");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
