# MongoDB Auto-Embedding with Voyage AI

Deploy MongoDB Community Edition 8.2 with automatic vector embedding generation using Voyage AI. Documents inserted into MongoDB automatically get embeddings generated, enabling semantic search without managing embedding pipelines.

## Overview

This project sets up:
- **MongoDB 8.2** (Community Server) with replica set
- **mongot** (Community Search) for Atlas Search and Vector Search
- **Voyage AI** integration for automatic embedding generation

When you insert a document, mongot automatically:
1. Detects the new document via change streams
2. Sends the text to Voyage AI for embedding
3. Stores the vector in an internal materialized view
4. Indexes it for vector search queries

## Prerequisites

- Docker with ~10GB free disk space
- [mongosh](https://www.mongodb.com/docs/mongodb-shell/install/) (MongoDB Shell)
- Voyage AI API key from [Atlas](https://cloud.mongodb.com/) (starts with `al-`)

## Quick Start

### 1. Configure Secrets

```bash
# Copy example files
cp secrets/password.example secrets/password
cp secrets/voyage-api-key.example secrets/voyage-api-key

# Edit with your values
echo "your-secure-password" > secrets/password
echo "al-your-voyage-api-key" > secrets/voyage-api-key
```

> **Note:** Get your Voyage API key from Atlas: Database → Data Services → Voyage AI

### 2. Run Setup

```bash
./scripts/setup.sh
```

This will:
- Start MongoDB with replica set on port 27020
- Create the `mongotUser` for search coordination
- Start mongot (search process) with Voyage AI configured

### 3. Create Vector Index

```bash
mongosh mongodb://localhost:27020/wikipedia scripts/create-index.js
```

Creates a vector search index with auto-embedding on the `content` field using `voyage-4` model.

### 4. Test Embeddings

```bash
mongosh mongodb://localhost:27020/wikipedia scripts/test-embedding.js
```

Inserts sample documents, waits for embeddings, and runs a semantic search.

## Usage

### Insert Documents

```javascript
db.articles.insertOne({
  title: "Your Article",
  content: "Text content that will be automatically embedded..."
});
```

### Semantic Search

```javascript
db.articles.aggregate([
  {
    $vectorSearch: {
      index: "vector_index",
      path: "content",
      query: { text: "your search query" },
      numCandidates: 100,
      limit: 10
    }
  },
  {
    $project: {
      title: 1,
      content: 1,
      score: { $meta: "vectorSearchScore" }
    }
  }
]);
```

### Search with Pre-computed Vector

```javascript
db.articles.aggregate([
  {
    $vectorSearch: {
      index: "vector_index",
      queryVector: [0.1, 0.2, ...],  // 1024-dim vector
      path: "content",
      numCandidates: 100,
      limit: 10
    }
  }
]);
```

## Configuration

### mongot.yml

Key settings in `config/mongot.yml`:

```yaml
embedding:
  queryKeyFile: /etc/mongot/secrets/voyage-api-key
  indexingKeyFile: /etc/mongot/secrets/voyage-api-key
  providerEndpoint: https://ai.mongodb.com/v1/embeddings
  isAutoEmbeddingViewWriter: true  # Required for embedding generation
```

| Setting | Description |
|---------|-------------|
| `queryKeyFile` | Voyage API key for query-time embedding |
| `indexingKeyFile` | Voyage API key for document embedding |
| `providerEndpoint` | Must use MongoDB AI proxy for Atlas keys |
| `isAutoEmbeddingViewWriter` | Enables leader mode (generates embeddings) |

### Supported Models

| Model | Dimensions | Use Case |
|-------|------------|----------|
| `voyage-4-lite` | 512 | Fastest, lower quality |
| `voyage-4` | 1024 | Balanced (default) |
| `voyage-4-large` | 1024 | Highest quality |
| `voyage-code-3` | 1024 | Code-optimized |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Network                           │
│                                                             │
│  ┌───────────┐       gRPC        ┌───────────────────────┐  │
│  │  mongod   │◄─────────────────►│        mongot         │  │
│  │ port 27020│                   │   (search process)    │  │
│  │           │                   │                       │  │
│  │  MongoDB  │                   │  ┌─────────────────┐  │  │
│  │   8.2     │                   │  │  Leader Mode    │  │  │
│  └───────────┘                   │  │  (embedding     │  │  │
│       │                          │  │   generation)   │  │  │
│       │                          │  └────────┬────────┘  │  │
│       │                          │           │           │  │
│       │                          │           ▼           │  │
│       │                          │  ┌─────────────────┐  │  │
│       │                          │  │  MongoDB AI     │──┼──┼──► Voyage AI
│       │                          │  │  Proxy          │  │  │
│       │                          │  └─────────────────┘  │  │
│       │                          │           │           │  │
│       ▼                          │           ▼           │  │
│  ┌───────────────┐               │  ┌─────────────────┐  │  │
│  │ __mdb_internal│◄──────────────│  │  Lucene Index   │  │  │
│  │ _search       │  embeddings   │  │  (queries)      │  │  │
│  └───────────────┘               │  └─────────────────┘  │  │
│                                  └───────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
├── config/
│   ├── mongod.conf          # MongoDB server configuration
│   └── mongot.yml           # Search process configuration
├── scripts/
│   ├── setup.sh             # Deployment script
│   ├── create-index.js      # Creates vector index
│   └── test-embedding.js    # Tests embedding + search
├── secrets/
│   ├── password             # mongotUser password (gitignored)
│   ├── password.example     # Template
│   ├── voyage-api-key       # Voyage API key (gitignored)
│   └── voyage-api-key.example # Template
└── docker-compose.yml       # Container orchestration
```

## Troubleshooting

### Check Container Status

```bash
docker ps
docker logs mongot 2>&1 | tail -50
```

### Verify Embeddings Generated

```bash
mongosh mongodb://localhost:27020 --eval '
  print("Embeddings: " +
    db.getSiblingDB("__mdb_internal_search")
      .getCollectionNames()
      .filter(c => c.match(/^[0-9a-f]{24}$/))
      .map(c => db.getSiblingDB("__mdb_internal_search").getCollection(c).countDocuments())
      .reduce((a,b) => a+b, 0)
  );
'
```

### Check Index Status

```bash
mongosh mongodb://localhost:27020/wikipedia --eval '
  db.articles.getSearchIndexes().forEach(printjson);
'
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| `NOT_STARTED` index state | Docker disk > 90% | `docker system prune -f` then restart mongot |
| `403` from Voyage API | Wrong endpoint | Use `https://ai.mongodb.com/v1/embeddings` for Atlas keys |
| No embeddings generated | Follower mode | Add `isAutoEmbeddingViewWriter: true` to mongot.yml |
| `missing model` error | Config not loaded | Restart mongot after config changes |

### Restart Fresh

```bash
docker-compose down -v
./scripts/setup.sh
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `docker-compose up -d` | Start all containers |
| `docker-compose down -v` | Stop and remove data |
| `docker-compose logs -f mongot` | Follow mongot logs |
| `docker exec mongot df -h /var/lib/mongot` | Check disk usage |

## License

MIT
