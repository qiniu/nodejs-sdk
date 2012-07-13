---
title: NodeJS SDK | 七牛云存储
---

# NodeJS SDK 使用指南

该 SDK 适用于 NodeJS 0.4.7 及其以上版本，基于 [七牛云存储官方API](/v2/api/) 构建。若您的服务端是一个基于 NodeJS 编写的网络程序，使用此 SDK ，能让您以非常便捷地方式将数据安全地存储到七牛云存储上。以便让您应用的终端用户进行高速上传和下载，同时也使得您的服务端更加轻盈。

七牛云存储 NodeJS SDK 开放源代码地址：[https://github.com/qiniu/nodejs-sdk](https://github.com/qiniu/nodejs-sdk)

**文档大纲**

- [安装](#Installation)
- [使用](#Usage)
    - [获取 ACCESS_KEY 和 SECRET_KEY](#appkey)
    - [应用接入与初始化](#establish_connection!)
    - [客户端直传](#client-side-upload)
        - [获取客户端用于上传文件用的临时授权URL](#put-auth)
        - [客户端直传文件](client-multipart-upload)
    - [服务端直传](#server-side-upload)
        - [上传一个流](#put)
        - [上传一个文件](#putFile)
    - [获取文件属性信息](#stat)
    - [获取文件下载链接（含文件属性信息）](#get)
    - [获取文件下载链接（断点续下载）](#getIfNotModified)
    - [创建公开外链](#publish)
    - [取消公开外链](#unpublish)
    - [删除指定文件](#remove)
    - [删除所有文件（指定 bucket）](#drop)
- [贡献代码](#Contributing)
- [许可证](#License)

<a name="Installation"></a>

## 安装

通过 npm 以 node 模块化的方式安装：

    npm install qiniu

<a name="Usage"></a>

## 使用

<a name="appkey"></a>

### 获取 ACCESS_KEY 和 SECRET_KEY

要对接七牛云存储服务，您需要七牛云存储服务端颁发给您的 `ACCESS_KEY` 和 `SECRET_KEY`。`ACCESS_KEY` 用于标识客户方的身份，在网络请求中会以某种形式进行传输。`SECRET_KEY` 作为私钥形式存放于客户方本地并不在网络中传递，`SECRET_KEY` 的作用是对于客户方发起的具体请求进行数字签名，用以保证该请求是来自指定的客户方并且请求本身是合法有效的。使用 `ACCESS_KEY` 进行身份识别，加上 `SECRET_KEY` 进行数字签名，即可完成应用接入与认证授权。

您可以通过如下步骤获得 `ACCESS_KEY` 和 `SECRET_KEY`：

1. [开通七牛开发者帐号](https://dev.qiniutek.com/signup)
2. [登录七牛开发者自助平台，查看 ACCESS_KEY 和 SECRET_KEY](https://dev.qiniutek.com/account/keys)

获取到 `ACCESS_KEY` 和 `SECRET_KEY` 之后，您就可以参考下面将要介绍的用法进行接入使用了。

<a name="establish_connection!"></a>

### 应用接入与初始化

使用 npm 安装成功后，您就可以直接在项目中使用了，如下示例代码：

    var qiniu = require("qiniu");

    qiniu.conf.ACCESS_KEY = '<YOUR_ACCESS_KEY>';
    qiniu.conf.SECRET_KEY = '<YOUR_SECRET_KEY>';

    var conn = new qiniu.digestauth.Client();
    var rs = new qiniu.rs.Service(conn, "<YOUR_CUSTOM_BUCKET_NAME>");

<a name="client-side-upload"></a>

### 客户端直传

<a name="put-auth"></a>

#### 获取客户端用于上传文件用的临时授权URL

    rs.putAuth(function(resp) {
        console.log("\n===> putAuth result: ", resp);
        if (resp.code != 200) {
            return;
        }
        // then send the resp.data.url to your clients
        // for more details, see: http://docs.qiniutek.com/v2/api/io/#rs-PutAuth
    });
    
还可以使用 `rs.putAuthEx()` 方法来定制上传授权URL的有效时长，以及指定文件上传成功后七牛云存储服务器回调到您业务服务器的地址。示例代码如下：

    var expiresIn = 86400;
    var callbackUrl = 'http://example.com/notifications/qiniurs_callback';
    
    rs.putAuthEx(expiresIn, callbackUrl, function(resp) {
        console.log("\n===> putAuthEx result: ", resp);
        if (resp.code != 200) {
            return;
        }
        // then send the resp.data.url to your clients
        // for more details, see: http://docs.qiniutek.com/v2/api/io/#rs-PutAuth
    });
    
**响应**

    {
        code: 200,
        data: {
            expiresIn: 86400, // 缺省情况下是 3600 秒
            url: 'http://<io-node-n>.qbox.me/upload/<UploadHandle>'
        }
    }

<a name="client-multipart-upload"></a>

#### 客户端直传文件

一旦取得上传授权的URL后，客户端比如浏览器或者手持设备端就可以往这个URL开始上传文件了。如果是手持端，您可以参考七牛云存储的 ObjC 或者 Java SDK 提供的文件上传方法，如果是网页直传，您可以参考协议规格：[客户端直传](/v2/api/io/#rs-PutAuth)，也可以参考示例程序：[https://github.com/qiniu/nodejs-ajax-upload-example](https://github.com/qiniu/nodejs-ajax-upload-example)。

<a name="server-side-upload"></a>

### 服务端直传

<a name="put"></a>

#### 上传一个流

    rs.put(key, mimeType, fp, bytes, function(resp){
        console.log("\n===> put result: ", resp);
        if (resp.code != 200) {
            return;
        }
    });
    
**参数**

key
: 资源的ID

mimeType
: 资源的 MIME 类型

fp
: 数据流句柄

bytes
: 数据块大小

callback function
: 请求完成之后执行的回调函数

**响应**

如果操作成功，回调函数的 resp 参数返回如下一段 json 信息：

    {
        code: 200, 
        data: {
            hash: 'FrOXNat8VhBVmcMF3uGrILpTu8Cs'
        }
    }

<a name="putFile"></a>

#### 上传一个文件

    rs.putFile(key, mimeType, localFile, function(resp){
        console.log("\n===> putFile result: ", resp);
        if (resp.code != 200) {
            return;
        }
    });
    
**参数**

key
: 资源ID

mimeType
: 资源的 MIME 类型

localFile
: 文件所在路径

callback function
: 请求完成之后执行的回调函数

**响应**

如果操作成功，回调函数的 resp 参数返回如下一段 json 信息：

    {
        code: 200, 
        data: {
            hash: 'FrOXNat8VhBVmcMF3uGrILpTu8Cs'
        }
    }

<a name="stat"></a>

### 获取文件属性信息

    rs.stat(key, function(resp) {
        console.log("\n===> Stat result: ", resp);
        if (resp.code != 200) {
            return;
        }
    });

**参数**

key
: 资源ID

callback function
: 请求完成之后执行的回调函数

**响应**

如果操作成功，回调函数的 resp 参数返回如下一段 json 信息：

    {
        code: 200,
        data: {
            fsize: 1275, // 资源大小
            hash: 'FrOXNat8VhBVmcMF3uGrILpTu8Cs', // 资源摘要值
            mimeType: 'application/octet-stream', // 资源的 MIME 类型
            putTime: 13421490912350790 // 资源最后修改时间，单位：百纳秒
        }
    }

<a name="get"></a>

### 获取文件下载链接（含文件属性信息）

    rs.get(key, saveAsFriendlyName, function(resp) {
        console.log("\n===> Get result: ", resp);
        if (resp.code != 200) {
            return;
        }
    });

**参数**

key
: 资源ID

saveAsFriendlyName
: 指定文件下载下来要保存的文件名称

callback function
: 请求完成之后执行的回调函数

**响应**

如果操作成功，回调函数的 resp 参数返回如下一段 json 信息：

    {
        code: 200,
        data: {
            fsize: 1275, // 资源大小
            hash: 'FrOXNat8VhBVmcMF3uGrILpTu8Cs', // 资源摘要值
            mimeType: 'application/octet-stream', // 资源的 MIME 类型
            expires: 3600 // 缺省3600秒，指定下载链接的有效期
            url: 'http://iovip.qbox.me/file/...' // 文件下载链接
        }
    }

<a name="getIfNotModified"></a>

### 获取文件下载链接（断点续下载）

    rs.getIfNotModified(key, saveAsFriendlyName, baseVer, function(resp) {
        console.log("\n===> Get result: ", resp);
        if (resp.code != 200) {
            return;
        }
    });

**参数**

key
: 资源ID

saveAsFriendlyName
: 指定文件下载下来要保存的文件名称

baseVer
: 续传的基版本，一般为上一次请求下载返回的 `hash` 值

callback function
: 请求完成之后执行的回调函数

**响应**

同 `rs.get` 返回的结果规格一致。

<a name="publish"></a>

### 创建公开外链

    rs.publish(domain, function(resp) {
        console.log("\n===> publish result: ", resp);
        if (resp.code != 200) {
            return;
        }
    });

调用 `rs.publish` 函数可以将您在七牛云存储中的资源表 `bucket` 发布到某个 `domain` 下，`domain` 需要在 DNS 管理里边 CNAME 到 `iovip.qbox.me` 。

这样，用户就可以通过 `http://<domain>/<key>` 来访问资源表 `bucket` 中的文件。键值为 `foo/bar/file` 的文件对应访问 URL 为 `http://<domain>/foo/bar/file`。 `domain` 可以是一个真实的域名，比如 `www.example.com`，也可以是七牛云存储的二级路径，比如 `io.qbox.me/bucket` 。

例如：执行 `rs.publish("cdn.example.com", function(resp){…})` 后，那么键名为 `foo/bar/file` 的文件可以通过 `http://cdn.example.com/foo/bar/file` 公开访问。

**参数**

domain
: 必须，字符串类型（String），资源表发布的目标域名，例如：`cdn.example.com`

callback function
: 请求完成之后执行的回调函数

**响应**

如果操作成功，回调函数的 resp 参数返回如下一段 json 信息：

    { code: 200 }

<a name="unpublish"></a>

### 取消公开外链

取消指定 `bucket` 的在某个 `domain` 域下的所有公开外链访问。

    rs.unpublish(domain, function(resp) {
        console.log("\n===> unpublish result: ", resp);
        if (resp.code != 200) {
            return;
        }
    });
    
参数 和 响应的返回值 同 `rs.publish()` 规格一致。

<a name="remove"></a>

### 删除指定文件

`rs.remove()` 函数提供了从即定的 `bucket` 中删除指定的 `key`，即删除 `key` 索引关联的具体文件。

    rs.remove(key, function(resp) {
        console.log("\n===> remove result: ", resp);
        if (resp.code != 200) {
            return;
        }
    });
    
**响应**

如果操作成功，回调函数的 resp 参数返回如下一段 json 信息：

    { code: 200 }

<a name="drop"></a>

### 删除所有文件（指定 bucket）

`rs.drop()` 提供了删除整个 `bucket` 及其里边的所有 `key`，以及这些 `key` 关联的所有文件都将被删除。

    rs.drop(function(resp) {
        console.log("\n===> drop result: ", resp);
        if (resp.code != 200) {
            return;
        }
    });

**响应**

如果操作成功，回调函数的 resp 参数返回如下一段 json 信息：

    { code: 200 }

<a name="Contributing"></a>

## 贡献代码

七牛云存储 NodeJS SDK 开放源代码地址：[https://github.com/qiniu/nodejs-sdk](https://github.com/qiniu/nodejs-sdk)

1. 登录 [github.com](https://github.com)
2. Fork [https://github.com/qiniu/nodejs-sdk](https://github.com/qiniu/nodejs-sdk)
3. 创建您的特性分支 (`git checkout -b my-new-feature`)
4. 提交您的改动 (`git commit -am 'Added some feature'`)
5. 将您的改动记录提交到远程 `git` 仓库 (`git push origin my-new-feature`)
6. 然后到 github 网站的该 `git` 远程仓库的 `my-new-feature` 分支下发起 Pull Request

<a name="License"></a>

## 许可证

Copyright (c) 2012 qiniutek.com

基于 MIT 协议发布:

* [www.opensource.org/licenses/MIT](http://www.opensource.org/licenses/MIT)
