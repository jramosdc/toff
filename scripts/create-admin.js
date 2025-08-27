const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

// Connect to the database
const db = new Database(path.join(process.cwd(), 'toff.db'), { verbose: console.log });

async function createAdmin() {
  const adminId = crypto.randomUUID();
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminName = process.env.ADMIN_NAME || 'Admin User';

  try {
    // Create user
    const createUser = db.prepare(`
      INSERT INTO users (id, email, name, password, role)
      VALUES (?, ?, ?, ?, ?)
    `);

    createUser.run(
      adminId,
      adminEmail,
      adminName,
      hashedPassword,
      'ADMIN'
    );

    console.log('Admin user created successfully');
    console.log('Email:', adminEmail);
    console.log('Password: admin123');
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    db.close();
  }
}

createAdmin(); 