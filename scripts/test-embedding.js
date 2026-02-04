// Test auto-embedding with sample documents and queries
// Run with: mongosh mongodb://localhost:27020/wikipedia scripts/test-embedding.js

db = db.getSiblingDB("wikipedia");

// Insert test documents
print("Inserting test documents...");

db.articles.insertMany([
  {
    title: "Machine Learning",
    content: "Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed. It focuses on developing algorithms that can access data and use it to learn for themselves."
  },
  {
    title: "Neural Networks",
    content: "Artificial neural networks are computing systems inspired by biological neural networks. They consist of interconnected nodes that process information using connectionist approaches to computation."
  },
  {
    title: "Deep Learning",
    content: "Deep learning is part of a broader family of machine learning methods based on artificial neural networks with representation learning. It can be supervised, semi-supervised or unsupervised."
  }
]);

print("Inserted 3 test documents.");
print("Waiting 30 seconds for embeddings to be generated...");
sleep(30000);

// Run semantic search query
print("\nRunning semantic search for 'AI algorithms that learn from data'...\n");

const results = db.articles.aggregate([
  {
    $vectorSearch: {
      index: "vector_index",
      path: "content",
      query: {
        text: "AI algorithms that learn from data"
      },
      numCandidates: 100,
      limit: 10
    }
  },
  {
    $project: {
      _id: 0,
      title: 1,
      content: 1,
      score: { $meta: "vectorSearchScore" }
    }
  }
]).toArray();

print("Results:");
printjson(results);
