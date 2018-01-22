var qiniu = require("qiniu");
var express = require("express");
var util = require("util");
var config = require("./config.js");
var request = require("request");
var app = express();
// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(__dirname + "/"));
var multiparty = require("multiparty");
//app.use(express.urlencoded());
// app.use('/bower_components', express.static(__dirname + '/../bower_components'));
// app.use('/src', express.static(__dirname + '/../src'));

var mac = new qiniu.auth.digest.Mac(config.AccessKey, config.SecretKey);
var config2 = new qiniu.conf.Config();
config2.zone = qiniu.zone.Zone_z2;
var formUploader = new qiniu.form_up.FormUploader(config2);
var putExtra = new qiniu.form_up.PutExtra();
var options = {
  scope: config.Bucket,
  deleteAfterDays: 7,
  returnBody:
    '{"key":"$(key)","hash":"$(etag)","fsize":$(fsize),"bucket":"$(bucket)","name":"$(x:name)"}'
};
var putPolicy = new qiniu.rs.PutPolicy(options);
var bucketManager = new qiniu.rs.BucketManager(mac, null);

app.get("/api/uptoken", function(req, res, next) {
  var token = putPolicy.uploadToken(mac);
  res.header("Cache-Control", "max-age=0, private, must-revalidate");
  res.header("Pragma", "no-cache");
  res.header("Expires", 0);
  if (token) {
    res.json({
      uptoken: token
    });
  }
});
app.post("/api/take", function(req, res) {
  var form = new multiparty.Form();
  form.parse(req, function(err, fields, files) {
    var path = files.file[0].path;
    var token = fields.token[0];
    var key = fields.key[0];
    formUploader.putFile(token, key, path, putExtra, function(
      respErr,
      respBody,
      respInfo
    ) {
      if (respErr) {
        throw respErr;
      }
      if (respInfo.statusCode == 200) {
        res.json(respBody);
      } else {
        console.log(respInfo.statusCode);
        console.log(respBody);
      }
    });
  });
  // formUploader.putFile()
  // var url = req.body.url;
  // var key = req.body.key;
  // var file = req.files;

  // var token = req.body.token;
  // console.log(url);
  // var r = request.post(url);
  // var form = r.form();
  // form.append("key", key);
  // form.append("file", file);
  // form.append("token", token);
  // r.pipe(res);
});
app.post("/api/downtoken", function(req, res) {
  var key = req.body.key;
  var domain = req.body.domain;

  //trim '/' if the domain's last char is '/'
  if (domain.lastIndexOf("/") === domain.length - 1) {
    domain = domain.substr(0, domain.length - 1);
  }

  var deadline = 3600 + Math.floor(Date.now() / 1000);
  var privateDownUrl = bucketManager.privateDownloadUrl(domain, key, deadline);
  res.json({
    url: privateDownUrl
  });
});

// app.get('/', function(req, res) {
//   res.render('index.html', {
//     domain: config.Domain,
//     uptoken_url: config.UptokenUrl
//   });
// });

// app.get('/multiple', function(req, res) {
//   res.render('multiple.html', {
//     domain: config.Domain,
//     uptoken_url: config.UptokenUrl
//   });
// });

// app.get('/formdata', function(req, res) {
//   var token = putPolicy.uploadToken(mac);
//   res.render('formdata.html', {
//     domain: config.Domain,
//     uptoken: token
//   });
// });

// app.get('/performance', function(req, res) {
//   var token = putPolicy.uploadToken(mac);
//   res.render('performance.html', {
//     uptoken: token
//   });
// });

app.listen(config.Port, function() {
  console.log("Listening on port %d\n", config.Port);
  console.log(
    "▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽  Demos  ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽ ▽"
  );
  console.log(
    " ▹▹▹▹▹▹▹▹▹▹▹▹▹▹▹▹  Upload: http://127.0.0.1:%d   ◁ ◁ ◁ ◁ ◁ ◁ ◁",
    config.Port
  );
  console.log(
    " ▹▹▹▹▹▹▹  Multiple upload: http://127.0.0.1:%d/multiple  ◁ ◁ ◁",
    config.Port
  );
  console.log(
    " ▹▹▹▹▹▹▹  Formdata upload: http://127.0.0.1:%d/formdata  ◁ ◁ ◁",
    config.Port
  );
  console.log(
    " ▹▹▹▹▹▹▹  Up  Performance: http://127.0.0.1:%d/performance ◁ ◁",
    config.Port
  );
  console.log(
    "△ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △ △\n"
  );
});
