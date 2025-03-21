#!/bin/bash

# This script is intended to be used in a Vercel build step
# to properly handle PostgreSQL enum modifications during deployment

# Exit immediately if a command exits with a non-zero status
set -e

echo "Running database migrations..."

# First attempt - standard migration
if npx prisma migrate deploy; then
  echo "Migrations completed successfully!"
else
  echo "Migration failed, attempting manual fix for enum..."
  
  # If migration fails, we'll try to run our manual fix for the enum
  # This requires DATABASE_URL to be set in the environment
  if [ -z "$DATABASE_URL" ]; then
    echo "ERROR: DATABASE_URL is not set. Cannot apply fix."
    exit 1
  fi
  
  # Extract the correct psql connection string from DATABASE_URL
  # This assumes a standard postgres:// or postgresql:// URL format
  CONNECTION_STRING=$DATABASE_URL
  
  # Apply the fix using psql
  echo "Applying enum fix using provided script..."
  cat ./scripts/fix-enum.sql | psql "$CONNECTION_STRING"
  
  # Retry migrations
  echo "Retrying migrations..."
  npx prisma migrate deploy
  
  # Generate Prisma client
  echo "Generating Prisma client..."
  npx prisma generate
  
  echo "Manual fix applied and migrations completed!"
fi

# Generate Prisma client if not already done
npx prisma generate 