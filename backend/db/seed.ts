import 'dotenv/config'
import pool from './index'

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // Clear existing data
    await pool.query("DELETE FROM blocks");
    await pool.query("DELETE FROM canvases");
    await pool.query("DELETE FROM users");

    // Users
    const user1 = await pool.query(
      `INSERT INTO users (username, email, password_hash, created_at)
       VALUES ($1, $2, $3, NOW()) RETURNING *`,
      ["alice", "alice@example.com", "$2b$10$hashedpassword1"],
    );
    const user2 = await pool.query(
      `INSERT INTO users (username, email, password_hash, created_at)
       VALUES ($1, $2, $3, NOW()) RETURNING *`,
      ["bob", "bob@example.com", "$2b$10$hashedpassword2"],
    );
    const user3 = await pool.query(
      `INSERT INTO users (username, email, password_hash, created_at)
       VALUES ($1, $2, $3, NOW()) RETURNING *`,
      ["charlie", "charlie@example.com", "$2b$10$hashedpassword3"],
    );

    const aliceId = user1.rows[0].id;
    const bobId = user2.rows[0].id;
    const charlieId = user3.rows[0].id;

    // Canvases
    const canvas1 = await pool.query(
      `INSERT INTO canvases (user_id, name, share_id, is_public, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *`,
      [aliceId, "Alice Homepage Design", "share_abc123", true],
    );
    const canvas2 = await pool.query(
      `INSERT INTO canvases (user_id, name, share_id, is_public, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *`,
      [aliceId, "Secret Project", "share_def456", false],
    );
    const canvas3 = await pool.query(
      `INSERT INTO canvases (user_id, name, share_id, is_public, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *`,
      [bobId, "Bob Wireframes", "share_ghi789", true],
    );
    const canvas4 = await pool.query(
      `INSERT INTO canvases (user_id, name, share_id, is_public, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *`,
      [charlieId, "Charlie Brainstorm", "share_jkl012", false],
    );

    const c1 = canvas1.rows[0].id;
    const c2 = canvas2.rows[0].id;
    const c3 = canvas3.rows[0].id;
    const c4 = canvas4.rows[0].id;

    // Blocks
    await pool.query(
      `INSERT INTO blocks (canvas_id, type, content, x, y, width, created_at, updated_at)
   VALUES 
    ($1, 'text', 'Welcome to my homepage!',        100, 150, 300, NOW(), NOW()),
    ($1, 'text', 'Hero section goes here',          400, 150, 400, NOW(), NOW()),
    ($2, 'text', 'Top secret stuff here',           50,  50,  250, NOW(), NOW()),
    ($3, 'text', 'Wireframe notes',                 200, 100, 350, NOW(), NOW()),
    ($3, 'text', 'Navigation bar placeholder',      600, 100, 300, NOW(), NOW()),
    ($4, 'text', 'Brainstorm ideas...',             75,  200, 400, NOW(), NOW())`,
      [c1, c2, c3, c4],
    );

    console.log("✅ Seeding complete!");
  } catch (err) {
    console.error("❌ Seed failed:", err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

seed();
