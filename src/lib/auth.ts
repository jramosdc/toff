import { AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import EmailProvider from 'next-auth/providers/email';
import bcrypt from 'bcryptjs';
import db, { dbOperations, prisma, isPrismaEnabled } from './db';
import { PrismaAdapter } from '@next-auth/prisma-adapter';
import { PrismaClient } from '@prisma/client';

// Define User type to match the database structure
interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  role: string;
}

export const authOptions: AuthOptions = {
  adapter: prisma ? PrismaAdapter(prisma) : undefined,
  providers: [
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT),
        auth: {
          user: process.env.EMAIL_SERVER_USER,
          pass: process.env.EMAIL_SERVER_PASSWORD,
        },
      },
      from: process.env.EMAIL_FROM,
    }),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Please enter an email and password');
        }

        console.log("Authenticating user:", credentials.email);
        console.log("DATABASE_URL:", process.env.DATABASE_URL);
        console.log("isPrismaEnabled:", isPrismaEnabled);
        console.log("Prisma client available:", !!prisma);
        console.log("VERCEL:", process.env.VERCEL);
        
        let user;
        
        // Use Prisma in production
        if (process.env.VERCEL || (isPrismaEnabled && prisma)) {
          console.log("Using Prisma for authentication");
          user = await prisma?.user.findUnique({
            where: { email: credentials.email }
          });
        } else if (db && dbOperations.getUserByEmail) {
          console.log("Using SQLite for authentication");
          user = dbOperations.getUserByEmail.get(credentials.email) as User | undefined;
        } else {
          console.error("No database connection available");
          throw new Error('Database connection error');
        }

        if (!user || !user.password) {
          console.log("No user found with email:", credentials.email);
          throw new Error('No user found with that email');
        }

        console.log("User found, checking password");
        const passwordMatch = await bcrypt.compare(credentials.password, user.password);

        if (!passwordMatch) {
          console.log("Password doesn't match");
          throw new Error('Incorrect password');
        }

        console.log("Authentication successful for:", user.email);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      }
    })
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
      }
      return session;
    }
  },
  pages: {
    signIn: '/login',
    verifyRequest: '/auth/verify-request',
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}; 