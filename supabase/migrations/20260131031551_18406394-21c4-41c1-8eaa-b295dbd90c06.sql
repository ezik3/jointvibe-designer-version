-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- AI Knowledge Documents: stores embeddings for RAG
CREATE TABLE public.ai_knowledge_docs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('menu_item', 'deal', 'faq', 'hours', 'rules', 'venue_profile')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding vector(1536),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- AI Messages: conversation history
CREATE TABLE public.ai_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  venue_id UUID REFERENCES public.venues(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('customer', 'venue', 'owner')),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User Memory: persistent user preferences and allergies
CREATE TABLE public.user_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('preference', 'allergy', 'favorite', 'summary')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding vector(1536),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Venue Memory: venue-specific patterns and insights
CREATE TABLE public.venue_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('faq_pattern', 'peak_times', 'popular_items', 'summary')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_ai_knowledge_docs_venue ON public.ai_knowledge_docs(venue_id);
CREATE INDEX idx_ai_knowledge_docs_type ON public.ai_knowledge_docs(doc_type);
CREATE INDEX idx_ai_messages_session ON public.ai_messages(session_id);
CREATE INDEX idx_ai_messages_user ON public.ai_messages(user_id);
CREATE INDEX idx_ai_messages_venue ON public.ai_messages(venue_id);
CREATE INDEX idx_user_memory_user ON public.user_memory(user_id);
CREATE INDEX idx_user_memory_type ON public.user_memory(memory_type);
CREATE INDEX idx_venue_memory_venue ON public.venue_memory(venue_id);

-- Enable RLS
ALTER TABLE public.ai_knowledge_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_memory ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_knowledge_docs
-- Public can read venue profiles for discovery
CREATE POLICY "Anyone can read venue profiles" ON public.ai_knowledge_docs
  FOR SELECT USING (doc_type = 'venue_profile' OR venue_id IS NULL);

-- Authenticated users can read docs for venues they're checked into or own
CREATE POLICY "Users can read venue-specific docs" ON public.ai_knowledge_docs
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
      venue_id IN (SELECT venue_id FROM public.check_ins WHERE user_id = auth.uid() AND checked_out_at IS NULL)
      OR venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
    )
  );

-- Venue owners can manage their docs
CREATE POLICY "Venue owners can insert docs" ON public.ai_knowledge_docs
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "Venue owners can update docs" ON public.ai_knowledge_docs
  FOR UPDATE USING (
    venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "Venue owners can delete docs" ON public.ai_knowledge_docs
  FOR DELETE USING (
    venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
  );

-- RLS Policies for ai_messages
CREATE POLICY "Users can read their own messages" ON public.ai_messages
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own messages" ON public.ai_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for user_memory
CREATE POLICY "Users can read their own memory" ON public.user_memory
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own memory" ON public.user_memory
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own memory" ON public.user_memory
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own memory" ON public.user_memory
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for venue_memory
CREATE POLICY "Venue owners can read their venue memory" ON public.venue_memory
  FOR SELECT USING (
    venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "Venue owners can insert venue memory" ON public.venue_memory
  FOR INSERT WITH CHECK (
    venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "Venue owners can update venue memory" ON public.venue_memory
  FOR UPDATE USING (
    venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
  );

CREATE POLICY "Venue owners can delete venue memory" ON public.venue_memory
  FOR DELETE USING (
    venue_id IN (SELECT id FROM public.venues WHERE owner_user_id = auth.uid())
  );

-- Update timestamp triggers
CREATE TRIGGER update_ai_knowledge_docs_updated_at
  BEFORE UPDATE ON public.ai_knowledge_docs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_memory_updated_at
  BEFORE UPDATE ON public.user_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_venue_memory_updated_at
  BEFORE UPDATE ON public.venue_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Vector similarity search function
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding vector(1536),
  filter_venue_id UUID DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  venue_id UUID,
  doc_type TEXT,
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
    d.id,
    d.venue_id,
    d.doc_type,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM ai_knowledge_docs d
  WHERE 
    (filter_venue_id IS NULL OR d.venue_id = filter_venue_id OR d.venue_id IS NULL)
    AND d.embedding IS NOT NULL
    AND 1 - (d.embedding <=> query_embedding) > match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to match user memory
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