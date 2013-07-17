---
title: Node.js SDK 使用指南
---

<sdk介绍\>

SDK 下载地址：[https://github.com/qiniu/nodejs-sdk](https://github.com/qiniu/nodejs-sdk)

**文档大纲**

- [概述](#overview)
- [准备开发环境](#prepare)
    - [环境依赖](#dependences)
	- [安装](#install)
	- [ACCESS_KEY 和 SECRET_KEY](#appkey)
- [使用SDK](#sdk-usage)
	- [初始化环境与清理](#init)
	- [上传文件](#io-put)
		- [上传流程](#io-put-flow)
			- [上传策略](#io-put-policy)
			- [上传凭证](#upload-token)
			- [PutExtra](#put-extra)
	- [下载文件](#io-get)
		- [下载公有文件](#io-get-public)
		- [下载私有文件](#io-get-private)
		- [HTTPS 支持](#io-https-get)
		- [断点续下载](#resumable-io-get)
	- [资源操作](#rs)
		- [获取文件信息](#rs-stat)
		- [删除文件](#rs-delete)
		- [复制/移动文件](#rs-copy-move)
		- [批量操作](#rs-batch)
	- [云处理](#fop)

<a name="overview"></a>
## 概述

<sdk基本介绍\>
该 SDK 适用于 Node.js 0.4.7 及其以上版本，基于 七牛云存储官方API 构建。
若您的服务端是一个基于 Node.js 编写的网络程序，使用此 SDK ，
能让您以非常便捷地方式将数据安全地存储到七牛云存储上。
以便让您应用的终端用户进行高速上传和下载，同时也使得您的服务端更加轻盈。

<sdk内容构成\>
Node.js SDK 主要包含对七牛云存储API的包装，遵循[qiniu sdkspec](https://github.com/qiniu/sdkspec)
涉及到以下几个方面：

- 服务端操作，生成上传授权(uptoken)，私有bucket下载URL(downloadUrl)，文件操作授权
- 客户端操作，上传文件(qiniu/io.js)
- 文件管理(qiniu/rs.js)
- 数据处理(qiniu/fop.js)
- 公共库(qiniu/rpc.js, qiniu/util.js)

<a name="prepare"></a>

## 准备开发环境

<a开发环境准备说明\>

<a name="dependences"></a>

### 环境依赖
<sdk环境依赖\>
适用于 Node.js 0.4.7 及其以上版本

<a name="install"></a>

### 安装

<sdk安装说明\>
通过 npm 以 node 模块化的方式安装：  
`npm node qiniu`

<a name="appkey"></a>

### ACCESS_KEY 和 SECRET_KEY

在使用SDK 前，您需要拥有一对有效的 AccessKey 和 SecretKey 用来进行签名授权。

可以通过如下步骤获得：

1. [开通七牛开发者帐号](https://dev.qiniutek.com/signup)
2. [登录七牛开发者自助平台，查看 AccessKey 和 SecretKey](https://dev.qiniutek.com/account/keys) 。

<a name="sdk-usage"></a>

## 使用SDK

<a name="init"></a>

### 初始化环境

对于服务端而言，常规程序流程是：

```{javascript}
@gist(gist/server.js#init)
```

*服务端操作时请务必初始化这两个变量*

<a name="io-put"></a>

### 上传文件

为了尽可能地改善终端用户的上传体验，七牛云存储首创了客户端直传功能。一般云存储的上传流程是：

    客户端（终端用户） => 业务服务器 => 云存储服务

这样多了一次上传的流程，和本地存储相比，会相对慢一些。但七牛引入了客户端直传，将整个上传过程调整为：

    客户端（终端用户） => 七牛 => 业务服务器

客户端（终端用户）直接上传到七牛的服务器，通过DNS智能解析，七牛会选择到离终端用户最近的ISP服务商节点，速度会比本地存储快很多。文件上传成功以后，七牛的服务器使用回调功能，只需要将非常少的数据（比如Key）传给应用服务器，应用服务器进行保存即可。

<a name="io-put-flow"></a>

#### 上传流程

在七牛云存储中，整个上传流程大体分为这样几步：

1. 业务服务器颁发 [uptoken（上传授权凭证）](http://docs.qiniu.com/api/put.html#uploadToken)给客户端（终端用户）
2. 客户端凭借 [uptoken](http://docs.qiniu.com/api/put.html#uploadToken) 上传文件到七牛
3. 在七牛获得完整数据后，发起一个 HTTP 请求回调到业务服务器
4. 业务服务器保存相关信息，并返回一些信息给七牛
5. 七牛原封不动地将这些信息转发给客户端（终端用户）

需要注意的是，回调到业务服务器的过程是可选的，它取决于业务服务器颁发的 [uptoken](http://docs.qiniu.com/api/put.html#uploadToken)。如果没有回调，七牛会返回一些标准的信息（比如文件的 hash）给客户端。如果上传发生在业务服务器，以上流程可以自然简化为：

1. 业务服务器生成 uptoken（不设置回调，自己回调到自己这里没有意义）
2. 凭借 [uptoken](http://docs.qiniu.com/api/put.html#uploadToken) 上传文件到七牛
3. 善后工作，比如保存相关的一些信息

<a name="io-put-policy"></a>

##### 上传策略

[uptoken](http://docs.qiniu.com/api/put.html#uploadToken) 实际上是用 AccessKey/SecretKey 进行数字签名的上传策略(`rs.PutPolicy`)，它控制则整个上传流程的行为。让我们快速过一遍你都能够决策啥：

```{javascript}
@gist(../qiniu/rs.js#PutPolicy)
```

* `scope` 限定客户端的权限。如果 `scope` 是 bucket，则客户端只能新增文件到指定的 bucket，不能修改文件。如果 `scope` 为 bucket:key，则客户端可以修改指定的文件。
* `callbackUrl` 设定业务服务器的回调地址，这样业务服务器才能感知到上传行为的发生。
* `callbackBody` 设定业务服务器的回调信息。文件上传成功后，七牛向业务服务器的callbackUrl发送的POST请求携带的数据。支持 [魔法变量](http://docs.qiniu.com/api/put.html#MagicVariables) 和 [自定义变量](http://docs.qiniu.com/api/put.html#xVariables)。
* `returnUrl` 设置用于浏览器端文件上传成功后，浏览器执行301跳转的URL，一般为 HTML Form 上传时使用。文件上传成功后浏览器会自动跳转到 `returnUrl?upload_ret=returnBody`。
* `returnBody` 可调整返回给客户端的数据包，支持 [魔法变量](http://docs.qiniu.com/api/put.html#MagicVariables) 和 [自定义变量](http://docs.qiniu.com/api/put.html#xVariables)。`returnBody` 只在没有 `callbackUrl` 时有效（否则直接返回 `callbackUrl` 返回的结果）。不同情形下默认返回的 `returnBody` 并不相同。在一般情况下返回的是文件内容的 `hash`，也就是下载该文件时的 `etag`；但指定 `returnUrl` 时默认的 `returnBody` 会带上更多的信息。
* `asyncOps` 可指定上传完成后，需要自动执行哪些数据处理。这是因为有些数据处理操作（比如音视频转码）比较慢，如果不进行预转可能第一次访问的时候效果不理想，预转可以很大程度改善这一点。
* `expires`指定`uptoken`的过期时间，默认3600s

关于上传策略更完整的说明，请参考 [uptoken](http://docs.qiniu.com/api/put.html#uploadToken)。

<a name="upload-token"></a>

##### 生成上传凭证

服务端生成 [uptoken](http://docs.qiniu.com/api/put.html#uploadToken) 代码如下：

```{javascript}
@gist(gist/server.js#uptoken)
```

<a name="put-extra"></a>

##### PutExtra

<PutExtra说明\>

<a name="upload-do"></a>
PutExtra是上传时的可选信息，默认为null

```{javascript}
@gist(../qiniu/io.js#PutExtra)
```

* `params` 是一个字典。[自定义变量](http://docs.qiniu.com/api/put.html#xVariables)，key必须以 x: 开头命名，不限个数。可以在 uploadToken 的 callbackBody 选项中求值。
* `mime_type` 表示数据的MimeType，当不指定时七牛服务器会自动检测。
* `crc32` 待检查的crc32值
* `check_crc` 可选值为0, 1, 2。 
    `check_crc == 0`: 表示不进行 crc32 校验。
	`check_crc == 1`: 上传二进制数据时等同于 `check_crc=2`；上传本地文件时会自动计算 crc32 值。
	`check_crc == 2`: 表示进行 crc32 校验，且 crc32 值就是上面的 `crc32` 变量

##### 上传文件

上传文件到七牛（通常是客户端完成，但也可以发生在服务端）：

直接上传二进制流：

```{javascript}
@gist(gist/client.js#uploadBuf)
```

上传本地文件：

```{javascript}
@gist(gist/client.js#uploadFile)
```

<a name="io-get"></a>

#### 下载文件

<a name="io-get-public"></a>

##### 下载公有文件

每个 bucket 都会绑定一个或多个域名（domain）。如果这个 bucket 是公开的，那么该 bucket 中的所有文件可以通过一个公开的下载 url 可以访问到：

    http://<domain>/<key>

假设某个 bucket 既绑定了七牛的二级域名，如 hello.qiniudn.com，也绑定了自定义域名（需要备案），如 hello.com。那么该 bucket 中 key 为 a/b/c.htm 的文件可以通过 http://hello.qiniudn.com/a/b/c.htm 或 http://hello.com/a/b/c.htm 中任意一个 url 进行访问。

<a name="io-get-private"></a>

##### 下载私有文件

如果某个 bucket 是私有的，那么这个 bucket 中的所有文件只能通过一个的临时有效的 downloadUrl 访问：

    http://<domain>/<key>?e=<deadline>&token=<dntoken>

其中 dntoken 是由业务服务器签发的一个[临时下载授权凭证](http://docs.qiniu.com/api/get.html#download-token)，deadline 是 dntoken 的有效期。dntoken不需要单独生成，SDK 提供了生成完整 downloadUrl 的方法（包含了 dntoken），示例代码如下：

```{javascript}
@gist(gist/server.js#downloadUrl)
```

生成 downloadUrl 后，服务端下发 downloadUrl 给客户端。客户端收到 downloadUrl 后，和公有资源类似，直接用任意的 HTTP 客户端就可以下载该资源了。唯一需要注意的是，在 downloadUrl 失效却还没有完成下载时，需要重新向服务器申请授权。

无论公有资源还是私有资源，下载过程中客户端并不需要七牛 SDK 参与其中。

<a name="resumable-io-get"></a>

##### 断点续下载

无论是公有资源还是私有资源，获得的下载 url 支持标准的 HTTP 断点续传协议。考虑到多数语言都有相应的断点续下载支持的成熟方法，七牛 Nodejs-SDK 并不提供断点续下载相关代码。

<a name="rs"></a>

### 资源操作

资源操作限在服务端操作，先进行初始化

```{javascript}
@gist(gist/rs.js#init)
```

<a name="rs-stat"></a>

#### 获取文件信息

<a获取文件信息说明\>

```{javascript}
@gist(gist/rs.js#stat)
```

<a name="rs-delete"></a>

#### 删除文件

```{javascript}
@gist(gist/rs.js#remove)
```

<a name="rs-copy-move"></a>

#### 复制/移动文件

```{javascript}
@gist(gist/rs.js#copy)
```

```{javascript}
@gist(gist/rs.js#move)
```

<a name="rs-batch"></a>

#### 批量操作

当您需要一次性进行多个操作时, 可以使用批量操作。

#### 批量获取文件信息

```{javascript}
@gist(gist/rs.js#batchStat)
```

#### 批量复制文件

```{javascript}
@gist(gist/rs.js#batchCopy)
```

#### 批量移动文件

```{javascript}
@gist(gist/rs.js#batchMove)
```

#### 批量删除文件

```{javascript}
@gist(gist/rs.js#batchDelete)
```

<a name="adv-file-handle"></a>

### 高级管理操作

<a高级管理操作\>
#### 列出文件
请求某个存储空间（bucket）下的文件列表，如果有前缀，可以按前缀（prefix）进行过滤；第一次调用时置marker为null，之后的调用填上服务器返回的marker(如果有)，则列出刚刚为列完的文件

```{javascript}
@gist(gist/rsf.js#listPrefix)
```

<a name="fop"></a>

### 云处理

<a云处理使用说明\>
#### 查看图像信息

```{javascript}
@gist(gist/fop.js#makeImageInfoUrl)
```

#### 查看图像Exif

```{javascript}
@gist(gist/fop.js#makeExifUrl)
```

#### 生成缩略图

```{javascript}
@gist(gist/fop.js#makeImageViewUrl)
```

## 贡献代码

+ Fork
+ 创建您的特性分支 (git checkout -b my-new-feature)
+ 提交您的改动 (git commit -am 'Added some feature')
+ 将您的修改记录提交到远程 git 仓库 (git push origin my-new-feature)
+ 然后到 github 网站的该 git 远程仓库的 my-new-feature 分支下发起 Pull Request

## 许可证

> Copyright (c) 2013 qiniu.com

## 基于 MIT 协议发布:

> [www.opensource.org/licenses/MIT](http://www.opensource.org/licenses/MIT)
