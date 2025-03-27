# Fixing Vercel Deployment for PostgreSQL Enum Issue

The deployment issue with adding the `PERSONAL` value to the `TimeOffType` enum in PostgreSQL can be fixed using one of these methods:

## Method 1: Direct Database Fix (Quickest Solution)

1. **Access your Neon Database**:
   - Log in to your Neon dashboard
   - Navigate to your project
   - Open the SQL Editor

2. **Run this SQL command**:
   ```sql
   -- Add PERSONAL to TimeOffType enum if it doesn't exist
   DO $$
   BEGIN
       IF NOT EXISTS (
           SELECT 1 FROM pg_enum 
           WHERE enumlabel = 'PERSONAL' 
           AND enumtypid = (
               SELECT oid FROM pg_type WHERE typname = 'timeofftype'
           )
       ) THEN
           ALTER TYPE "TimeOffType" ADD VALUE 'PERSONAL';
       END IF;
   END
   $$;
   ```

3. **Redeploy Your Application**:
   - After manually adding the enum value, deploy again through Vercel

## Method 2: Add a Build Step in Vercel

1. **Create a package.json script**:
   - Add this to your `toff/package.json` in the "scripts" section:
   ```json
   "scripts": {
     "postinstall": "node scripts/fix-postgres-enum.js",
     // ...other scripts
   }
   ```

2. **Deploy Again**:
   - The `postinstall` script will run during the Vercel build process
   - This will fix the enum before prisma migrate deploy runs

## Method 3: Skip the Migration Temporarily

1. **Create a new empty migration**:
   ```bash
   cd toff
   npx prisma migrate dev --name skip_enum_change --create-only
   ```

2. **Edit the newest migration file** to be empty (or just contain comments)

3. **Generate Prisma Client**:
   ```bash
   npx prisma generate
   ```

4. **Commit and push these changes**

5. **After successful deployment**, use Method 1 to manually add the enum value

## Troubleshooting

If you're still having issues:

1. **Check Vercel Logs**:
   - Navigate to your project in Vercel
   - Click on the latest deployment
   - Examine the build logs for specific errors

2. **Temporarily Disable Auto-Deployments**:
   - In Vercel settings, turn off auto-deployments
   - Make your fixes locally, then manually deploy when ready

3. **Verify Database Connection**:
   - Double-check your `DATABASE_URL` in Vercel environment variables
   - Ensure the connection string is correctly formatted
   - Verify network access settings in Neon (IP allowlist)

4. **Consider Recreating the Database**:
   - As a last resort, you can recreate the database and apply all migrations from scratch 