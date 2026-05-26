-- CreateTable
CREATE TABLE "chat_message_deliveries" (
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "delivered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_message_deliveries_pkey" PRIMARY KEY ("message_id","user_id")
);

-- CreateIndex
CREATE INDEX "chat_message_deliveries_user_id_delivered_at_idx" ON "chat_message_deliveries"("user_id", "delivered_at");

-- AddForeignKey
ALTER TABLE "chat_message_deliveries" ADD CONSTRAINT "chat_message_deliveries_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_message_deliveries" ADD CONSTRAINT "chat_message_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
