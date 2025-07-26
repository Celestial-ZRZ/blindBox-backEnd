const express = require('express');
const router = express.Router();
const db = require('../database/init');
const multer = require('multer');
const path = require('path');

// 在文件顶部添加存储配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let dest = 'public/uploads/comments/';
    if (file.fieldname === 'coverImage') {
      dest = 'public/uploads/covers/';
    } else if (file.fieldname === 'contentImages') {
      dest = 'public/uploads/contents/';
    }
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 限制5MB
  },
  fileFilter: (req, file, cb) => {
    // 只允许图片
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件'));
    }
  }
});

// 获取商家的盲盒列表
router.get('/merchant/:id', function(req, res) {
  const merchantId = req.params.id;
  
  db.all('SELECT * FROM blind_boxes WHERE merchant_id = ? ORDER BY id ASC', 
    [merchantId], 
    (err, rows) => {
      if (err) {
        console.error('查询盲盒失败:', err);
        return res.status(500).json({ message: '服务器错误' });
      }
      res.json(rows);
    }
  );
});

// 获取所有盲盒列表(用于商城展示)
router.get('/', function(req, res) {
  db.all('SELECT * FROM blind_boxes ORDER BY created_at DESC', 
    (err, rows) => {
      if (err) {
        console.error('查询盲盒失败:', err);
        return res.status(500).json({ message: '服务器错误' });
      }
      res.json(rows);
    }
  );
});

// 创建新盲盒 - 修改为支持文件上传
router.post('/', 
  upload.fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'contentImages', maxCount: 10 }
  ]),
  async function(req, res) {
    try {
      const { merchantId, name, price, stock } = req.body;
      
      if (!name || !price || !stock || !req.files.coverImage) {
        return res.status(400).json({ message: '缺少必要字段' });
      }

      const coverImagePath = '/uploads/covers/' + req.files.coverImage[0].filename;
      const contentImagePaths = req.files.contentImages 
        ? req.files.contentImages.map(file => '/uploads/contents/' + file.filename)
        : [];

      db.run(
        'INSERT INTO blind_boxes (merchant_id, name, cover_image, content_images, price, total_stock) VALUES (?, ?, ?, ?, ?, ?)',
        [
          merchantId,
          name,
          coverImagePath,
          JSON.stringify(contentImagePaths),
          price,
          stock
        ],
        function(err) {
          if (err) {
            console.error('创建盲盒失败:', err);
            return res.status(500).json({ message: '服务器错误' });
          }
          res.json({ 
            message: '创建成功',
            id: this.lastID 
          });
        }
      );
    } catch (err) {
      console.error('上传处理错误:', err);
      res.status(500).json({ message: err.message || '服务器错误' });
    }
});

// 获取单个盲盒详情
router.get('/:id', function(req, res) {
  const boxId = req.params.id;
  
  db.get('SELECT * FROM blind_boxes WHERE id = ?', [boxId], (err, box) => {
    if (err) {
      console.error('查询盲盒失败:', err);
      return res.status(500).json({ message: '服务器错误' });
    }
    if (!box) {
      return res.status(404).json({ message: '盲盒不存在' });
    }
    res.json(box);
  });
});

// 修改购买盲盒的路由
router.post('/:id/buy', function(req, res) {
  const boxId = req.params.id;
  const { userId, quantity } = req.body;

  if (!userId || !quantity || quantity < 1) {
    return res.status(400).json({ message: '无效的请求参数' });
  }

  // 开始事务
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // 检查库存
    db.get(
      'SELECT total_stock, order_count, price FROM blind_boxes WHERE id = ?',
      [boxId],
      (err, box) => {
        if (err) {
          console.error('查询库存失败:', err);
          db.run('ROLLBACK');
          return res.status(500).json({ message: '服务器错误' });
        }

        if (!box) {
          db.run('ROLLBACK');
          return res.status(404).json({ message: '盲盒不存在' });
        }

        const remainingStock = parseInt(box.total_stock) - (parseInt(box.order_count) || 0);
        if (remainingStock < quantity) {
          db.run('ROLLBACK');
          return res.status(400).json({ message: '库存不足' });
        }

        // 检查用户是否已有该盲盒的记录
        db.get(
          'SELECT quantity FROM user_blind_boxes WHERE user_id = ? AND blind_box_id = ?',
          [userId, boxId],
          (err, userBox) => {
            if (err) {
              console.error('查询用户盲盒失败:', err);
              db.run('ROLLBACK');
              return res.status(500).json({ message: '服务器错误' });
            }

            const updateQuery = userBox
              ? 'UPDATE user_blind_boxes SET quantity = quantity + ? WHERE user_id = ? AND blind_box_id = ?'
              : 'INSERT INTO user_blind_boxes (quantity, user_id, blind_box_id) VALUES (?, ?, ?)';

            // 更新用户的盲盒数量
            db.run(updateQuery, [quantity, userId, boxId], function(err) {
              if (err) {
                console.error('更新用户盲盒失败:', err);
                db.run('ROLLBACK');
                return res.status(500).json({ message: '服务器错误' });
              }

              // 更新总库存
              db.run(
                'UPDATE blind_boxes SET order_count = order_count + ? WHERE id = ?',
                [quantity, boxId],
                function(err) {
                  if (err) {
                    console.error('更新库存失败:', err);
                    db.run('ROLLBACK');
                    return res.status(500).json({ message: '服务器错误' });
                  }

                  db.run('COMMIT');
                  res.json({ 
                    message: '购买成功',
                    quantity: quantity,
                    totalPrice: box.price * quantity
                  });
                }
              );
            });
          }
        );
      }
    );
  });
});

// 修改评论查询路由
router.get('/:id/comments', function(req, res) {
  const boxId = req.params.id;
  
  db.all(`
    SELECT c.*, u.username 
    FROM comments c 
    JOIN users u ON c.user_id = u.id 
    WHERE c.blind_box_id = ? 
    ORDER BY c.created_at DESC
  `, [boxId], (err, comments) => {
    if (err) {
      console.error('查询评论失败:', err);
      return res.status(500).json({ message: '服务器错误' });
    }
    res.json(comments);
  });
});

// 修改添加评论的路由
router.post('/:id/comments', upload.single('image'), function(req, res) {
  const boxId = req.params.id;
  const { userId, content } = req.body;
  
  if (!content && !req.file) {
    return res.status(400).json({ message: '评论内容和图片至少需要一个' });
  }
  
  let imagePath = null;
  if (req.file) {
    imagePath = '/uploads/comments/' + req.file.filename;
  }
  
  db.run(
    'INSERT INTO comments (blind_box_id, user_id, content, image) VALUES (?, ?, ?, ?)',
    [boxId, userId, content, imagePath],
    function(err) {
      if (err) {
        console.error('添加评论失败:', err);
        return res.status(500).json({ message: '服务器错误' });
      }
      
      // 返回新添加的评论信息
      db.get(
        `SELECT c.*, u.username 
         FROM comments c 
         JOIN users u ON c.user_id = u.id 
         WHERE c.id = ?`,
        [this.lastID],
        (err, comment) => {
          if (err) {
            console.error('获取新评论失败:', err);
            return res.status(500).json({ message: '服务器错误' });
          }
          res.json(comment);
        }
      );
    }
  );
});

// 添加抽取盲盒路由
router.post('/:id/draw', function(req, res) {
  const boxId = req.params.id;
  const { userId, quantity } = req.body;

  if (!userId || !quantity || quantity < 1) {
    return res.status(400).json({ message: '无效的请求参数' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // 检查用户盲盒数量
    db.get(
      'SELECT quantity FROM user_blind_boxes WHERE user_id = ? AND blind_box_id = ?',
      [userId, boxId],
      (err, userBox) => {
        if (err) {
          console.error('查询用户盲盒失败:', err);
          db.run('ROLLBACK');
          return res.status(500).json({ message: '服务器错误' });
        }

        if (!userBox || userBox.quantity < quantity) {
          db.run('ROLLBACK');
          return res.status(400).json({ message: '盲盒数量不足' });
        }

        // 获取盲盒内容
        db.get('SELECT content_images FROM blind_boxes WHERE id = ?', [boxId], (err, box) => {
          if (err) {
            console.error('查询盲盒内容失败:', err);
            db.run('ROLLBACK');
            return res.status(500).json({ message: '服务器错误' });
          }

          const contentImages = JSON.parse(box.content_images);
          const drawnImage = contentImages[Math.floor(Math.random() * contentImages.length)];

          // 检查是否已有相同图片的抽取记录
          db.get(
            'SELECT id, quantity FROM draws WHERE user_id = ? AND blind_box_id = ? AND drawn_image = ?',
            [userId, boxId, drawnImage],
            (err, existingDraw) => {
              if (err) {
                console.error('查询抽取记录失败:', err);
                db.run('ROLLBACK');
                return res.status(500).json({ message: '服务器错误' });
              }

              const updateOrInsertDraw = existingDraw
                ? 'UPDATE draws SET quantity = quantity + ? WHERE id = ?'
                : 'INSERT INTO draws (user_id, blind_box_id, drawn_image, quantity) VALUES (?, ?, ?, ?)';
              const drawParams = existingDraw
                ? [quantity, existingDraw.id]
                : [userId, boxId, drawnImage, quantity];

              db.run(updateOrInsertDraw, drawParams, function(err) {
                if (err) {
                  console.error('更新抽取记录失败:', err);
                  db.run('ROLLBACK');
                  return res.status(500).json({ message: '服务器错误' });
                }

                // 更新用户盲盒数量
                db.run(
                  'UPDATE user_blind_boxes SET quantity = quantity - ? WHERE user_id = ? AND blind_box_id = ?',
                  [quantity, userId, boxId],
                  function(err) {
                    if (err) {
                      console.error('更新用户盲盒失败:', err);
                      db.run('ROLLBACK');
                      return res.status(500).json({ message: '服务器错误' });
                    }

                    db.run('COMMIT');
                    res.json({ 
                      message: '抽取成功',
                      drawnImage 
                    });
                  }
                );
              });
            }
          );
        });
      }
    );
  });
});

// 添加商家查看订单路由
router.get('/:id/orders', function(req, res) {
  const boxId = req.params.id;
  
  db.all(`
    SELECT u.username, d.drawn_image, d.quantity, d.shipping_address, d.is_shipped, d.id as draw_id
    FROM draws d
    JOIN users u ON d.user_id = u.id
    WHERE d.blind_box_id = ? AND d.shipping_address IS NOT NULL
    ORDER BY d.created_at DESC
  `, [boxId], (err, orders) => {
    if (err) {
      console.error('查询订单失败:', err);
      return res.status(500).json({ message: '服务器错误' });
    }
    res.json(orders);
  });
});

// 添加更新发货状态路由
router.post('/draws/:id/ship', function(req, res) {
  const drawId = req.params.id;
  
  db.run('UPDATE draws SET is_shipped = 1 WHERE id = ?', [drawId], function(err) {
    if (err) {
      console.error('更新发货状态失败:', err);
      return res.status(500).json({ message: '服务器错误' });
    }
    res.json({ message: '更新成功' });
  });
});

// 修改抽取盲盒路由，支持批量抽取
router.post('/:id/draw-batch', function(req, res) {
  const boxId = req.params.id;
  const { userId, quantity } = req.body;

  if (!userId || !quantity || quantity < 1) {
    return res.status(400).json({ message: '无效的请求参数' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    db.get(
      'SELECT quantity FROM user_blind_boxes WHERE user_id = ? AND blind_box_id = ?',
      [userId, boxId],
      (err, userBox) => {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ message: '服务器错误' });
        }

        if (!userBox || userBox.quantity < quantity) {
          db.run('ROLLBACK');
          return res.status(400).json({ message: '盲盒数量不足' });
        }

        db.get('SELECT content_images FROM blind_boxes WHERE id = ?', [boxId], (err, box) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ message: '服务器错误' });
          }

          const contentImages = JSON.parse(box.content_images);
          const results = [];
          
          // 每个盲盒单独随机
          for (let i = 0; i < quantity; i++) {
            const drawnImage = contentImages[Math.floor(Math.random() * contentImages.length)];
            results.push(drawnImage);
          }

          let completed = 0;
          results.forEach(drawnImage => {
            db.get(
              'SELECT id, quantity FROM draws WHERE user_id = ? AND blind_box_id = ? AND drawn_image = ?',
              [userId, boxId, drawnImage],
              (err, existingDraw) => {
                if (err) {
                  db.run('ROLLBACK');
                  return res.status(500).json({ message: '服务器错误' });
                }

                const updateOrInsertDraw = existingDraw
                  ? 'UPDATE draws SET quantity = quantity + 1 WHERE id = ?'
                  : 'INSERT INTO draws (user_id, blind_box_id, drawn_image, quantity) VALUES (?, ?, ?, 1)';
                const drawParams = existingDraw
                  ? [existingDraw.id]
                  : [userId, boxId, drawnImage];

                db.run(updateOrInsertDraw, drawParams, function(err) {
                  if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ message: '服务器错误' });
                  }

                  completed++;
                  if (completed === quantity) {
                    // 更新用户盲盒数量
                    db.run(
                      'UPDATE user_blind_boxes SET quantity = quantity - ? WHERE user_id = ? AND blind_box_id = ?',
                      [quantity, userId, boxId],
                      function(err) {
                        if (err) {
                          db.run('ROLLBACK');
                          return res.status(500).json({ message: '服务器错误' });
                        }

                        // 检查是否需要删除用户盲盒记录
                        db.get(
                          'SELECT quantity FROM user_blind_boxes WHERE user_id = ? AND blind_box_id = ?',
                          [userId, boxId],
                          (err, updatedBox) => {
                            if (err) {
                              db.run('ROLLBACK');
                              return res.status(500).json({ message: '服务器错误' });
                            }

                            if (updatedBox.quantity === 0) {
                              db.run(
                                'DELETE FROM user_blind_boxes WHERE user_id = ? AND blind_box_id = ?',
                                [userId, boxId],
                                function(err) {
                                  if (err) {
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ message: '服务器错误' });
                                  }
                                  db.run('COMMIT');
                                  res.json({ 
                                    message: '抽取成功',
                                    results
                                  });
                                }
                              );
                            } else {
                              db.run('COMMIT');
                              res.json({ 
                                message: '抽取成功',
                                results 
                              });
                            }
                          }
                        );
                      }
                    );
                  }
                });
              }
            );
          });
        });
      }
    );
  });
});

// 添加商品上下架路由
router.post('/:id/status', function(req, res) {
  const boxId = req.params.id;
  const { status, quantity } = req.body;
  
  if (status === 'off_sale' && !quantity) {
    return res.status(400).json({ message: '请指定下架数量' });
  }

  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    if (status === 'off_sale') {
      // 检查库存
      db.get(
        'SELECT total_stock, order_count FROM blind_boxes WHERE id = ?',
        [boxId],
        (err, box) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ message: '服务器错误' });
          }

          const remainingStock = box.total_stock - box.order_count;
          if (quantity > remainingStock) {
            db.run('ROLLBACK');
            return res.status(400).json({ message: '下架数量超过可用库存' });
          }

          db.run(
            'UPDATE blind_boxes SET total_stock = total_stock - ? WHERE id = ?',
            [quantity, boxId],
            function(err) {
              if (err) {
                db.run('ROLLBACK');
                return res.status(500).json({ message: '服务器错误' });
              }

              // 检查是否需要删除商品
              db.get(
                'SELECT total_stock FROM blind_boxes WHERE id = ?',
                [boxId],
                (err, updatedBox) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return res.status(500).json({ message: '服务器错误' });
                  }

                  if (updatedBox.total_stock === 0) {
                    db.run('DELETE FROM blind_boxes WHERE id = ?', [boxId], function(err) {
                      if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ message: '服务器错误' });
                      }
                      db.run('COMMIT');
                      res.json({ message: '商品已删除' });
                    });
                  } else {
                    db.run('COMMIT');
                    res.json({ message: '下架成功' });
                  }
                }
              );
            }
          );
        }
      );
    } else {
      // 上架操作
      db.run(
        'UPDATE blind_boxes SET total_stock = total_stock + ? WHERE id = ?',
        [quantity, boxId],
        function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ message: '服务器错误' });
          }
          db.run('COMMIT');
          res.json({ message: '上架成功' });
        }
      );
    }
  });
});

module.exports = router;