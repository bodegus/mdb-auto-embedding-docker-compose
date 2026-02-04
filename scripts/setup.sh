#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Check secrets exist
if [ ! -f secrets/password ] || [ ! -f secrets/voyage-api-key ]; then
  echo "Error: Missing secrets. Copy the example files and add your values:"
  echo "  cp secrets/password.example secrets/password"
  echo "  cp secrets/voyage-api-key.example secrets/voyage-api-key"
  exit 1
fi

# Start mongod
echo "Starting mongod..."
docker-compose up -d mongod
sleep 10

# Initialize replica set
echo "Initializing replica set..."
mongosh mongodb://localhost:27020 --quiet --eval "
  try { rs.initiate(); print('Replica set initiated'); }
  catch (e) { if (e.codeName === 'AlreadyInitialized') print('Already initialized'); else throw e; }
"
sleep 5

# Create mongot user
echo "Creating mongot user..."
PASSWORD=$(cat secrets/password)
mongosh mongodb://localhost:27020 --quiet --eval "
  db = db.getSiblingDB('admin');
  try {
    db.createUser({
      user: 'mongotUser',
      pwd: '$PASSWORD',
      roles: [{ role: 'searchCoordinator', db: 'admin' }]
    });
    print('mongotUser created');
  } catch (e) {
    if (e.codeName === 'DuplicateKey') print('mongotUser exists');
    else throw e;
  }
"

# Start mongot
echo "Starting mongot..."
docker-compose up -d mongot
sleep 15

echo ""
echo "Setup complete! Connection: mongodb://localhost:27020"
echo ""
echo "Next steps:"
echo "  mongosh mongodb://localhost:27020/wikipedia scripts/create-index.js"
echo "  mongosh mongodb://localhost:27020/wikipedia scripts/test-embedding.js"
