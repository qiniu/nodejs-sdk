var qiniu = require('./index.js')
var express = require('express')
var app = express();

//使用Demo/public下静态资源
app.use(express.static(__dirname + '/Demo/public'));
//返回html必备，views一定要指定到html目录下
app.engine('html', require('ejs').renderFile);
app.set('views', __dirname + '/Demo/public/view');


//获取token
app.get('/get/uptoken', function(req, res) {
  var token = getToken();
  res.send(token);
  res.end();
});

//打开上传页面
app.get('/upload', function(req, res) {
  console.log('request at');
  res.render('upload.html', {

  });
  res.end();
});

//html
app.get('/testcb', function(req, res) {
  console.log('html return');
  res.render('qncallback.html');
  res.end();
});
var retBody = '';
//qiniu callback
app.post('/qncback', function(req, res) {
  console.log('post at');
  retBody = getBody(req, (body) => {
    retBody = body;
    console.log(retBody);
    res.end();
  });
});

//html.post,a listenning
app.post('/get/qncback', function(req, res) {
  console.log('post request  -' + retBody);
  res.send(retBody);
  res.end();
  retBody = '';
});

//getBody
function getBody(req, callback) {
  var body = [];
  req.on('data', function(chunk) {
    body.push(chunk);
  }).on('end', function() {
    body = Buffer.concat(body).toString();
    callback(body);
  });
}

app.listen('11010', function() {
  console.log('Listening on port %d\n', '11010');
  console.log(
    '▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽  Demos  ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽');
  console.log(
    ' ▹▹▹▹▹▹▹▹▹▹▹▹▹▹▹▹  Upload: http://node.ijemy.com/upload   ◁ ◁ ◁ ◁ ◁ ◁ ◁');
  console.log(
    '△ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △\n'
  );
});

function getToken() {
  var mac = new qiniu.auth.digest.Mac(qiniu.conf.ACCESS_KEY, qiniu.conf.SECRET_KEY);
  var options = {
    scope: 'blog-image:test-node',
    deadline: 120,
    insertOnly: 1,
    isPrefixalScope: 1,
    callbackUrl: 'http://node.ijemy.com/qncback',
    callbackBody: 'key=${key}&hash=$(hash)',
    callbackBodyType: 'application/json',
  };
  var putPolicy = new qiniu.rs.PutPolicy(options);
  var uploadToken = putPolicy.uploadToken(mac);
  console.log(uploadToken);
  return uploadToken;
}
