-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text', 'image')),
  file_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chunks with embeddings (auto-populated)
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast similarity search function with configurable threshold
CREATE OR REPLACE FUNCTION search_chunks(
  query_embedding vector(1536),
  match_count int DEFAULT 10,
  similarity_threshold double precision DEFAULT 0.7
)
RETURNS TABLE (
  content text,
  similarity double precision,
  filename text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity,
    d.filename
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  WHERE (1 - (dc.embedding <=> query_embedding)) > similarity_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create storage bucket for images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'images',
  'images', 
  true,
  10485760,
  '{"image/png","image/jpeg","image/jpg","image/gif","image/webp"}'
)
ON CONFLICT (id) DO NOTHING;


-- Create document_relationships table to track relationships between documents
CREATE TABLE IF NOT EXISTS document_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  child_document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure we don't duplicate relationships
  UNIQUE(parent_document_id, child_document_id, relationship_type)
);

-- Create indexes for efficient querying
CREATE INDEX idx_document_relationships_parent ON document_relationships(parent_document_id);
CREATE INDEX idx_document_relationships_child ON document_relationships(child_document_id);
CREATE INDEX idx_document_relationships_type ON document_relationships(relationship_type);