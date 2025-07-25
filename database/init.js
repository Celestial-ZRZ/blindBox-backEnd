const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('创建用户表失败:', err);
  } else {
    console.log('用户表创建成功或已存在');
  }
});

module.exports = db;