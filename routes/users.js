var express = require('express');
var router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../database/init');
const saltRounds = 10;

// 注册接口
router.post('/register', async function(req, res) {
  const { username, password } = req.body;
  
  // 输入验证
  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码不能为空' });
  }
  
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ message: '用户名长度应在3-20个字符之间' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ message: '密码长度至少为6个字符' });
  }
  
  try {
    // 检查用户名是否存在
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
      if (err) {
        console.error('查询用户错误:', err);
        return res.status(500).json({ message: '服务器错误' });
      }
      
      if (user) {
        return res.status(409).json({ message: '用户名已存在' });
      }
      
      // 加密密码并创建用户
      try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        db.run(
          'INSERT INTO users (username, password) VALUES (?, ?)',
          [username, hashedPassword],
          function(err) {
            if (err) {
              console.error('创建用户错误:', err);
              return res.status(500).json({ message: '服务器错误' });
            }
            res.json({ message: '注册成功' });
          }
        );
      } catch (err) {
        console.error('密码加密错误:', err);
        res.status(500).json({ message: '服务器错误' });
      }
    });
  } catch (err) {
    console.error('注册错误:', err);
    res.status(500).json({ message: '服务器错误' });
  }
});

// 登录接口
router.post('/login', async function(req, res) {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码不能为空' });
  }
  
  try {
    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
      if (err) {
        console.error('查询用户错误:', err);
        return res.status(500).json({ message: '服务器错误' });
      }
      
      if (!user) {
        return res.status(401).json({ message: '用户名或密码错误' });
      }
      
      try {
        const match = await bcrypt.compare(password, user.password);
        if (match) {
          res.json({ 
            message: '登录成功',
            user: { 
              username: user.username,
              id: user.id,
              createdAt: user.created_at 
            }
          });
        } else {
          res.status(401).json({ message: '用户名或密码错误' });
        }
      } catch (err) {
        console.error('密码比对错误:', err);
        res.status(500).json({ message: '服务器错误' });
      }
    });
  } catch (err) {
    console.error('登录错误:', err);
    res.status(500).json({ message: '服务器错误' });
  }
});

module.exports = router;