---
title: NodeJS SDK | 七牛云存储
---

# NodeJS SDK 使用指南

该 SDK 适用于 NodeJS 0.4.7 及其以上版本，基于 [七牛云存储官方API](/v3/api/) 构建。若您的服务端是一个基于 NodeJS 编写的网络程序，使用此 SDK ，能让您以非常便捷地方式将数据安全地存储到七牛云存储上。以便让您应用的终端用户进行高速上传和下载，同时也使得您的服务端更加轻盈。

七牛云存储 NodeJS SDK 开放源代码地址：[https://github.com/qiniu/nodejs-sdk](https://github.com/qiniu/nodejs-sdk)

**文档大纲**

- [安装](#Installation)
- [使用](#Usage)
    - [获取 ACCESS_KEY 和 SECRET_KEY](#appkey)
    - [应用接入与初始化](#establish_connection!)
    - [上传文件](#upload)
        - [获取用于上传文件的临时授权凭证](#generate-token)
        - [服务端上传文件](#server-side-upload)
            - [非断点续传方式](#normal-upload)
            - [默认上传方式](#default-upload)
            - [针对NotFound处理场景](#upload-file-not-found)
        - [客户端上传文件](#client-side-upload)
    - [获取文件属性信息](#stat)
    - [获取文件下载链接（含文件属性信息）](#get)
    - [获取文件下载链接（断点续下载）](#getIfNotModified)
    - [创建公开外链](#publish)
    - [取消公开外链](#unpublish)
    - [删除指定文件](#remove)
    - [删除所有文件（指定 bucket）](#drop)
    - [图像处理](#fo-image)
        - [图像处理（缩略、裁剪、旋转、转化）](#qiniu-img-mogrify)
        - [图像处理（缩略、裁剪、旋转、转化）并持久化](#imageMogrifyAs)
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

    // 配置密钥
    qiniu.conf.ACCESS_KEY = '<YOUR_ACCESS_KEY>';
    qiniu.conf.SECRET_KEY = '<YOUR_SECRET_KEY>';

    // 实例化带授权的 HTTP Client 对象
    var conn = new qiniu.digestauth.Client();
    var bucket = "<YOUR_CUSTOM_BUCKET_NAME>";

    // 创建空间，也可以在开发者自助网站创建
    qiniu.rs.mkbucket(conn, bucket, function(resp) {
        console.log("\n===> Make bucket result: ", resp);
        if (resp.code != 200) {
            return;
        }
    });

    // 实例化 Bucket 操作对象
    var rs = new qiniu.rs.Service(conn, "<YOUR_CUSTOM_BUCKET_NAME>");


<a name="upload"></a>

### 上传文件

<a name="generate-token"></a>

#### 获取用于上传文件的临时授权凭证

要上传一个文件，首先需要调用 SDK 提供的 `qiniu.auth.UploadToken(options)`创建一个token对象，然后使用它提供的generateToken()方法生成用于临时匿名上传的upload_token——经过数字签名的一组数据信息，该 upload_token 作为文件上传流中 multipart/form-data 的一部分进行传输。


    var options = {
        scope: <BucketName string>,
        expires: <ExpiresInSeconds int>,
        callbackUrl: <CallbackURL string>,
        callbackBodyType: <HttpRequestContentType string>,
        customer: <EndUserId string>
    };

var token = new qiniu.auth.UploadToken(options);
var uploadToken = token.generateToken();

**options参数**

scope
: 必须，字符串类型（String），设定文件要上传到的目标 `bucket`

expires
: 可选，数字类型，用于设置上传 URL 的有效期，单位：秒，缺省为 3600 秒，即 1 小时后该上传链接不再有效（但该上传URL在其生成之后的59分59秒都是可用的）。

:callbackUrl
: 可选，字符串类型（String），用于设置文件上传成功后，七牛云存储服务端要回调客户方的业务服务器地址。

callbackBodyType
: 可选，字符串类型（String），用于设置文件上传成功后，七牛云存储服务端向客户方的业务服务器发送回调请求的 `Content-Type`。比如发送POST类型的表单数据回调，可以是 `application/x-www-form-urlencoded`。

customer
: 可选，字符串类型（String），客户方终端用户（End User）的ID，该字段可以用来标示一个文件的属主，这在一些特殊场景下（比如给终端用户上传的图片打上名字水印）非常有用。

**响应**

返回一个字符串类型（String）的用于上传文件用的临时授权 `uploadToken`。


<a name="server-side-upload"></a>

#### 服务端上传文件

<a name="normal-upload"></a>

##### 非断点续上传方式

如果您确定客户端上传的东西无需使用断点续上传方式进行上传，可以使用rs.uploadFileWithToken()。

    rs.uploadFileWithToken(uploadToken, localFile, key, mimeType, customMeta, callbackParams, enableCrc32Check, function(resp){
        console.log("\n===> Upload File with Token result: ", resp);
        if (resp.code != 200) {
            return;
        }
    });


**参数**

uploadToken
: 必须，字符串类型（String），调用 `UploadToken.generateToken()` 生成的 [用于上传文件的临时授权凭证](#generate-token)

localFile
: 必须，字符串类型（String），本地文件可被读取的有效路径

key
: 必须，字符串类型（String），类似传统数据库里边某个表的主键ID，给每一个文件一个UUID用于进行标示。

mimeType
: 可选，字符串类型（String），文件的 mime-type 值。如若不传入，SDK 会自行计算得出，若计算失败缺省使用 `application/octet-stream` 代替之。

customMeta
: 可选，字符串类型（String），为文件添加备注信息。

callbackParams
: 可选，String 或者 Hash 类型，文件上传成功后，七牛云存储向客户方业务服务器发送的回调参数。

enableCrc32Check
: 可选，Boolean 类型，是否启用文件上传 crc32 校验，缺省为 false 。

**响应**

如果操作成功，回调函数的 resp 参数返回如下一段 json 信息：

    {
        code: 200,
        data: {
            hash: 'FrOXNat8VhBVmcMF3uGrILpTu8Cs'
        }
    }

<a name="default-upload"></a>

##### 默认上传方式

up.Upload()函数封装了以上断点续上传和非断点续上传的方式。如果您上传的文件大于设置的BLOCK大小（该值可以在conf.js配置文件中进行设置），则默认采用断点续上传的方式进行上传。否则，采用普通的方式进行上传。

<a name="upload-file-not-found"></a>

##### 针对 NotFound 场景处理

您可以上传一个应对 HTTP 404 出错处理的文件，当您 [创建公开外链](#publish) 后，若公开的外链找不到该文件，即可使用您上传的“自定义404文件”代替之。要这么做，您只须使用 `up.Upload()` 函数上传一个 `key` 为固定字符串类型的值 `errno-404` 即可。

除了使用 SDK 提供的方法，同样也可以借助七牛云存储提供的命令行辅助工具 [qboxrsctl](https://github.com/qiniu/devtools/tags) 达到同样的目的：

    qboxrsctl put <Bucket> <Key> <LocalFile>

将其中的 `<Key>` 换作  `errno-404` 即可。

注意，每个 `<Bucket>` 里边有且只有一个 `errno-404` 文件，上传多个，最后的那一个会覆盖前面所有的。

<a name="client-side-upload"></a>

#### 客户端直传文件

客户端上传流程和服务端上传类似，差别在于：客户端直传文件所需的 `uploadToken` 可以选择在客户方的业务服务器端生成，也可以选择在客户方的客户端程序里边生成。选择前者，可以和客户方的业务揉合得更紧密和安全些，比如防伪造请求。

简单来讲，客户端上传流程也分为两步：

1. 获取 `uploadToken`（[用于上传文件的临时授权凭证](#generate-upload-token)）
2. 将该 `uploadToken` 作为文件上传流 `multipart/form-data` 中的一部分实现上传操作

如果您的网络程序是从云端（服务端程序）到终端（手持设备应用）的架构模型，且终端用户有使用您移动端App上传文件（比如照片或视频）的需求，可以把您服务器得到的此 `uploadToken` 返回给手持设备端的App，然后您的移动 App 可以使用 [七牛云存储 Objective-SDK （iOS）](http://docs.qiniutek.com/v3/sdk/objc/) 或 [七牛云存储 Android-SDK](http://docs.qiniutek.com/v3/sdk/android/) 的相关上传函数或参照 [七牛云存储API之文件上传](http://docs.qiniutek.com/v3/api/io/#upload) 直传文件。这样，您的终端用户即可把数据（比如图片或视频）直接上传到七牛云存储服务器上无须经由您的服务端中转，而且在上传之前，七牛云存储做了智能加速，终端用户上传数据始终是离他物理距离最近的存储节点。当终端用户上传成功后，七牛云存储服务端会向您指定的 `callbackUrl` 发送回调数据。如果 `callbackUrl` 所在的服务处理完毕后输出 `JSON` 格式的数据，七牛云存储服务端会将该回调请求所得的响应信息原封不动地返回给终端应用程序。

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


<a name="fo-image"></a>

### 图像处理

<a name="qiniu-img-mogrify"></a>

### 图像处理（缩略、裁剪、旋转、转化）

`qiniu.img.mogrify()` 方法支持将一个存储在七牛云存储的图片进行缩略、裁剪、旋转和格式转化处理，该方法返回一个可以直接预览缩略图的URL。

    var imgMogrPreviewURL = qiniu.img.mogrify(imageDownloadURL, options);

**参数**

imageDownloadURL
: 必须，字符串类型（string），指定原始图片的下载链接，可以根据 rs.get() 获取到。

options
: 必须，对象型（object），JSON 格式的图像处理参数。

`options` 对象具体的规格如下：

    options = {
        "thumbnail": <ImageSizeGeometry>,
        "gravity": <GravityType>, =NorthWest, North, NorthEast, West, Center, East, SouthWest, South, SouthEast
        "crop": <ImageSizeAndOffsetGeometry>,
        "quality": <ImageQuality>,
        "rotate": <RotateDegree>,
        "format": <DestinationImageFormat>, =jpg, gif, png, tif, etc.
        "auto_orient": <TrueOrFalse>
    }

`qiniu.img.mogrify()` 方法是对七牛云存储图像处理高级接口的完整包装，关于 `options` 参数里边的具体含义和使用方式，可以参考文档：[图像处理高级接口](#/v3/api/foimg/#fo-imageMogr)。

<a name="imageMogrifyAs"></a>

### 图像处理（缩略、裁剪、旋转、转化）并持久化存储处理结果

`qiniu.rs` 模块提供的 `imageMogrifyAs()` 方法支持将一个存储在七牛云存储的图片进行缩略、裁剪、旋转和格式转化处理，并且将处理后的缩略图作为一个新文件持久化存储到七牛云存储服务器上，这样就可以供后续直接使用而不用每次都传入参数进行图像处理。

    var conn = new qiniu.digestauth.Client();

    var imgrs = new qiniu.rs.Service(conn, thumbnails_bucket);

    imgrs.imageMogrifyAs(key, SourceImageDownloadURL, options, function(resp) {
        console.log("\n===> imageMogrifyAs result: ", resp);
        if (resp.code != 200) {
            return;
        }
    });

**参数**

imageDownloadURL
: 必须，字符串类型（string），指定原始图片的下载链接，可以根据 rs.get() 获取到。

options
: 必须，对象型（object），JSON 格式的图像处理参数。

`options` 对象具体的规格如下：

    options = {
        "thumbnail": <ImageSizeGeometry>,
        "gravity": <GravityType>, =NorthWest, North, NorthEast, West, Center, East, SouthWest, South, SouthEast
        "crop": <ImageSizeAndOffsetGeometry>,
        "quality": <ImageQuality>,
        "rotate": <RotateDegree>,
        "format": <DestinationImageFormat>, = jpg, gif, png, tif, etc.
        "auto_orient": <TrueOrFalse>
    }

`imgrs.imageMogrifyAs()` 方法同样是对七牛云存储图像处理高级接口的完整包装，关于 `options` 参数里边的具体含义和使用方式，可以参考文档：[图像处理高级接口](#/v3/api/foimg/#fo-imageMogr)。

**注意**

在上述示例代码中，我们实例化了一个新的 `imgrs` 对象，之所以这么做是因为我们考虑到缩略图也许可以创建公开外链，即缩略图所存放的 `thumbnails_bucket` 可以通过调用 `imgrs.publish()` 方法公开从而提供静态链接直接访问，这样做的好处是限定了作用域仅限于 `thumbnails_bucket`，也使得缩略图不必通过API通道进行请求且使用静态CDN加速访问，同时也保证了原图不受任何操作影响。

为了使得调用 `imgrs.imageMogrifyAs()` 方法有实际意义，客户方的业务服务器必须保存 `<thumbnails_bucket>` 和 `imgrs.imageMogrifyAs` 方法中参数 `<key>` 的值。如此，该缩略图作为一个新文件可以使用 NodeJS SDK 提供的任何方法。

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

