var qiniu = require('qiniu');

// 初始化ak,sk
qiniu.conf.ACCESS_KEY = 'ACCESS_KEY';
qiniu.conf.SECRET_KEY = 'SECRET_KEY';



// bucket 空间名
// key 文件名
// cmd 处理参数
// notifyURl 回调业务服务器，通知处理结果
// force 结果是否强制覆盖已有的同名文件
// pipeline 使用私有队列名

var bucket = 'bucket_name';
var key = 'key';
// 音视频处理参数：http://developer.qiniu.com/code/v6/api/dora-api/av/avthumb.html
var cmd = 'avthumb/m3u8/segtime/15/vb/1000k/s/800x400/vcode/copy/acode/copy';
var opts = {
    'force' : 1,
    'pipeline' : 'pipeline',
    'notifyURL' : 'notifyURL'
}

qiniu.fop.pfop(bucket, key, cmd, opts, function(err, ret, res) {
    if (res.statusCode==200) {
        console.log(res);
        //console.log(ret);

    } else {
        console.log(err);
    }
});
