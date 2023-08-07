var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var msRouter = require('./routes/msread.js');
var synapRouter = require('./routes/synap.js');
var clovaRouter = require('./routes/clova.js');
var qandaRouter = require('./routes/qanda.js');
var hancomRouter = require('./routes/hancom.js');
var indexRouter = require('./routes/index.js');
var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json({limit: '10mb'}));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/ms', msRouter);
app.use('/synap', synapRouter);
app.use('/clova', clovaRouter);
app.use('/qanda', qandaRouter);
app.use('/hancom', hancomRouter);

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
