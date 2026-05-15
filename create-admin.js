// Run once: node create-admin.js [username] [password] [full_name]
// Creates or promotes an admin account.
const bcrypt = require('bcryptjs');
const { init } = require('./db');

const username  = process.argv[2] || 'admin';
const password  = process.argv[3] || 'admin123';
const full_name = process.argv[4] || 'Administrator';

init().then(db => {
  const hash = bcrypt.hashSync(password, 10);
  const existing = db.get('SELECT id FROM users WHERE username = ? COLLATE NOCASE', [username]);
  if (existing) {
    db.run("UPDATE users SET role='admin', password_hash=? WHERE username=? COLLATE NOCASE", [hash, username]);
    console.log(`User "${username}" updated to admin.`);
  } else {
    db.run(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      [username, hash, full_name, 'admin']
    );
    console.log(`Admin created — username: "${username}"  password: "${password}"`);
  }
  process.exit(0);
});
