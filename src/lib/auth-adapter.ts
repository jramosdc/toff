import { Adapter } from "next-auth/adapters";
import { randomUUID } from "crypto";
import db from "./db";

export function SQLiteAdapter(): Adapter {
  return {
    async createUser(user) {
      const id = randomUUID();
      
      // Create a user without a password since we're using email authentication
      db.prepare(`
        INSERT INTO users (id, name, email, password, role) 
        VALUES (?, ?, ?, ?, ?)
      `).run(id, user.name || '', user.email, '', 'EMPLOYEE');
      
      return {
        id,
        email: user.email,
        name: user.name || null,
        emailVerified: null,
        role: 'EMPLOYEE'
      };
    },
    
    async getUser(id) {
      const user = db.prepare(`
        SELECT id, email, name, role FROM users WHERE id = ?
      `).get(id);
      
      if (!user) return null;
      
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: null,
        role: user.role
      };
    },
    
    async getUserByEmail(email) {
      const user = db.prepare(`
        SELECT id, email, name, role FROM users WHERE email = ?
      `).get(email);
      
      if (!user) return null;
      
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: null,
        role: user.role
      };
    },
    
    async getUserByAccount({ providerAccountId, provider }) {
      const account = db.prepare(`
        SELECT * FROM accounts WHERE provider_account_id = ? AND provider = ?
      `).get(providerAccountId, provider);
      
      if (!account) return null;
      
      const user = db.prepare(`
        SELECT id, email, name, role FROM users WHERE id = ?
      `).get(account.user_id);
      
      if (!user) return null;
      
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: null,
        role: user.role
      };
    },
    
    async updateUser(user) {
      db.prepare(`
        UPDATE users 
        SET name = ?, email = ? 
        WHERE id = ?
      `).run(user.name || null, user.email, user.id);
      
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: null,
        role: user.role || 'EMPLOYEE'
      };
    },
    
    async linkAccount(account) {
      const id = randomUUID();
      
      db.prepare(`
        INSERT INTO accounts (
          id, user_id, provider, provider_account_id, 
          refresh_token, access_token, expires_at, token_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        account.userId,
        account.provider,
        account.providerAccountId,
        account.refresh_token || null,
        account.access_token || null,
        account.expires_at || null,
        account.token_type || null
      );
    },
    
    async createSession({ sessionToken, userId, expires }) {
      db.prepare(`
        INSERT INTO sessions (
          session_token, user_id, expires
        ) VALUES (?, ?, ?)
      `).run(sessionToken, userId, expires.toISOString());
      
      return {
        sessionToken,
        userId,
        expires
      };
    },
    
    async getSessionAndUser(sessionToken) {
      const session = db.prepare(`
        SELECT * FROM sessions WHERE session_token = ?
      `).get(sessionToken);
      
      if (!session) return null;
      
      const user = db.prepare(`
        SELECT id, email, name, role FROM users WHERE id = ?
      `).get(session.user_id);
      
      if (!user) return null;
      
      return {
        session: {
          sessionToken: session.session_token,
          userId: session.user_id,
          expires: new Date(session.expires)
        },
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: null,
          role: user.role
        }
      };
    },
    
    async updateSession({ sessionToken, expires, userId }) {
      const data = {
        ...(expires && { expires: expires.toISOString() }),
        ...(userId && { user_id: userId })
      };
      
      if (Object.keys(data).length === 0) return null;
      
      const params = [...Object.values(data), sessionToken];
      
      const setSql = Object.keys(data)
        .map(key => `${key.replace(/([A-Z])/g, '_$1').toLowerCase()} = ?`)
        .join(', ');
      
      db.prepare(`
        UPDATE sessions SET ${setSql} WHERE session_token = ?
      `).run(...params);
      
      const session = db.prepare(`
        SELECT * FROM sessions WHERE session_token = ?
      `).get(sessionToken);
      
      return session
        ? {
            sessionToken: session.session_token,
            userId: session.user_id,
            expires: new Date(session.expires)
          }
        : null;
    },
    
    async deleteSession(sessionToken) {
      db.prepare(`
        DELETE FROM sessions WHERE session_token = ?
      `).run(sessionToken);
    },
    
    async createVerificationToken({ identifier, expires, token }) {
      db.prepare(`
        INSERT INTO verification_tokens (
          identifier, token, expires
        ) VALUES (?, ?, ?)
      `).run(identifier, token, expires.toISOString());
      
      return {
        identifier,
        token,
        expires
      };
    },
    
    async useVerificationToken({ identifier, token }) {
      const verificationToken = db.prepare(`
        SELECT * FROM verification_tokens 
        WHERE identifier = ? AND token = ?
      `).get(identifier, token);
      
      if (!verificationToken) return null;
      
      db.prepare(`
        DELETE FROM verification_tokens 
        WHERE identifier = ? AND token = ?
      `).run(identifier, token);
      
      return {
        identifier: verificationToken.identifier,
        token: verificationToken.token,
        expires: new Date(verificationToken.expires)
      };
    },
    
    // The following methods are optional
    
    async deleteUser(userId) {
      // Delete associated sessions, accounts, and the user
      db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
      db.prepare(`DELETE FROM accounts WHERE user_id = ?`).run(userId);
      db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
    },
    
    async unlinkAccount({ providerAccountId, provider }) {
      db.prepare(`
        DELETE FROM accounts 
        WHERE provider_account_id = ? AND provider = ?
      `).run(providerAccountId, provider);
    }
  };
} 