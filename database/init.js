const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'blindbox.db'), (err) => {
  if (err) {
    console.error('数据库连接失败:', err);
  } else {
    console.log('成功连接到数据库');
  }
});

// 删除所有表以确保正确的创建顺序
db.serialize(() => {
  // 首先删除所有表（注意顺序，先删除有外键依赖的表）
  db.run('DROP TABLE IF EXISTS comments');
  db.run('DROP TABLE IF EXISTS draws');
  db.run('DROP TABLE IF EXISTS user_blind_boxes');
  db.run('DROP TABLE IF EXISTS blind_boxes');
  db.run('DROP TABLE IF EXISTS users');

  // 然后按照正确的顺序创建表
  // 1. 创建用户表
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      is_merchant BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. 创建盲盒商品表
  db.run(`
    CREATE TABLE IF NOT EXISTS blind_boxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      cover_image TEXT NOT NULL,
      content_images TEXT NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      total_stock INTEGER NOT NULL,
      order_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (merchant_id) REFERENCES users (id)
    )
  `);

  // 3. 创建用户盲盒表
  db.run(`
    CREATE TABLE IF NOT EXISTS user_blind_boxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      blind_box_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (blind_box_id) REFERENCES blind_boxes (id)
    )
  `);

  // 4. 创建抽取记录表
  db.run(`
    CREATE TABLE IF NOT EXISTS draws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      blind_box_id INTEGER NOT NULL,
      drawn_image TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      shipping_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (blind_box_id) REFERENCES blind_boxes (id)
    )
  `);

  // 5. 创建评论表
  db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blind_box_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT,
      image TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (blind_box_id) REFERENCES blind_boxes (id),
      FOREIGN KEY (user_id) REFERENCES users (id)
    )
  `);

  // 添加唯一索引
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_box 
    ON user_blind_boxes(user_id, blind_box_id)
  `);
});

module.exports = db;