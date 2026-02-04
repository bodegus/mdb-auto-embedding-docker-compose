// Create vector search index with auto-embedding

// Create collection if it doesn't exist
db.createCollection("articles");

// Create vector search index with autoEmbed
db.articles.createSearchIndex(
  "vector_index",
  "vectorSearch",
  {
    fields: [
      {
        type: "autoEmbed",
        modality: "text",
        path: "content",
        model: "voyage-4"
      },
      {
        type: "filter",
        path: "title"
      }
    ]
  }
);

print("Vector search index 'vector_index' created on wikipedia.articles");
print("Index will generate embeddings for the 'content' field using voyage-4 model");
