CREATE TABLE "notifications" (
    "id"         UUID          NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID          NOT NULL,
    "title"      VARCHAR(200)  NOT NULL,
    "body"       VARCHAR(500)  NOT NULL,
    "type"       VARCHAR(50)   NOT NULL,
    "data"       JSONB,
    "read_at"    TIMESTAMP(6),
    "created_at" TIMESTAMP(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_notifications_user"   ON "notifications"("user_id", "created_at" DESC);
CREATE INDEX "idx_notifications_unread" ON "notifications"("user_id", "read_at");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
