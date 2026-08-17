
-- Drop existing functions that conflict
DROP FUNCTION IF EXISTS match_user_memory(vector, uuid, double precision, integer);
DROP FUNCTION IF EXISTS match_venue_knowledge(vector, uuid, double precision, integer);
DROP FUNCTION IF EXISTS match_venue_profiles(vector, double precision, double precision, double precision, integer);

-- Recreate match_venue_knowledge
CREATE OR REPLACE FUNCTION match_venue_knowledge(
  query_embedding vector(384),
  target_venue_id UUID,
  match_threshold FLOAT DEFAULT 0.5,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  doc_type TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    akd.id,
    akd.content,
    akd.doc_type,
    akd.metadata::jsonb,
    (1 - (akd.embedding <=> query_embedding))::FLOAT AS similarity
  FROM ai_knowledge_docs akd
  WHERE akd.venue_id = target_venue_id
    AND akd.embedding IS NOT NULL
    AND 1 - (akd.embedding <=> query_embedding) > match_threshold
  ORDER BY akd.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Recreate match_venue_profiles
CREATE OR REPLACE FUNCTION match_venue_profiles(
  query_embedding vector(384),
  user_lat FLOAT DEFAULT NULL,
  user_lng FLOAT DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  doc_type TEXT,
  metadata JSONB,
  venue_id UUID,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    akd.id,
    akd.content,
    akd.doc_type,
    akd.metadata::jsonb,
    akd.venue_id,
    (1 - (akd.embedding <=> query_embedding))::FLOAT AS similarity
  FROM ai_knowledge_docs akd
  WHERE akd.doc_type = 'venue_profile'
    AND akd.embedding IS NOT NULL
    AND 1 - (akd.embedding <=> query_embedding) > match_threshold
  ORDER BY akd.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Recreate match_user_memory
CREATE OR REPLACE FUNCTION match_user_memory(
  query_embedding vector(384),
  target_user_id UUID,
  match_threshold FLOAT DEFAULT 0.4,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  memory_type TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    um.id,
    um.content,
    um.memory_type,
    um.metadata::jsonb,
    (1 - (um.embedding <=> query_embedding))::FLOAT AS similarity
  FROM user_memory um
  WHERE um.user_id = target_user_id
    AND um.embedding IS NOT NULL
    AND 1 - (um.embedding <=> query_embedding) > match_threshold
  ORDER BY um.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Knowledge doc unique index for menu sync
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_docs_unique_item
  ON ai_knowledge_docs (venue_id, doc_type, ((metadata->>'menu_item_id')))
  WHERE metadata->>'menu_item_id' IS NOT NULL;

-- Menu item sync trigger
CREATE OR REPLACE FUNCTION sync_menu_item_to_knowledge()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO ai_knowledge_docs (venue_id, doc_type, content, metadata)
  VALUES (
    NEW.venue_id,
    'menu_item',
    NEW.name || ' - $' || NEW.base_price || ' - ' || COALESCE(NEW.description, 'No description') || '. Category: ' || COALESCE(NEW.category, 'Uncategorized'),
    jsonb_build_object('menu_item_id', NEW.id, 'price', NEW.base_price, 'category', NEW.category, 'available', NEW.available)
  )
  ON CONFLICT (venue_id, doc_type, (metadata->>'menu_item_id'))
  WHERE metadata->>'menu_item_id' IS NOT NULL
  DO UPDATE SET
    content = EXCLUDED.content,
    metadata = EXCLUDED.metadata,
    updated_at = now(),
    embedding = NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_menu_to_knowledge ON venue_menu_items;
CREATE TRIGGER trigger_sync_menu_to_knowledge
  AFTER INSERT OR UPDATE ON venue_menu_items
  FOR EACH ROW
  EXECUTE FUNCTION sync_menu_item_to_knowledge();
