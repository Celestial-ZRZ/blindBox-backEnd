var express = require('express');
var router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../database/init');
const saltRounds = 10;

// 注册接口
router.post('/register', async function(req, res) {
  const { username, password, isMerchant } = req.body;
  
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
          'INSERT INTO users (username, password, is_merchant) VALUES (?, ?, ?)',
          [username, hashedPassword, isMerchant ? 1 : 0],
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
              isMerchant: user.is_merchant === 1,
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

// 获取用户的盲盒
router.get('/:id/blind-boxes', function(req, res) {
  const userId = req.params.id;
  
  db.all(`
    SELECT ub.*, b.name, b.cover_image, b.content_images, b.price 
    FROM user_blind_boxes ub
    JOIN blind_boxes b ON ub.blind_box_id = b.id
    WHERE ub.user_id = ?
  `, [userId], (err, boxes) => {
    if (err) {
      console.error('查询用户盲盒失败:', err);
      return res.status(500).json({ message: '服务器错误' });
    }
    res.json(boxes);
  });
});

// 获取用户的抽取记录(合并同种图片)
router.get('/:id/draws', function(req, res) {
  const userId = req.params.id;
  
  db.all(`
    SELECT 
      d.blind_box_id,
      d.drawn_image,
      SUM(d.quantity) as quantity,
      MAX(d.created_at) as created_at,
      b.name as blind_box_name,
      MIN(d.id) as id
    FROM draws d
    JOIN blind_boxes b ON d.blind_box_id = b.id
    WHERE d.user_id = ? AND d.shipping_address IS NULL
    GROUP BY d.blind_box_id, d.drawn_image
    ORDER BY created_at DESC
  `, [userId], (err, draws) => {
    if (err) {
      console.error('查询抽取记录失败:', err);
      return res.status(500).json({ message: '服务器错误' });
    }
    res.json(draws);
  });
});

// 修改收货地址更新路由
router.post('/:userId/draws/:drawId/ship', function(req, res) {
  const { userId, drawId } = req.params;
  const { address } = req.body;

  if (!address) {
    return res.status(400).json({ message: '请填写收货地址' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // 获取当前记录
    db.get(
      `SELECT blind_box_id, drawn_image, quantity as current_quantity 
       FROM draws 
       WHERE id = ? AND user_id = ? AND shipping_address IS NULL`,
      [drawId, userId],
      (err, draw) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ message: '服务器错误' });
        }

        if (!draw) {
          db.run('ROLLBACK');
          return res.status(404).json({ message: '记录不存在或已发货' });
        }

        // 创建新的发货记录（固定数量为1）
        db.run(
          'INSERT INTO draws (user_id, blind_box_id, drawn_image, quantity, shipping_address) VALUES (?, ?, ?, 1, ?)',
          [userId, draw.blind_box_id, draw.drawn_image, address],
          function(err) {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ message: '服务器错误' });
            }

            // 更新原记录数量
            const newQuantity = draw.current_quantity - 1;
            if (newQuantity > 0) {
              db.run(
                'UPDATE draws SET quantity = ? WHERE id = ?',
                [newQuantity, drawId],
                function(err) {
                  if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ message: '服务器错误' });
                  }
                  db.run('COMMIT');
                  res.json({ message: '发货信息已更新' });
                }
              );
            } else {
              // 删除原记录
              db.run(
                'DELETE FROM draws WHERE id = ?',
                [drawId],
                function(err) {
                  if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ message: '服务器错误' });
                  }
                  db.run('COMMIT');
                  res.json({ message: '发货信息已更新' });
                }
              );
            }
          }
        );
      }
    );
  });
});

module.exports = router;