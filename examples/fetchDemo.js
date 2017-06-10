var qiniu = require('../');

// 初始化ak,sk
qiniu.conf.ACCESS_KEY = 'FMVCRs2-LO1ivRNi4l7mEZE6ZDvPv-519D12kZCO';
qiniu.conf.SECRET_KEY = 'InOXBls8alaPiRcFn002XsoXKFw1iFJZxcoOvAeY';

var bucket = 'video';
var key = 'test.mp4';
var fetchUrl = 'http://oqjogc5.bkt.clouddn.com/DJABCD.mp3';

var client = new qiniu.rs.Client();

client.fetch(fetchUrl, bucket, key, function(err, ret){
        if (!err) {
                // 上传成功， 处理返回值
            console.log(ret.hash);
            console.log(ret);
    } else {
        console.log(err);
    }
});
