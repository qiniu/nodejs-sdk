# Node wrapper for Qiniu Resource (Cloud) Storage service's HTTP API

该 SDK 适用于 NodeJS 0.4.7 及其以上版本，基于 [七牛云存储官方API](/v2/api/) 构建。若您的服务端是一个基于 NodeJS 编写的网络程序，使用此 SDK ，能让您以非常便捷地方式将数据安全地存储到七牛云存储上。以便让您应用的终端用户进行高速上传和下载，同时也使得您的服务端更加轻盈。

## 安装

    npm install qiniu

### 获取 ACCESS_KEY 和 SECRET_KEY

要对接七牛云存储服务，您需要七牛云存储服务端颁发给您的 `ACCESS_KEY` 和 `SECRET_KEY`。`ACCESS_KEY` 用于标识客户方的身份，在网络请求中会以某种形式进行传输。`SECRET_KEY` 作为私钥形式存放于客户方本地并不在网络中传递，`SECRET_KEY` 的作用是对于客户方发起的具体请求进行数字签名，用以保证该请求是来自指定的客户方并且请求本身是合法有效的。使用 `ACCESS_KEY` 进行身份识别，加上 `SECRET_KEY` 进行数字签名，即可完成应用接入与认证授权。

您可以通过如下步骤获得 `ACCESS_KEY` 和 `SECRET_KEY`：

1. [开通七牛开发者帐号](https://dev.qiniutek.com/signup)
2. [登录七牛开发者自助平台，查看 ACCESS_KEY 和 SECRET_KEY](https://dev.qiniutek.com/account/keys)

获取到 `ACCESS_KEY` 和 `SECRET_KEY` 之后，您就可以参考下面的示例代码进行接入使用了。

## 使用

SDK 使用文档参考：[http://docs.qiniutek.com/v2/sdk/nodejs/](http://docs.qiniutek.com/v2/sdk/nodejs/)

### 示例程序

    var qiniu = require("qiniu");

    qiniu.conf.ACCESS_KEY = '<YOUR_ACCESS_KEY>';
    qiniu.conf.SECRET_KEY = '<YOUR_SECRET_KEY>';

    var conn = new qiniu.digestauth.Client();
    var rs = new qiniu.rs.Service(conn, "<YOUR_CUSTOM_BUCKET_NAME>");

    // uploading by the server side

    var key = "test.js";
    var friendlyName = key;

    // uploading script self
    rs.putFile(key, null, __filename, function(resp) {
        console.log("\n===> PutFile result: ", resp);
        if (resp.code != 200) {
            return;
        }

        // get information and downalod url of the uploaded file
        rs.get(key, friendlyName, function(resp) {
            console.log("\n===> Get result: ", resp);
            if (resp.code != 200) {
                return;
            }
        });
    });


    // uploading by the client side

    rs.putAuth(function(resp) {
        console.log("\n===> PutAuth result: ", resp);
        if (resp.code != 200) {
            return;
        }
        // then send the resp.data.url to your clients
        // for more details, see: http://docs.qiniutek.com/v2/api/io/#rs-PutAuth
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
