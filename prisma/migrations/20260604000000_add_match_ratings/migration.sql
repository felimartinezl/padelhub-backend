CREATE TABLE "match_ratings" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "match_id"   UUID         NOT NULL,
    "rater_id"   UUID         NOT NULL,
    "rated_id"   UUID         NOT NULL,
    "stars"      INTEGER      NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_ratings_pkey"   PRIMARY KEY ("id"),
    CONSTRAINT "match_ratings_stars"  CHECK ("stars" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "uq_match_rating"   ON "match_ratings"("match_id", "rater_id", "rated_id");
CREATE INDEX        "idx_ratings_rated" ON "match_ratings"("rated_id");
CREATE INDEX        "idx_ratings_match" ON "match_ratings"("match_id");
CREATE INDEX        "idx_ratings_rater" ON "match_ratings"("rater_id");

ALTER TABLE "match_ratings" ADD CONSTRAINT "match_ratings_match_id_fkey"
  FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "match_ratings" ADD CONSTRAINT "match_ratings_rater_id_fkey"
  FOREIGN KEY ("rater_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "match_ratings" ADD CONSTRAINT "match_ratings_rated_id_fkey"
  FOREIGN KEY ("rated_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
