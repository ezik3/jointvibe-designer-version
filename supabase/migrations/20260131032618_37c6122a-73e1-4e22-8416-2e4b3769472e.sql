-- Add unique constraints for memory upserts
ALTER TABLE public.user_memory 
ADD CONSTRAINT user_memory_user_type_unique UNIQUE (user_id, memory_type);

ALTER TABLE public.venue_memory 
ADD CONSTRAINT venue_memory_venue_type_unique UNIQUE (venue_id, memory_type);

-- Add index for faster memory lookups
CREATE INDEX IF NOT EXISTS idx_user_memory_user_id ON public.user_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_venue_memory_venue_id ON public.venue_memory(venue_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_user_session ON public.ai_messages(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_venue ON public.ai_messages(venue_id) WHERE venue_id IS NOT NULL;

-- Add embedding column to user_memory for semantic search on preferences
ALTER TABLE public.user_memory 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create function to match user memories
CREATE OR REPLACE FUNCTION public.match_user_memory(
  query_embedding vector(1536),
  filter_user_id UUID,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  memory_type TEXT,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.memory_type,
    m.content,
    m.metadata,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM user_memory m
  WHERE 
    m.user_id = filter_user_id
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;