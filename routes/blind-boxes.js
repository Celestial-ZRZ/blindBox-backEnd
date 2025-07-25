const express = require('express');
const router = express.Router();
const db = require('../database/init');
const multer = require('multer');
const path = require('path');

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 根据字段名选择不同的目录
    const dest = file.fieldname === 'coverImage' 
      ? 'public/uploads/covers/'
      : 'public/uploads/contents/';
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    // 生成唯一文件名
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
  
  db.all('SELECT * FROM blind_boxes WHERE merchant_id = ? ORDER BY created_at DESC', 
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

// 获取盲盒评论
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

// 添加评论
router.post('/:id/comments', function(req, res) {
  const boxId = req.params.id;
  const { userId, content } = req.body;
  
  if (!content) {
    return res.status(400).json({ message: '评论内容不能为空' });
  }
  
  db.run(
    'INSERT INTO comments (blind_box_id, user_id, content) VALUES (?, ?, ?)',
    [boxId, userId, content],
    function(err) {
      if (err) {
        console.error('添加评论失败:', err);
        return res.status(500).json({ message: '服务器错误' });
      }
      res.json({ 
        message: '评论成功',
        id: this.lastID 
      });
    }
  );
});

module.exports = router;