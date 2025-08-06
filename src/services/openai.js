import OpenAI from 'openai';

// Only load .env in Node.js environment (not in Cloudflare Workers)
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  try {
    const { config } = await import('dotenv');
    config();
  } catch (e) {
    // dotenv not available in Workers, which is fine
  }
}

const apiKey = process.env.OPENAI_API_KEY;

// Only create default client if env var is present
export const openai = apiKey ? new OpenAI({ apiKey }) : null;

// Function to create an OpenAI client with custom credentials
export function createOpenAIClient(credentials) {
  if (!credentials || !credentials.openaiKey) {
    throw new Error('Missing OpenAI API key');
  }
  return new OpenAI({ apiKey: credentials.openaiKey });
}

export async function generateEmbedding(text, credentials = null) {
  const client = credentials ? createOpenAIClient(credentials) : openai;
  if (!client) {
    throw new Error('No OpenAI client available - provide credentials or set OPENAI_API_KEY');
  }
  
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text
  });
  
  return response.data[0].embedding;
}

/**
 * Analyze image and generate comprehensive description using GPT-4V
 */
export async function describeImage(imageUrl, credentials = null) {
  const client = credentials ? createOpenAIClient(credentials) : openai;
  if (!client) {
    throw new Error('No OpenAI client available - provide credentials or set OPENAI_API_KEY');
  }
  
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this image and provide:
1. A one-sentence caption
2. A 2-3 sentence summary  
3. A detailed description (2-3 paragraphs)
4. List of key objects/elements (comma-separated)
5. List of descriptive tags (comma-separated)

Format as JSON with keys: caption, summary, detailed, objects, tags`
          },
          {
            type: "image_url",
            image_url: { url: imageUrl }
          }
        ]
      }],
      response_format: { type: "json_object" },
      max_tokens: 1000
    });

    const result = JSON.parse(response.choices[0].message.content);
    
    // Ensure all fields exist with defaults
    return {
      caption: result.caption || "Image uploaded",
      summary: result.summary || result.caption || "Image uploaded", 
      detailed: result.detailed || result.summary || result.caption || "Image uploaded",
      objects: Array.isArray(result.objects) ? result.objects : 
               (result.objects ? result.objects.split(',').map(s => s.trim()) : []),
      tags: Array.isArray(result.tags) ? result.tags :
            (result.tags ? result.tags.split(',').map(s => s.trim()) : [])
    };
  } catch (error) {
    console.error('Error describing image:', error);
    
    // Fallback description
    return {
      caption: "Image uploaded - AI description failed",
      summary: "Image uploaded - AI description failed", 
      detailed: "An image was uploaded but could not be automatically described due to an error.",
      objects: [],
      tags: ["image", "upload"]
    };
  }
}

/**
 * Create searchable chunks from image description
 */
export function createImageChunks(description) {
  const chunks = [];

  // Caption chunk - short, punchy description
  if (description.caption) {
    chunks.push({
      content: description.caption,
      chunk_type: 'caption'
    });
  }

  // Summary chunk - medium description
  if (description.summary && description.summary !== description.caption) {
    chunks.push({
      content: description.summary,
      chunk_type: 'summary'
    });
  }

  // Detailed chunk - full description
  if (description.detailed && description.detailed !== description.summary) {
    chunks.push({
      content: description.detailed,
      chunk_type: 'description'
    });
  }

  // Objects chunk - for searching by objects in image
  if (description.objects && description.objects.length > 0) {
    chunks.push({
      content: description.objects.join(', '),
      chunk_type: 'objects'
    });
  }

  // Tags chunk - for searching by descriptive tags
  if (description.tags && description.tags.length > 0) {
    chunks.push({
      content: description.tags.join(', '),
      chunk_type: 'tags'
    });
  }

  return chunks;
}