# Node wrapper for Qiniu Resource (Cloud) Storage API

[![Build Status](https://travis-ci.org/qiniu/nodejs-sdk.png?branch=master)](https://travis-ci.org/qiniu/nodejs-sdk)

![logo](http://qiniutek.com/images/logo-2.png)

该 SDK 适用于 NodeJS 0.6 及其以上版本，基于 [七牛云存储官方API](/v3/api/) 构建。若您的服务端是一个基于 NodeJS 编写的网络程序，使用此 SDK ，能让您以非常便捷地方式将数据安全地存储到七牛云存储上。以便让您应用的终端用户进行高速上传和下载，同时也使得您的服务端更加轻盈。

jscoverage: [85%](http://fengmk2.github.com/coverage/qiniu.html)

## 安装

    npm install qiniu

### 获取 ACCESS_KEY 和 SECRET_KEY

要对接七牛云存储服务，您需要七牛云存储服务端颁发给您的 `ACCESS_KEY` 和 `SECRET_KEY`。`ACCESS_KEY` 用于标识客户方的身份，在网络请求中会以某种形式进行传输。`SECRET_KEY` 作为私钥形式存放于客户方本地并不在网络中传递，`SECRET_KEY` 的作用是对于客户方发起的具体请求进行数字签名，用以保证该请求是来自指定的客户方并且请求本身是合法有效的。使用 `ACCESS_KEY` 进行身份识别，加上 `SECRET_KEY` 进行数字签名，即可完成应用接入与认证授权。

您可以通过如下步骤获得 `ACCESS_KEY` 和 `SECRET_KEY`：

1. [开通七牛开发者帐号](https://dev.qiniutek.com/signup)
2. [登录七牛开发者自助平台，查看 ACCESS_KEY 和 SECRET_KEY](https://dev.qiniutek.com/account/keys)

获取到 `ACCESS_KEY` 和 `SECRET_KEY` 之后，您就可以参考下面的示例代码进行接入使用了。

## 使用

### 七牛云存储 API 文档

七牛云存储的 API 文档是根本，涵盖了七牛提供的所有服务的 API 描述。Node.js SDK 以及相应的文档就是参考七牛云存储 API 文档写成的。目前，该文档包含以下内容：

1. [应用接入与认证授权](http://docs.qiniutek.com/v3/api/auth/)
2. [云存储接口](http://docs.qiniutek.com/v3/api/io/)
3. [图像处理接口](http://docs.qiniutek.com/v3/api/foimg/)
4. [音频 / 视频处理接口](http://docs.qiniutek.com/v3/api/avfop/)
5. [理解常用术语](http://docs.qiniutek.com/v3/api/words/)
6. [错误码参照表](http://docs.qiniutek.com/v3/api/code/)

Nodejs SDK 使用文档参考：[http://docs.qiniutek.com/v3/sdk/nodejs/](http://docs.qiniutek.com/v3/sdk/nodejs/)


### 示例程序

	// 载入七牛的 Node.js SDK
    var qiniu = require('qiniu');

    // 配置密钥
    qiniu.conf.ACCESS_KEY = '<Please apply your access key>';
    qiniu.conf.SECRET_KEY = '<Dont send your secret key to anyone>';

    // 实例化带授权的 HTTP Client 对象
    var conn = new qiniu.digestauth.Client();

    // 空间名，开发者需自己在后台(http://dev.qiniutek.com)创建空间，并绑定一个域名
    var bucket = 'yet_another_bucket';

    // 实例化 Bucket 操作对象
    var rs = new qiniu.rs.Service(conn, bucket);

    // 上传文件第1步
    // 生成上传授权凭证（uploadToken）
    
    // 自定义返回参数，文件上传完成后服务端会将这些参数返回给客户端。
    var returnBody = '{ \
    	"author": "ikbear", \ //自定义返回字符串
      	"size": $(fsize), \
       "hash": $(etag), \
       "w": $(imageInfo.width), \  // w、h 和 color 值都用于图片
       "h": $(imageInfo.height), \
       "color": $(exif.ColorSpace.val) \
    }'
        
    var opts = {
    	 escape: 1,
    	 scope: bucket,
        expires: 3600, // 该 UploadToken 的有效期为 3600 秒，也即一个小时
        callbackUrl: "http://www.example.com/notifications/qiniurs", // 可选
        callbackBodyType: "application/x-www-form-urlencoded", // 可选
        customer: "username@example.com" // 可选
        returnBody: returnBody // 可选
    };
    
    // 生成 UploadToken 所需参数以及相应的逻辑请参考相关文档(http://docs.qiniutek.com/v3/api/io/#upload-token) 
    
    var token = new qiniu.auth.UploadToken(opts);
    var uploadToken = token.generateToken();

    // 上传文件第2步
    // 组装上传文件所需要的参数
    var key = "test.jpg";
    var localFile = key,
        customMeta = "",
        enableCrc32Check = false,
        mimeType = mime.lookup(key);
    
    // 上传文件时指定的回掉参数    
    var  callbackParams = '{ \
        "from": "ikbear", \
        size: $(fsize), \
        etag: $(etag), \
        w: $(imageInfo.width), \
        h: $(imageInfo.height), \
        exif: $(exif) \
    }';

    // 上传文件第3步
    // 上传文件
    rs.uploadFileWithToken(uploadToken, localFile, key, mimeType, customMeta, callbackParams, enableCrc32Check, function(err, data){
        if (err) {
            // 上传文件失败
            console.log("\n ===> Upload error!");
            return;
        }
        
        // 上传文件成功
        console.log("\n ===> Upload file result: ", data);

        // 查看已上传文件属性信息
        rs.stat(key, function(err, data) {
            if (err) {
                // 查看文件属性失败
                console.log("\n ===> Stat error.");
                return;
            }
            
            // 查看文件属性成功
            console.log("\n ===> Stat result: ", data);
        });
    });


    // 获取文件，目前获取文件的方式有两种：
    // 1) 针对公有资源，可以直接通过以下格式下载：http://<绑定域名>/<key>
    // 2) 针对私有资源，无法通过获取公有资源的形式下载，只能通过 downloadToken 的形式下载。
    // 下载方式：http://<bucket>.qiniudn.com/x.jpg?token=<token>，其中 <token> 为服务端颁发的 downloadToken。
    // downloadToken的生成逻辑详见文档：http://docs.qiniutek.com/v3/api/io/#private-download
    
    // 生成 downloadToken
    var download = new qiniu.auth.DownloadToken();
    var downloadToken = download.generateToken();
    console.log("\n ===> Download token: ", downloadToken);
    
    // 图像处理，详见相关文档：http://docs.qiniutek.com/v3/api/foimg/
    // 音频/视频处理，详见相关文档：http://docs.qiniutek.com/v3/api/avfop/
    
    // 删除已上传文件
    rs.remove(key, function(err, data) {
        if (err) {
        	// 删除文件失败
        	console.log("\n ===> Remove key error.");
        	return;
        }
        
        console.log("\n ===> Remove result: ", data);
    });


## 贡献代码

1. Fork
2. 创建您的特性分支 (`git checkout -b my-new-feature`)
3. 提交您的改动 (`git commit -am 'Added some feature'`)
4. 将您的修改记录提交到远程 `git` 仓库 (`git push origin my-new-feature`)
5. 然后到 github 网站的该 `git` 远程仓库的 `my-new-feature` 分支下发起 Pull Request

## 许可证

Copyright (c) 2012 qiniutek.com

基于 MIT 协议发布:

* [www.opensource.org/licenses/MIT](http://www.opensource.org/licenses/MIT)
