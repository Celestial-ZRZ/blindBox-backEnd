const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 创建数据库连接
const db = new sqlite3.Database(path.join(__dirname, 'blindbox.db'), (err) => {
  if (err) {
    console.error('数据库连接失败:', err);
  } else {
    console.log('成功连接到数据库');
  }
});

// 创建用户表
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    is_merchant BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('创建用户表失败:', err);
  } else {
    console.log('用户表创建成功或已存在');
  }
});

// 创建盲盒商品表
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
`, (err) => {
  if (err) {
    console.error('创建盲盒表失败:', err);
  } else {
    console.log('盲盒表创建成功或已存在');
  }
});

// 创建评论表
db.run(`
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    blind_box_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (blind_box_id) REFERENCES blind_boxes (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )
`, (err) => {
  if (err) {
    console.error('创建评论表失败:', err);
  } else {
    console.log('评论表创建成功或已存在');
  }
});

module.exports = db;