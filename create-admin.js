// Run once: node create-admin.js [username] [password] [full_name]
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { init } = require('./db');

const username  = process.argv[2] || 'admin';
const password  = process.argv[3] || 'admin123';
const full_name = process.argv[4] || 'Administrator';

init().then(async db => {
  const hash     = bcrypt.hashSync(password, 10);
  const existing = await db.one('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [username]);
  if (existing) {
    await db.run("UPDATE users SET role='admin', password_hash=$1 WHERE LOWER(username)=LOWER($2)", [hash, username]);
    console.log(`User "${username}" updated to admin.`);
  } else {
    await db.run(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES ($1,$2,$3,$4)',
      [username, hash, full_name, 'admin']
    );
    console.log(`Admin created — username: "${username}"  password: "${password}"`);
  }
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
