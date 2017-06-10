var qiniu = require('../');

// 初始化ak,sk
qiniu.conf.ACCESS_KEY = 'FMVCRs2-LO1ivRNi4l7mEZE6ZDvPv-519D12kZCO';
qiniu.conf.SECRET_KEY = 'InOXBls8alaPiRcFn002XsoXKFw1iFJZxcoOvAeY';

//上传策略 http://developer.qiniu.com/article/developer/security/put-policy.html
// bucket:key 空间名:文件名
var policy = {
  scope : 'uploadtest'
};

var key = null;

var filePath = '../gopher.png';

var putPolicy = new qiniu.rs.PutPolicy2(policy);

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



