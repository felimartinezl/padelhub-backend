CREATE TABLE "match_messages" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "match_id"   UUID         NOT NULL,
    "user_id"    UUID         NOT NULL,
    "content"    VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_match_messages_match_date" ON "match_messages"("match_id", "created_at" DESC);
CREATE INDEX "idx_match_messages_user"       ON "match_messages"("user_id");

ALTER TABLE "match_messages" ADD CONSTRAINT "match_messages_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "match_messages" ADD CONSTRAINT "match_messages_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
