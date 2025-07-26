var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users');
var blindBoxesRouter = require('./routes/blind-boxes');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));

// 修改 CORS 配置
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', 'http://localhost:5173');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
  
  // 处理 OPTIONS 请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// 确保这些中间件在路由之前
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // 修改为 true
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// 静态文件服务
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// 创建上传目录
const fs = require('fs');
const uploadDirs = [
  'public/uploads',
  'public/uploads/covers',
  'public/uploads/contents',
  'public/uploads/comments'
];

uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/blind-boxes', blindBoxesRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
