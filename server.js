var qiniu = require('./index.js')
//var http = require('http')
//var fs = require('fs')
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
var body ='';

//callBackTest
app.get('/testcb',function(req,res){
  console.log('test at');
  res.render('qncallback.html');
  res.end();
});
app.post('/qncback',function(req,res){
  body = body+req.body;
  console.log(req.body);
});
app.get('/get/qncback',function(req,res){
    res.send(body);
    res.end();
    body = '';
});


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




// http.createServer(function (req,res){
//   console.log(req.url);
//   try{
//     if(req.url=='/get/uptoken'){
//       var token = getToken();
//       console.log(token);
//       res.writeHead(200,{
//         "Content-Type":"text/plain",
//         "Cache-Control":"no-cache,no-store",
//       });
//       res.write(token);
//       res.end();
//     }else if(req.url=='/get/upload'){
//       res.writeHead(200,{
//         "Content-Type":"text/html",
//         "Cache-Control":"public,max-age=5000",
//       });
//       fs.readFile('./upload.html','utf-8',function (err,data) {
//         if(err){
//           throw err;
//         }
//         res.end(data);
//       });
//     }
//     else{
//       res.writeHead(302,{
//             'Location': 'http://cdn.iorange.vip/90d9b2965c60496d4c9b19bc452d1dde.jpg',
//         });
//         res.end();
//     }
//   }catch(e){
//     res.end(e.stack);
//   }
// }).listen(11010);
// console.log('server at 11010');
//
function getToken() {
  var mac = new qiniu.auth.digest.Mac(qiniu.conf.ACCESS_KEY, qiniu.conf.SECRET_KEY);
  var options = {
    scope: 'blog-image:test-node',
    deadline: 120,
    insertOnly: 1,
    isPrefixalScope: 1,
    callbackUrl:'http://node.ijemy.com/qncback',
    callbackBody:'key=${key}&hash=$(hash)',
    callbackBodyType:'application/json'
  };
  var putPolicy = new qiniu.rs.PutPolicy(options);
  var uploadToken = putPolicy.uploadToken(mac);
  return uploadToken;
  console.log(uploadToken);
}
