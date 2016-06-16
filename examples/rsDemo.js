
var qiniu = require('qiniu');
var path = require('path');

// 初始化ak,sk
qiniu.conf.ACCESS_KEY = 'ACCESS_KEY';
qiniu.conf.SECRET_KEY = 'SECRET_KEY';

var EntryPath = qiniu.rs.EntryPath;
var EntryPathPair = qiniu.rs.EntryPathPair;

//bucket 空间名
//key 文件名
var client = new qiniu.rs.Client();
client.stat(bucket, key,function(err, ret){
 if (!err) {
      // 上传成功， 处理返回值
      console.log(ret.hash);
      console.log(ret);
      //ret.should.have.keys('hash', 'fsize', 'putTime', 'mimeType');
      // ret.key & ret.hash
    } else {
      // 上传失败， 处理返回代码
      console.log(err)
      // http://developer.qiniu.com/docs/v6/api/reference/codes.html
    }
});


// var client = new qiniu.rs.Client();
// client.move('public','145637992222','logs','145637992222', 1, function(err, ret){
//   if(!err){
//     console.log(ret);
//   }else{
//     console.log(err);
//   }
// });


// var client = new qiniu.rs.Client();
// client.forceCopy('public','2.flv','logs','Go并发编程实战.rar', 1,function(err, ret){
//   if(!err){
//     console.log(ret);
//   }else{
//     console.log(err);
//   }
// });


// var client = new qiniu.rs.Client();
// var entries = [];
// entries.push(new EntryPathPair(new EntryPath('test01', '5s.jpeg'), new EntryPath('public', '010')));
//  entries.push(new EntryPathPair(new EntryPath('test01', '5s.jpg'), new EntryPath('public', '020')));
// client.forceBatchMove(entries, 1, function(err, ret) {
//   if(!err){
//     console.log(ret);
//   }else{
//     console.log(err);
//   }
// });
// bucket, prefix, marker, limit, delimiter, onret


// qiniu.rsf.listPrefix('atest', '0', null, null, null, function(rerr, ret,res){

//    if (res.statusCode==200) {
//         //console.log(ret);
//         console.log(ret);
//        // console.log(rerr);
//      } else {
//        //console.log(ret);
//        //console.log(res);
//       // console.log(rerr);
//      }
//  });



