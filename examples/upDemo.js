var qiniu = require('qiniu');

// 初始化ak,sk
qiniu.conf.ACCESS_KEY = 'ACCESS_KEY';
qiniu.conf.SECRET_KEY = 'SECRET_KEY';

//上传策略 http://developer.qiniu.com/article/developer/security/put-policy.html
// bucket:key 空间名:文件名
var putPolicy = new qiniu.rs.PutPolicy2(new policy('bucket:key'));

var token = putPolicy.token();


console.log(token);

//key 上传空间的文件名需要和 putPolicy 中的key 相同
qiniu.io.putFile(token,key,filePath ,null,function(err, ret) {
    if (!err) {
      // 上传成功， 处理返回值
      console.log(ret.key, ret.hash, ret.returnBody);
      // ret.key & ret.hash
    } else {
      // 上传失败， 处理返回代码
      console.log(err)
      // http://developer.qiniu.com/docs/v6/api/reference/codes.html
    }
  });

