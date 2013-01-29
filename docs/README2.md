---
title: NodeJS SDK | 七牛云存储
---

# NodeJS SDK 使用指南

该 SDK 适用于 NodeJS 0.6 及其以上版本，基于 [七牛云存储官方API](/v3/api/) 构建。若您的服务端是一个基于 NodeJS 编写的网络程序，使用此 SDK ，能让您以非常便捷地方式将数据安全地存储到七牛云存储上。以便让您应用的终端用户进行高速上传和下载，同时也使得您的服务端更加轻盈。

七牛云存储 NodeJS SDK 开放源代码地址：[https://github.com/qiniu/nodejs-sdk](https://github.com/qiniu/nodejs-sdk) [![Build Status](https://travis-ci.org/qiniu/nodejs-sdk.png?branch=master)](https://travis-ci.org/qiniu/nodejs-sdk)

**目录**

- [安装](#Installation)
- [接入](#turn-on)
    - [获得密钥（AccessKey / SecretKey）](#establish_connection)
    - [应用初始化设置](#node-init)
- [使用](#Usage)
    - [文件上传](#upload)
        - [生成上传授权凭证（uploadToken）](#generate-upload-token)
        - [Node.js 服务端上传文件](#upload-server-side)
        - [Node.js 服务端上传流](#server-side-upload-stream)
        - [iOS / Android / Web 端直传文件说明](#upload-client-side)
    - [文件下载](#download)
        - [公有资源下载](#download-public-files)
        - [私有资源下载](#download-private-files)
            - [生成下载授权凭证（downloadToken）](#download-token)
        - [高级特性](#other-download-features)
            - [断点续下载](#resumable-download)
            - [自定义 404 NotFound](#upload-file-for-not-found)
    - [文件管理](#file-management)
        - [查看单个文件属性信息](#stat)
        - [复制单个文件](#copy)
        - [移动单个文件](#move)
        - [删除单个文件](#delete)
        - [批量操作](#batch)
            - [批量获取文件属性信息](#batch-get)
            - [批量复制文件](#batch-copy)
            - [批量移动文件](#batch-move)
            - [批量删除文件](#batch-delete)
        - 音频(TODO)
        - 视频(TODO)
- [贡献代码](#Contributing)
- [许可证](#License)

<a name="Installation"></a>

## 安装

通过 npm 以 node 模块化的方式安装：

    npm install qiniu

<a name="turn-on"></a>

## 接入

<a name="establish_connection"></a>

### 配置密钥（AccessKey / SecretKey）

要接入七牛云存储，您需要拥有一对有效的 Access Key 和 Secret Key 用来进行签名认证。可以通过如下步骤获得：

1. [开通七牛开发者帐号](https://dev.qiniutek.com/signup)
2. [登录七牛开发者自助平台，查看 Access Key 和 Secret Key](https://dev.qiniutek.com/account/keys) 。

<a name="node-init"></a>

### 应用接入与初始化

使用 npm 安装成功后，您就可以直接在项目中使用了，如下示例代码：

    var qiniu = require("qiniu");

    // 配置密钥
    qiniu.conf.ACCESS_KEY = '<YOUR_ACCESS_KEY>';
    qiniu.conf.SECRET_KEY = '<YOUR_SECRET_KEY>';

    // 实例化带授权的 HTTP Client 对象
    var conn = new qiniu.digestauth.Client();
    var bucket = "<YOUR_CUSTOM_BUCKET_NAME>";

    // 创建空间，也可以在开发者自助网站（https://dev.qiniutek.com/ ）创建。
    // 由于创建空间是一次性操作，建议开发者在网站后台自助创建以了解更多细节。
    
    qiniu.rs.mkbucket(conn, bucket, function(err, data) {
      if (err) {
        console.log("\n===> Make bucket error: ", err);
        return;
      }
      console.log("\n===> Make bucket result: ", data);
    });

    // 实例化 Bucket 操作对象
    var rs = new qiniu.rs.Service(conn, "<YOUR_CUSTOM_BUCKET_NAME>");
    
<a name="Usage"></a>

## 使用

<a name="upload"></a>

### 文件上传

**注意**：如果您只是想要上传已存在您电脑本地或者是服务器上的文件到七牛云存储，可以直接使用七牛提供的 [qrsync](/v3/tools/qrsync/) 上传工具。如果是需要通过您的网站或是移动应用(App)上传文件，则可以接入使用此 SDK，详情参考如下文档说明。

<a name="generate-upload-token"></a>

#### 生成上传授权凭证（uploadToken）

要上传一个文件，首先需要调用 SDK 提供的 `qiniu.auth.UploadToken(options)`创建一个token对象，然后使用它提供的generateToken()方法生成用于临时匿名上传的upload_token——经过数字签名的一组数据信息，该 upload_token 作为文件上传流中 multipart/form-data 的一部分进行传输。

	var options = {
        scope: <BucketName string>,
        expires: <ExpiresInSeconds int>,
        callbackUrl: <CallbackURL string>,
        callbackBodyType: <HttpRequestContentType string>,
        customer: <EndUserId string>
        escape: <Escape int>,
        asyncOps: <AsyncOps string>,
        returnBody: <ReturnBody string>,
    };
    var token = new qiniu.auth.UploadToken(options);
    var uploadToken = token.generateToken();

**参数**

:scope
: 必须，字符串类型（String），设定文件要上传到的目标 `bucket`

:expires
: 可选，数字类型，用于设置上传 URL 的有效期，单位：秒，缺省为 3600 秒，即 1 小时后该上传链接不再有效（但该上传URL在其生成之后的59分59秒都是可用的）。

:callbackUrl
: 可选，字符串类型（String），用于设置文件上传成功后，七牛云存储服务端要回调客户方的业务服务器地址。

:callbackBodyType
: 可选，字符串类型（String），用于设置文件上传成功后，七牛云存储服务端向客户方的业务服务器发送回调请求的 `Content-Type`。

:customer
: 可选，字符串类型（String），客户方终端用户（End User）的ID，该字段可以用来标示一个文件的属主，这在一些特殊场景下（比如给终端用户上传的图片打上名字水印）非常有用。

:escape
: 可选，数字类型，可选值 0 或者 1，缺省为 0 。值为 1 表示 callback 传递的自定义数据中允许存在转义符号 `$(VarExpression)`，参考 [VarExpression](/v3/api/words/#VarExpression)。

当 `escape` 的值为 `1` 时，常见的转义语法如下：

- 若 `callbackBodyType` 为 `application/json` 时，一个典型的自定义回调数据（[CallbackParams](/v3/api/io/#CallbackParams)）为：

    `{foo: "bar", w: $(imageInfo.width), h: $(imageInfo.height), exif: $(exif)}`

- 若 `callbackBodyType` 为 `application/x-www-form-urlencoded` 时，一个典型的自定义回调数据（[CallbackParams](/v3/api/io/#CallbackParams)）为：

    `foo=bar&w=$(imageInfo.width)&h=$(imageInfo.height)&exif=$(exif)`

:asyncOps
: 可选，字符串类型（String），用于设置文件上传成功后，执行指定的预转指令。参见 [uploadToken 之 asyncOps 说明](http://docs.qiniutek.com/v3/api/io/#uploadToken-asyncOps)

:returnBody
: 可选，字符串类型（String），用于设置文件上传成功后，向客户端返回指定的信息，详细使用方式请参考 [云存储接口之生成上传授权凭证说明](#http://docs.qiniutek.com/v3/api/io/#upload-token-algorithm)

**返回值**

返回一个字符串类型（String）的用于上传文件用的临时授权 `upload_token`。

<a name="upload-server-side"></a>

#### Node.js 服务端上传文件

服务端可以通过 rs.uploadFileWithToken() 函数将文件上传至七牛云端。使用方式如下：

	rs.uploadFileWithToken(uploadToken
							 , localFile
							 , key
							 , mimeType
							 , customMeta
							 , callbackParams
							 , enableCrc32Check
							 , function(err, data){
							 	if (err) {
							 		console.log("\n===> Upload File with Token error: ", err);
							 		return;
							 	}
								console.log("\n===> Upload File with Token result: ", data);
	});

**参数**

:uploadToken
: 必须，字符串类型（String），调用 `UploadToken.generateToken()` 生成的 [用于上传文件的临时授权凭证](#generate-upload-token)

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

**返回值**

上传成功，返回如下一个 Hash：

    {"hash"=>"FgHk-_iqpnZji6PsNr4ghsK5qEwR"}

<a name="server-side-upload-stream"></a>

#### Node.js 服务端上传流

服务端可以通过 rs.uploadWithToken() 函数将一个流上传至七牛云端。使用方式如下：

	rs.uploadWithToken(uploadToken
						, stream
						, key
						, mimeType
						, customMeta
						, callbackParams
						, crc32
						, function(err, data){
							if (err) {
								console.log("\n===> Upload stream with token error: ", err);
								return;
							}
						console.log("\n===> Upload stream with token result: ", data);
	});
	
**参数**

:uploadToken
: 必须，字符串类型（String），调用 `UploadToken.generateToken()` 生成的 [用于上传文件的临时授权凭证](#generate-upload-token)。

stream
: 必须，用于上传的流。

key
: 必须，字符串类型（String），类似传统数据库里边某个表的主键ID，给每一个文件一个UUID用于进行标示。

mimeType
: 可选，字符串类型（String），文件的 mime-type 值。如若不传入，SDK 会自行计算得出，若计算失败缺省使用 `application/octet-stream` 代替之。

customMeta
: 可选，字符串类型（String），为文件添加备注信息。

callbackParams
: 可选，String 或者 Hash 类型，文件上传成功后，七牛云存储向客户方业务服务器发送的回调参数。

crc32
: 可选，数字类型，流的 crc32 校验码。若指定该值，则上传的时候会将该校验码上传至云端校验。

**返回值**

上传成功，返回如下一个 Hash：

    {"hash"=>"FgHk-_iqpnZji6PsNr4ghsK5qEwR"}


#### iOS / Android / Web 端直传文件说明

客户端 iOS / Android / Web 上传流程和服务端上传类似，差别在于：客户端直传文件所需的 `uploadToken` 选择在客户方的业务服务器端生成，然后将其生成的 `uploadToken` 颁发给客户端。

简单来讲，客户端上传流程分为两步：

1. [服务端生成上传授权凭证（uploadToken）](#generate-upload-token)
2. 客户端程序调用 [iOS](/v3/sdk/objc/) / [Android](/v3/sdk/android/) SDK 的文件上传方法进行上传

如果是网页直传文件到七牛云存储，网页可以使用 JavaScript 动态实现 [七牛云存储上传API](/v3/api/io/#upload-file-by-html-form)。

通过客户端直传文件，您的终端用户即可把数据（比如图片或视频）直接上传到七牛云存储服务器上，而无须经由您的服务端中转，终端用户上传数据始终是离他物理距离最近的七牛存储节点。当终端用户上传成功后，七牛云存储服务端会向您指定的 `callback_url` （一般在 [uploadToken](#generate-upload-token) 里边指定）发送回调数据（回调数据在客户端程序里边指定）。如果 `callback_url` 所指向的服务端处理完毕后输出 `JSON` 格式的数据，七牛云存储服务端会将该回调请求所得的 JSON 响应信息原封不动地返回给客户端应用程序。

<a name="download"></a>

### 文件下载

七牛云存储上的资源下载分为 [公有资源下载](#download-public-files) 和 [私有资源下载](#download-private-files) 。

私有（private）是 Bucket（空间）的一个属性，一个私有 Bucket 中的资源为私有资源，私有资源不可匿名下载。

新创建的空间（Bucket）缺省为私有，也可以将某个 Bucket 设为公有，公有 Bucket 中的资源为公有资源，公有资源可以匿名下载。

<a name="download-public-files"></a>

#### 公有资源下载

    [GET] http://<bucket>.qiniudn.com/<key>

或者，

    [GET] http://<绑定域名>/<key>

绑定域名可以是自定义域名，可以在 [七牛云存储开发者自助网站](https://dev.qiniutek.com/buckets) 进行域名绑定操作。

注意，尖括号不是必需，代表替换项。

<a name="download-private-files"></a>

#### 私有资源下载

私有资源只能通过临时下载授权凭证(downloadToken)下载，下载链接格式如下：

    [GET] http://<bucket>.qiniudn.com/<key>?token=<downloadToken>

或者，

    [GET] http://<绑定域名>/<key>?token=<downloadToken>

<a name="download-token"></a>

##### 生成下载授权凭证（downloadToken）

`<downloadToken>` 可以使用 SDK 提供的如下方法生成：

    var options = {
        expires: <ExpiresInSeconds int>,
        pattern: <DownloadPattern string>
    };
    var token = new qiniu.auth.DownloadToken(options);
    var downloadToken = token.generateToken();

**参数**

expires_in
: 可选，数字类型，用于设置上传 URL 的有效期，单位：秒，缺省为 3600 秒，即 1 小时后该上传链接不再有效。

pattern
: 可选，字符串类型，用于设置可匹配的下载链接。参考：[downloadToken pattern 详解](http://docs.qiniutek.com/v3/api/io/#download-token-pattern)


<a name="other-download-features"></a>

#### 高级特性

<a name="resumable-download"></a>

##### 断点续下载

七牛云存储支持标准的断点续下载，参考：[云存储API之断点续下载](/v3/api/io/#download-by-range-bytes)

<a name="upload-file-for-not-found"></a>

##### 自定义 404 NotFound

您可以上传一个应对 HTTP 404 出错处理的文件，当用户访问一个不存在的文件时，即可使用您上传的“自定义404文件”代替之。要这么做，您只须使用 `Qiniu::RS.upload_file` 函数上传一个 `key` 为固定字符串类型的值 `errno-404` 即可。

除了使用 SDK 提供的方法，同样也可以借助七牛云存储提供的命令行辅助工具 [qboxrsctl](/v3/tools/qboxrsctl/) 达到同样的目的：

    qboxrsctl put <Bucket> <Key> <LocalFile>

将其中的 `<Key>` 换作  `errno-404` 即可。

注意，每个 `<Bucket>` 里边有且只有一个 `errno-404` 文件，上传多个，最后的那一个会覆盖前面所有的。


<a name="file-management"></a>

### 文件管理

文件管理包括对存储在七牛云存储上的文件进行查看、复制、移动和删除处理。

<a name="stat"></a>

#### 查看单个文件属性信息

    rs.stat(key, function(err, data) {
    	if (err) {
    		console.log("\n===> Stat result: ", err);
    		return;
    	}
    	console.log("\n===> Stat result: ", data);
	});

通过 SDK 提供的 rs.stat() 函数来查看单个文件的属性信息。

**参数**

key
: 资源ID

callback function
: 请求完成之后执行的回调函数

**返回值**

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

fsize
: 表示文件总大小，单位是 Byte

hash
: 文件的特征值，可以看做是基版本号

mimeType
: 文件的 mime-type

putTime
: 上传时间，单位是 百纳秒


<a name="copy"></a>

#### 复制单个文件

    rs.copy(sourceBucket, sourceKey, targetBucket, targetKey, function(err, data) {
    	if (err) {
    		console.log("Copy fail!");
    		return;
    	}
    	console.log("Copy success!");
	});

可以通过 SDK 提供的 rs.copy() 函数来进行文件复制操作。

**参数**

sourceBucket
: 必须，字符串类型（String），指定源空间。

sourceKey
: 必须，字符串类型（String），指定源文件。

targetBucket
: 必须，字符串类型（String），指定要复制到的目标空间。

targetKey
: 必须，字符串类型（String），指定要复制到目标空间的目标文件名。

**返回值**

如果复制失败，返回 `false`；否则返回 `true` 。


<a name="move"></a>

#### 移动单个文件

    rs.move(sourceBucket, sourceKey, targetBucket, targetKey, function(err, data) {
		if (err) {
    		console.log("Move fail!");
    		return;
    	}
    	console.log("Move success!");
	});

可以通过 SDK 提供的 rs.move() 函数来移动单个文件。

**参数**

sourceBucket
: 必须，字符串类型（String），指定源空间。

sourceKey
: 必须，字符串类型（String），指定源文件。

targetBucket
: 必须，字符串类型（String），指定要复制到的目标空间。

targetKey
: 必须，字符串类型（String），指定要复制到目标空间的目标文件名。

**返回值**

如果移动失败，返回 `false`；否则返回 `true` 。


<a name="delete"></a>

### 删除单个文件

    rs.remove(key, function(err, data) {
    	if (err) {
    		console.log("Remove fail!");
    		return;
    	}
    	console.log("Remove success!");
	});

通过 SDK 提供的 rs.remove() 函数来删除单个文件。

**参数**

key
: 必须，字符串类型（String），若把 Bucket 理解为关系型数据库的某个表，那么 key 类似数据库里边某个表的主键ID，需给每一个文件一个UUID用于进行标示。

**返回值**

如果删除成功，返回 `true`，否则返回 `false` 。

<a name="batch"></a>

### 批量操作

<a name="batch-get"></a>

#### 批量获取文件属性信息

    rs.batchGet(bucket, keys, function(err, data) {
    	if (err) {
    		console.log("\n===> Batch get error: ", err);
    		return;
    	}
    	console.log("\n===> Batch get result: ", data);
    });

rs.batchGet函数用于批量获取文件属性信息（含下载链接）的功能。

**参数**

bucket
: 必须，字符串类型（String），空间名称。

keys
: 必须，数组类型（Array），所要操作 `key` 的集合。

**返回值**

如果请求失败，返回 `false`，否则返回一个 `Array` 类型的结构，其中每个元素是一个 `Hash` 类型的结构。`Hash` 类型的值同 `rs.get()` 函数的返回值类似，只多出一个 `code` 字段，`code` 为 200 表示所有 keys 全部获取成功，`code` 若为 298 表示部分获取成功。

    [
        {
            "code" => 200,
            "data" => {
                "expires"  => 3600,
                "fsize"    => 3053,
                "hash"     => "Fu9lBSwQKbWNlBLActdx8-toAajv",
                "mimeType" => "application/x-ruby",
                "url"      => "http://iovip.qbox.me/file/<an-authorized-token>"
            }
        },
        ...
    ]


<a name="batch-copy"></a>

#### 批量复制文件

    rs.batchCopy(entries, function(err, data) {
    	if (err) {
    		console.log("Batch copy fail!");
    		return;
    	}
    	console.log("Batch copy success!");
    });
    
SDK 提供的 rs.batchCopy() 函数提供了进行批量复制的功能。

**参数**

entries
: 必须，进行批量复制的源bucket:key与目标bucket:key对。示例：

	entries = [
		["sourceBucket1", "sourceKey1", "destBucket1", "destKey1"],
		["sourceBucket2", "sourceKey2", "destBucket2", "destKey2"],
		["sourceBucket3", "sourceKey3", "destBucket3", "destKey3"],
		["sourceBucket4", "sourceKey4", "destBucket4", "destKey4"],
		["sourceBucket5", "sourceKey5", "destBucket5", "destKey5"],
		["sourceBucket6", "sourceKey6", "destBucket6", "destKey6"],
		["sourceBucket7", "sourceKey7", "destBucket7", "destKey7"],
	]

**返回值**

如果批量复制成功，返回 `true` ，否则为 `false` 。


<a name="batch-move"></a>

#### 批量移动文件

    rs.batchMove(entries, function(err, data) {
    	if (err) {
    		console.log("Batch move fail!");
    		return;
    	}
    	console.log("Batch move success!");
    });

**参数**

entries
: 必须，进行批量移动的源bucket:key与目标bucket:key对。示例：

	entries = [
		["sourceBucket1", "sourceKey1", "destBucket1", "destKey1"],
		["sourceBucket2", "sourceKey2", "destBucket2", "destKey2"],
		["sourceBucket3", "sourceKey3", "destBucket3", "destKey3"],
		["sourceBucket4", "sourceKey4", "destBucket4", "destKey4"],
		["sourceBucket5", "sourceKey5", "destBucket5", "destKey5"],
		["sourceBucket6", "sourceKey6", "destBucket6", "destKey6"],
		["sourceBucket7", "sourceKey7", "destBucket7", "destKey7"],
	]
	
**返回值**

如果批量移动成功，返回 `true` ，否则为 `false` 。


<a name="batch-delete"></a>

#### 批量删除文件

    rs.batchDelete(bucket, keys, function(err, data) {
    	if (err) {
    		console.log("Batch delete fail!");
    		return;
    	}
    	console.log("Batch delete success!");
    });

参数同 `rs.batchGet()` 的参数一样。

**返回值**

如果批量删除成功，返回 `true` ，否则为 `false` 。

<a name="Contributing"></a>

## 贡献代码

七牛云存储 Node.js SDK 源码地址：[https://github.com/qiniu/nodejs-sdk](https://github.com/qiniu/nodejs-sdk)

1. 登录 [github.com](https://github.com)
2. Fork [https://github.com/qiniu/nodejs-sdk](https://github.com/qiniu/nodejs-sdk)
3. 创建您的特性分支 (`git checkout -b my-new-feature`)
4. 提交您的改动 (`git commit -am 'Added some feature'`)
5. 将您的改动记录提交到远程 `git` 仓库 (`git push origin my-new-feature`)
6. 然后到 github 网站的该 `git` 远程仓库的 `my-new-feature` 分支下发起 Pull Request

<a name="License"></a>

## 许可证

Copyright (c) 2012-2013 qiniutek.com

基于 MIT 协议发布:

* [www.opensource.org/licenses/MIT](http://www.opensource.org/licenses/MIT)