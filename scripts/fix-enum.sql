-- Script to fix TimeOffType enum in PostgreSQL
-- Run this manually on your Neon database if the migration fails

-- Check if the enum value already exists to prevent errors
DO $$
BEGIN
    -- Check if PERSONAL already exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'PERSONAL' 
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'timeofftype'
        )
    ) THEN
        -- Add the PERSONAL value to the enum
        ALTER TYPE "TimeOffType" ADD VALUE 'PERSONAL';
    END IF;
END
$$; 