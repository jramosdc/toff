#!/bin/bash

# TOFF Vercel Deployment Script
echo "🚀 Preparing TOFF for Vercel deployment..."

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "⚠️  Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Check if logged in to Vercel
echo "🔑 Checking Vercel authentication..."
vercel whoami || vercel login

# Generate a secure NEXTAUTH_SECRET if not provided
if [ -z "$NEXTAUTH_SECRET" ]; then
    echo "🔒 Generating NEXTAUTH_SECRET..."
    NEXTAUTH_SECRET=$(openssl rand -base64 32)
    echo "Your NEXTAUTH_SECRET is: $NEXTAUTH_SECRET"
    echo "Make sure to save this and add it to your Vercel environment variables!"
fi

# Check if we have database URL
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  No DATABASE_URL provided."
    echo "You will need to set up a PostgreSQL database and add the connection string to Vercel."
    echo "Options: Vercel Postgres, Neon, Supabase, etc."
fi

# Run Prisma generate
echo "🔄 Generating Prisma client..."
npx prisma generate

# Deploy to Vercel
echo "🚀 Deploying to Vercel..."
vercel deploy --prod

echo "✅ Deployment initiated! Check the Vercel dashboard for status."
echo "Don't forget to set all required environment variables in the Vercel dashboard:"
echo "- DATABASE_URL (PostgreSQL connection string)"
echo "- NEXTAUTH_URL (your deployed app URL)"
echo "- NEXTAUTH_SECRET (the secret generated earlier)"
echo "- EMAIL_* variables for email functionality"
echo "- ADMIN_EMAIL for admin notifications" 