-- Focal point for gallery photos and denormalized current-avatar focus on users
ALTER TABLE "user_photos" ADD COLUMN "focus_x" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "user_photos" ADD COLUMN "focus_y" INTEGER NOT NULL DEFAULT 50;

ALTER TABLE "users" ADD COLUMN "avatar_focus_x" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "users" ADD COLUMN "avatar_focus_y" INTEGER NOT NULL DEFAULT 50;
