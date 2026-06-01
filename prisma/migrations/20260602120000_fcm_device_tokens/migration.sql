-- CreateTable
CREATE TABLE "fcm_device_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fcm_device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fcm_device_tokens_token_key" ON "fcm_device_tokens"("token");

-- CreateIndex
CREATE INDEX "fcm_device_tokens_user_id_idx" ON "fcm_device_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "fcm_device_tokens" ADD CONSTRAINT "fcm_device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
