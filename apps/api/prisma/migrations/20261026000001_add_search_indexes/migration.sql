CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "Chunk" ADD COLUMN "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED;
CREATE INDEX "Chunk_tsv_idx" ON "Chunk" USING GIN ("tsv");
CREATE INDEX "Chunk_embedding_idx" ON "Chunk" USING hnsw ("embedding" vector_cosine_ops);
CREATE UNIQUE INDEX "Message_one_streaming_per_chat" ON "Message" ("chatId") WHERE "status" = 'STREAMING' AND "role" = 'ASSISTANT';
