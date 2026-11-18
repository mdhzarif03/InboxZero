-- Full-text search for messages.
-- Runs after the init migration. Idempotent where possible.
-- searchVector is maintained by trigger so application code cannot forget to update it.

ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "searchVector" tsvector;

CREATE OR REPLACE FUNCTION message_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('simple', coalesce(NEW."subject", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW."fromName", '') || ' ' || coalesce(NEW."fromAddress", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW."bodyText", '')), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS message_search_vector_trg ON "Message";
CREATE TRIGGER message_search_vector_trg
  BEFORE INSERT OR UPDATE OF "subject", "fromName", "fromAddress", "bodyText"
  ON "Message"
  FOR EACH ROW EXECUTE FUNCTION message_search_vector_update();

CREATE INDEX IF NOT EXISTS message_search_vector_idx ON "Message" USING GIN ("searchVector");
