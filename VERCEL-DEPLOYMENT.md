# Deploying TOFF to Vercel

This guide walks you through deploying your Time Off Management application to Vercel.

## Prerequisites

1. Create a [Vercel account](https://vercel.com/signup) if you don't have one
2. Install the Vercel CLI (optional): `npm install -g vercel`
3. Create a PostgreSQL database (options below)

## Database Setup

For production deployment, you need a PostgreSQL database. You have several options:

### Option 1: Vercel Postgres (Recommended)

1. In your Vercel dashboard, go to **Storage**
2. Click **Create Database**
3. Select **Postgres**
4. Follow the setup wizard
5. Vercel will automatically add the connection string to your project's environment variables

### Option 2: Neon (Free PostgreSQL)

1. Create an account at [Neon](https://neon.tech)
2. Create a new project
3. Copy your connection string from the dashboard
4. Add it as an environment variable in Vercel (explained below)

### Option 3: Supabase

1. Create an account at [Supabase](https://supabase.com)
2. Create a new project
3. Go to **Project Settings** > **Database** to find your connection string
4. Add it as an environment variable in Vercel (explained below)

## Environment Variables

You'll need to set the following environment variables in Vercel:

```
# Required
DATABASE_URL=postgresql://username:password@host:port/database
NEXTAUTH_URL=https://your-app-name.vercel.app
NEXTAUTH_SECRET=your-nextauth-secret

# Email Configuration
EMAIL_SERVER_HOST=smtp.gmail.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=your-email@gmail.com
EMAIL_SERVER_PASSWORD=your-gmail-app-password
EMAIL_FROM=your-email@gmail.com

# Admin Email
ADMIN_EMAIL=admin-email@example.com
```

## Deployment Steps

### 1. Push Your Code to GitHub

Make sure your code is in a GitHub repository.

### 2. Connect Your Repository to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **Add New** > **Project**
3. Import your GitHub repository
4. Select the repository and click **Import**

### 3. Configure Your Project

1. Set your **Framework Preset** to **Next.js**
2. Under **Environment Variables**, add all the variables listed above
3. The `Build Command` should be: `npm run build`
4. The `Output Directory` should be: `.next`

### 4. Deploy

1. Click **Deploy**
2. Wait for the build and deployment to complete

## After Deployment

### Testing

1. Go to your deployed app URL (e.g., https://your-app-name.vercel.app)
2. Test the login functionality
3. Verify that time off requests work correctly
4. Check that email notifications are being sent

### Troubleshooting

If you encounter issues:

1. Check the **Vercel Logs** in your project dashboard
2. Verify that all environment variables are set correctly
3. Make sure your database is accessible from Vercel

## Local Development with PostgreSQL

To use PostgreSQL locally (matching your production environment):

1. Add your PostgreSQL connection string to `.env.local`:
   ```
   DATABASE_URL=postgresql://username:password@localhost:5432/toff
   ```

2. Run migrations:
   ```
   npx prisma migrate dev
   ```

3. Start the development server:
   ```
   npm run dev
   ```

## Continuous Deployment

Vercel automatically deploys when you push changes to your connected GitHub repository. No additional configuration is needed.

## Custom Domains

To use a custom domain:

1. In your Vercel project dashboard, go to **Domains**
2. Click **Add**
3. Enter your domain and follow the instructions
4. Remember to update your `NEXTAUTH_URL` environment variable to match your custom domain 