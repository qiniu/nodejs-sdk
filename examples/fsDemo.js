var qiniu = require('../');

qiniu.conf.ACCESS_KEY = 'DWQOcImtTCrnPp1ogwgAHBdIK1mIFrnmtnXb-66-';
qiniu.conf.SECRET_KEY = 'cJFhYuaq7Vo35e1XDFUG8Rm8C2VjkpmXO0aGkJGM';

var cdnManager = new qiniu.fs.CdnManager;

var urls = "http://pictures.gugaobai.top//OnePiece/Luffy.jpg, http://pictures.gugaobai.top/CallBack/MaoFuShe";

var dirs = 'http://pictures.gugaobai.top//OnePiece/, http://pictures.gugaobai.top/CallBack/';
//
// cdnManager.refreshUrls(urls, function (err, ret) {
//     if (!err) {
//         // 上传成功， 处理返回值
//         console.log(ret);
//     } else {
//         // 上传失败， 处理返回代码
//         console.log(err);
//     }
// });
//
// cdnManager.refreshDirs(dirs, function (err, ret) {
//     if (!err) {
//         // 上传成功， 处理返回值
//         console.log(ret);
//     } else {
//         // 上传失败， 处理返回代码
//         console.log(err);
//     }
// });
//
// cdnManager.refreshUrlsAndDirs(urls, dirs, function (err, ret) {
//     if (!err) {
//         // 上传成功， 处理返回值
//         console.log(ret);
//     } else {
//         // 上传失败， 处理返回代码
//         console.log(err);
//     }
// });

cdnManager.prefetch(urls, function (err, ret) {
    if (!err) {
        // 上传成功， 处理返回值
        console.log(ret);
    } else {
        // 上传失败， 处理返回代码
        console.log(err);
    }
})

cdnManager.bandwidth()