<a id="intro"></a>
# 简介

此 SDK 适用于 Node.js v4 及以上版本。使用此 SDK 构建您的网络应用程序，能让您以非常便捷的方式将数据安全地存储到七牛云上。无论您的网络应用是一个网站程序，还是包括从云端（服务端程序）到终端（手持设备应用）的架构服务和应用，通过七牛云及其 SDK，都能让您应用程序的终端用户高速上传和下载，同时也让您的服务端更加轻盈。

Node.js SDK 属于七牛服务端SDK之一，主要有如下功能：

1. 提供生成客户端上传所需的上传凭证的功能
2. 提供文件从服务端直接上传七牛的功能
3. 提供对七牛空间中文件进行管理的功能
4. 提供对七牛空间中文件进行处理的功能
5. 提供七牛CDN相关的刷新，预取，日志功能

<a id="opensource"></a>
# 开源

- [Node.js SDK 项目地址](https://github.com/qiniu/nodejs-sdk)
- [Node.js SDK 发布地址](https://github.com/qiniu/nodejs-sdk/releases)
- [Node.js SDK 历史文档](/kodo/sdk/nodejs-sdk-6)

<a id="install"></a>
# 安装

推荐使用`npm`来安装：

```
$ npm install qiniu
```

<a id="api-auth"></a>
# 鉴权

七牛 Node.js SDK 的所有的功能，都需要合法的授权。授权凭证的签算需要七牛账号下的一对有效的`Access Key`和`Secret Key`，这对密钥可以通过如下步骤获得：

1. 点击[注册🔗](https://portal.qiniu.com/signup)开通七牛开发者帐号
2. 如果已有账号，直接登录七牛开发者后台，点击[这里🔗](https://portal.qiniu.com/user/key)查看 Access Key 和 Secret Key

<a id="io-put"></a>
# 文件上传
- <a href="#upload-flow">上传流程</a>
- <a href="#upload-token">客户端上传凭证</a>
     - <a href="#simple-uptoken">简单上传凭证</a>
     - <a href="#overwrite-uptoken">覆盖上传凭证</a>
     - <a href="#returnbody-uptoken">自定义上传回复凭证</a>
     - <a href="#callback-uptoken">带回调业务服务器的凭证</a>
     - <a href="#pfop-uptoken">带数据处理的凭证</a>
     - <a href="#param-uptoken">带自定义参数的凭证</a>
     - <a href="#general-uptoken">综合上传凭证</a>
- <a href="#server-upload">服务器直传</a>
  - <a href="#upload-config">构建配置类</a>
  - <a href="#form-upload-file">文件上传（表单方式）</a>
  - <a href="#form-upload-bytes">字节数组上传（表单方式）</a>
  - <a href="#form-upload-stream">数据流上传（表单方式）</a>
  - <a href="#resume-upload-file">文件分片上传（断点续传）</a>
  - <a href="#upload-result-parse">解析自定义回复内容</a>
  - <a href="#upload-callback-verify">业务服务器验证七牛回调</a>

<a id="upload-flow"></a>
### 上传流程

七牛文件上传分为客户端上传（主要是指网页端和移动端等面向终端用户的场景）和服务端上传两种场景，具体可以参考文档[七牛业务流程](/kodo/manual/programming-model)。

服务端SDK在上传方面主要提供两种功能，一种是生成客户端上传所需要的上传凭证，另外一种是直接上传文件到云端。

<a id="upload-token"></a>
### 客户端上传凭证

客户端（移动端或者Web端）上传文件的时候，需要从客户自己的业务服务器获取上传凭证，而这些上传凭证是通过服务端的SDK来生成的，然后通过客户自己的业务API分发给客户端使用。根据上传的业务需求不同，七牛云Java SDK支持丰富的上传凭证生成方式。

创建各种上传凭证之前，我们需要定义好其中鉴权对象`mac`：

```
var accessKey = 'your access key';
var secretKey = 'your secret key';
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
```

<a id="simple-uptoken"></a>

#### 简单上传的凭证

最简单的上传凭证只需要`AccessKey`，`SecretKey`和`Bucket`就可以。

```
var options = {
  scope: bucket,
};
var putPolicy = new qiniu.rs.PutPolicy(options);
var uploadToken=putPolicy.uploadToken(mac);
```

默认情况下，在不指定上传凭证的有效时间情况下，默认有效期为1个小时。也可以自行指定上传凭证的有效期，例如：

```
//自定义凭证有效期（示例2小时，expires单位为秒，为上传凭证的有效时间）
var options = {
  scope: bucket,
  expires: 7200
};
var putPolicy = new qiniu.rs.PutPolicy(options);
var uploadToken=putPolicy.uploadToken(mac);
```

<a id="overwrite-uptoken"></a>
#### 覆盖上传的凭证

覆盖上传除了需要`简单上传`所需要的信息之外，还需要想进行覆盖的文件名称，这个文件名称同时可是客户端上传代码中指定的文件名，两者必须一致。

```
var keyToOverwrite = 'qiniu.mp4';
var options = {
  scope: bucket + ":" + keyToOverwrite
}
var putPolicy = new qiniu.rs.PutPolicy(options);
var uploadToken=putPolicy.uploadToken(mac);
```

<a id="returnbody-uptoken"></a>
#### 自定义上传回复的凭证

默认情况下，文件上传到七牛之后，在没有设置`returnBody`或者`回调`相关的参数情况下，七牛返回给上传端的回复格式为`hash`和`key`，例如：

```
{"hash":"Ftgm-CkWePC9fzMBTRNmPMhGBcSV","key":"qiniu.jpg"}
```

有时候我们希望能自定义这个返回的JSON格式的内容，可以通过设置`returnBody`参数来实现，在`returnBody`中，我们可以使用七牛支持的[魔法变量](/kodo/manual/vars#magicvar)和[自定义变量](/kodo/manual/vars#xvar)。

```
var options = {
  scope: bucket,
  returnBody: '{"key":"$(key)","hash":"$(etag)","fsize":$(fsize),"bucket":"$(bucket)","name":"$(x:name)"}'
}
var putPolicy = new qiniu.rs.PutPolicy(options);
var uploadToken=putPolicy.uploadToken(mac);
```

则文件上传到七牛之后，收到的回复内容如下：

```
{"key":"qiniu.jpg","hash":"Ftgm-CkWePC9fzMBTRNmPMhGBcSV","bucket":"if-bc","fsize":39335,"name":"qiniu"}
```

<a id="callback-uptoken"></a>
#### 带回调业务服务器的凭证

上面生成的`自定义上传回复`的上传凭证适用于上传端（无论是客户端还是服务端）和七牛服务器之间进行直接交互的情况下。在客户端上传的场景之下，有时候客户端需要在文件上传到七牛之后，从业务服务器获取相关的信息，这个时候就要用到七牛的上传回调及相关回调参数的设置。

```
var options = {
  scope: bucket,
  callbackUrl: 'http://api.example.com/qiniu/upload/callback',
  callbackBody: '{"key":"$(key)","hash":"$(etag)","fsize":$(fsize),"bucket":"$(bucket)","name":"$(x:name)"}',
  callbackBodyType: 'application/json'
}
var putPolicy = new qiniu.rs.PutPolicy(options);
var uploadToken=putPolicy.uploadToken(mac);
```

在使用了上传回调的情况下，客户端收到的回复就是业务服务器响应七牛的JSON格式内容。
通常情况下，我们建议使用`application/json`格式来设置`callbackBody`，保持数据格式的统一性。实际情况下，`callbackBody`也支持`application/x-www-form-urlencoded`格式来组织内容，这个主要看业务服务器在接收到`callbackBody`的内容时如果解析。例如：

```
var options = {
  scope: bucket,
  callbackUrl: 'http://api.example.com/qiniu/upload/callback',
  callbackBody: 'key=$(key)&hash=$(etag)&bucket=$(bucket)&fsize=$(fsize)&name=$(x:name)'
}
var putPolicy = new qiniu.rs.PutPolicy(options);
var uploadToken=putPolicy.uploadToken(mac);
```

<a id="pfop-uptoken"></a>
#### 带数据处理的凭证

七牛支持在文件上传到七牛之后，立即对其进行多种指令的数据处理，这个只需要在生成的上传凭证中指定相关的处理参数即可。

```
var saveMp4Entry = qiniu.util.urlsafeBase64Encode(bucket + ":avthumb_test_target.mp4");
var saveJpgEntry = qiniu.util.urlsafeBase64Encode(bucket + ":vframe_test_target.jpg");
//数据处理指令，支持多个指令
var avthumbMp4Fop = "avthumb/mp4|saveas/" + saveMp4Entry;
var vframeJpgFop = "vframe/jpg/offset/1|saveas/" + saveJpgEntry;
var options = {
  scope: bucket,
  //将多个数据处理指令拼接起来
  persistentOps: avthumbMp4Fop + ";" + vframeJpgFop,
  //数据处理队列名称，必填
  persistentPipeline: "video-pipe",
  //数据处理完成结果通知地址
  persistentNotifyUrl: "http://api.example.com/qiniu/pfop/notify",
}
var putPolicy = new qiniu.rs.PutPolicy(options);
var uploadToken=putPolicy.uploadToken(mac);
```

队列 pipeline 请参阅[创建私有队列](https://portal.qiniu.com/dora/create-mps)；转码操作具体参数请参阅[音视频转码](/dora/api/audio-and-video-transcoding-avthumb)；saveas 请参阅[处理结果另存](/dora/api/processing-results-save-saveas)。

<a id="param-uptoken"></a>
#### 带自定义参数的凭证

七牛支持客户端上传文件的时候定义一些自定义参数，这些参数可以在`returnBody`和`callbackBody`里面和七牛内置支持的魔法变量（即系统变量）通过相同的方式来引用。这些自定义的参数名称必须以`x:`开头。例如客户端上传的时候指定了自定义的参数`x:name`和`x:age`分别是`string`和`int`类型。那么可以通过下面的方式引用：

```
var options = {
  //其他上传策略参数...
  returnBody: '{"key":"$(key)","hash":"$(etag)","fsize":$(fsize),"bucket":"$(bucket)","name":"$(x:name)","age":$(x:age)}'
}
```

或者

```
var options = {
  //其他上传策略参数...
  callbackBody: '{"key":"$(key)","hash":"$(etag)","fsize":$(fsize),"bucket":"$(bucket)","name":"$(x:name)","age":$(x:age)}',
}
```

<a id="general-uptoken"></a>
#### 综合上传凭证

上面的生成上传凭证的方法，都是通过设置[上传策略🔗](/kodo/manual/put-policy)相关的参数来支持的，这些参数可以通过不同的组合方式来满足不同的业务需求，可以灵活地组织你所需要的上传凭证。

<a id="server-upload"></a>
### 服务端直传

服务端直传是指客户利用七牛服务端SDK从服务端直接上传文件到七牛云，交互的双方一般都在机房里面，所以服务端可以自己生成上传凭证，然后利用SDK中的上传逻辑进行上传，最后从七牛云获取上传的结果，这个过程中由于双方都是业务服务器，所以很少利用到上传回调的功能，而是直接自定义`returnBody`来获取自定义的回复内容。

<a id="upload-config"></a>
#### 构建配置类

七牛存储支持空间创建在不同的机房，在使用七牛的 Node.js SDK 中的`FormUploader`和`ResumeUploader`上传文件之前，必须要构建一个上传用的`config`对象，在该对象中，可以指定空间对应的`zone`以及其他的一些影响上传的参数。

```
var config = new qiniu.conf.Config();
// 空间对应的机房
config.zone = qiniu.zone.Zone_z0;
// 是否使用https域名
//config.useHttpsDomain = true;
// 上传是否使用cdn加速
//config.useCdnDomain = true;
```


其中关于`Zone`对象和机房的关系如下：

| 机房  |Zone对象|
|-----|-----|
| 华东  |`qiniu.zone.Zone_z0`|
| 华东2 |`qiniu.zone.Zone_cn_east_2`|
| 华北  |`qiniu.zone.Zone_z1`|
| 华南  |`qiniu.zone.Zone_z2`|
| 北美  |`qiniu.zone.Zone_na0`|

<a id="form-upload-file"></a>
#### 文件上传（表单方式）
最简单的就是上传本地文件，直接指定文件的完整路径即可上传。

```
var localFile = "/Users/jemy/Documents/qiniu.mp4";
var formUploader = new qiniu.form_up.FormUploader(config);
var putExtra = new qiniu.form_up.PutExtra();
var key='test.mp4';
// 文件上传
formUploader.putFile(uploadToken, key, localFile, putExtra, function(respErr,
  respBody, respInfo) {
  if (respErr) {
    throw respErr;
  }

  if (respInfo.statusCode == 200) {
    console.log(respBody);
  } else {
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
```

<a id="form-upload-bytes"></a>
#### 字节数组上传（表单方式）
可以支持将内存中的字节数组上传到空间中。

```
var formUploader = new qiniu.form_up.FormUploader(config);
var putExtra = new qiniu.form_up.PutExtra();
var key='test.txt';
formUploader.put(uploadToken, key, "hello world", putExtra, function(respErr,
  respBody, respInfo) {
  if (respErr) {
    throw respErr;
  }

  if (respInfo.statusCode == 200) {
    console.log(respBody);
  } else {
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
```

<a id="form-upload-stream"></a>
#### 数据流上传（表单方式）
这里演示的是`ReadableStream`对象的上传。

```
var formUploader = new qiniu.form_up.FormUploader(config);
var putExtra = new qiniu.form_up.PutExtra();
var readableStream = xxx; // 可读的流
formUploader.putStream(uploadToken, key, readableStream, putExtra, function(respErr,
  respBody, respInfo) {
  if (respErr) {
    throw respErr;
  }

  if (respInfo.statusCode == 200) {
    console.log(respBody);
  } else {
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
```

<a id="resume-upload-file"></a>
#### 文件分片上传（断点续传）

```
var localFile = "/Users/jemy/Documents/qiniu.mp4";
var resumeUploader = new qiniu.resume_up.ResumeUploader(config);
var putExtra = new qiniu.resume_up.PutExtra();
// 扩展参数
putExtra.params = {
  "x:name": "",
  "x:age": 27,
}
putExtra.fname = 'testfile.mp4';

// 如果指定了断点记录文件，那么下次会从指定的该文件尝试读取上次上传的进度，以实现断点续传
putExtra.resumeRecordFile = 'progress.log';
var key = null;
// 文件分片上传
resumeUploader.putFile(uploadToken, key, localFile, putExtra, function(respErr,
  respBody, respInfo) {
  if (respErr) {
    throw respErr;
  }

  if (respInfo.statusCode == 200) {
    console.log(respBody);
  } else {
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
```

<a id="upload-result-parse"></a>
### 解析自定义回复内容
有些情况下，七牛返回给上传端的内容不是默认的`hash`和`key`形式，这种情况下，可能出现在自定义`returnBody`或者自定义了`callbackBody`的情况下，前者一般是服务端直传的场景，而后者则是接受上传回调的场景，这两种场景之下，都涉及到需要将自定义的回复进行内容解析，一般建议在交互过程中，都采用`JSON`的方式，这样处理起来方法比较一致，而且`JSON`的方法最通用，在 Node.js 里面处理JSON的回复相当地方便，基本上了解回复结构就可以处理，这里不再赘述。

<a id="upload-callback-verify"></a>
### 业务服务器验证七牛回调

在上传策略里面设置了上传回调相关参数的时候，七牛在文件上传到服务器之后，会主动地向`callbackUrl`发送POST请求的回调，回调的内容为`callbackBody`模版所定义的内容，如果这个模版里面引用了[魔法变量](/kodo/manual/vars#magicvar)或者[自定义变量](/kodo/manual/vars#xvar)，那么这些变量会被自动填充对应的值，然后在发送给业务服务器。

业务服务器在收到来自七牛的回调请求的时候，可以根据请求头部的`Authorization`字段来进行验证，查看该请求是否是来自七牛的未经篡改的请求。

Node.js SDK中提供了一个方法`qiniu.util.isQiniuCallback`来校验该头部是否合法：

```
// 校验七牛上传回调的Authorization
// @param mac           AK&SK对象
// @param requestURI   回调的URL中的requestURI
// @param reqBody      请求Body，仅当请求的ContentType为
//                     application/x-www-form-urlencoded时才需要传入该参数
// @param callbackAuth 回调时请求的Authorization头部值
exports.isQiniuCallback = function(mac, requestURI, reqBody, callbackAuth) {
  var auth = exports.generateAccessToken(mac, requestURI, reqBody);
  return auth === callbackAuth;
}
```


<a id="io-get"></a>
# 下载文件

 - <a href="#public-get">公开空间</a>
 - <a href="#private-get">私有空间</a>

文件下载分为公开空间的文件下载和私有空间的文件下载。

<a id="public-get"></a>
### 公开空间
对于公开空间，其访问的链接主要是将空间绑定的域名（可以是七牛空间的默认域名或者是绑定的自定义域名）拼接上空间里面的文件名即可访问，标准情况下需要在拼接链接之前，将文件名进行`urlencode`以兼容不同的字符。

```
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var config = new qiniu.conf.Config();
var bucketManager = new qiniu.rs.BucketManager(mac, config);
var publicBucketDomain = 'http://if-pbl.qiniudn.com';

// 公开空间访问链接
var publicDownloadUrl = bucketManager.publicDownloadUrl(publicBucketDomain, key);
console.log(publicDownloadUrl);
```

<a id="private-get"></a>
### 私有空间
对于私有空间，首先需要按照公开空间的文件访问方式构建对应的公开空间访问链接，然后再对这个链接进行私有授权签名。

```
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var config = new qiniu.conf.Config();
var bucketManager = new qiniu.rs.BucketManager(mac, config);
var privateBucketDomain = 'http://if-pri.qiniudn.com';
var deadline = parseInt(Date.now() / 1000) + 3600; // 1小时过期
var privateDownloadUrl = bucketManager.privateDownloadUrl(privateBucketDomain, key, deadline);
```

<a id="rs"></a>
# 资源管理

资源管理包括的主要功能有：

- <a href="#rs-stat">获取文件信息</a>
- <a href="#rs-chgm">修改文件MimeType</a>
- <a href="#rs-chtype">修改文件存储类型</a>
- <a href="#rs-move">移动或重命名文件</a>
- <a href="#rs-copy">复制文件副本</a>
- <a href="#rs-delete">删除空间中的文件</a>
- <a href="#rs-delete-after-days">设置或更新文件生存时间</a>
- <a href="#rs-list">获取指定前缀文件列表</a>
- <a href="#rs-fetch">抓取网络资源到空间</a>
- <a href="#rs-prefetch">更新镜像存储空间中文件内容</a>
- <a href="#rs-batch">资源管理批量操作</a>
    - <a href="#rs-batch-stat">批量获取文件信息</a>
    - <a href="#rs-batch-chgm">批量修改文件类型</a>
    - <a href="#rs-batch-delete">批量删除文件</a>
    - <a href="#rs-batch-copy">批量复制文件</a>
    - <a href="#rs-batch-move">批量移动或重命名文件</a>
    - <a href="#rs-batch-deleteAfterDays">批量更新文件的有效期</a>
    - <a href="#rs-batch-type">批量更新文件存储类型</a>

资源管理相关的操作首先要构建`BucketManager`对象：

```
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var config = new qiniu.conf.Config();
//config.useHttpsDomain = true;
config.zone = qiniu.zone.Zone_z0;
var bucketManager = new qiniu.rs.BucketManager(mac, config);
```

<a id="rs-stat"></a>
## 获取文件信息

```
var bucket = "if-pbl";
var key = "qiniux.mp4";

bucketManager.stat(bucket, key, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    if (respInfo.statusCode == 200) {
      console.log(respBody.hash);
      console.log(respBody.fsize);
      console.log(respBody.mimeType);
      console.log(respBody.putTime);
      console.log(respBody.type);
    } else {
      console.log(respInfo.statusCode);
      console.log(respBody.error);
    }
  }
});
```

<a id="rs-chgm"></a>
## 修改文件MimeType

```
var bucket = 'if-pbl';
var key = 'qiniu.mp4';
var newMime = 'video/x-mp4';

bucketManager.changeMime(bucket, key, newMime, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    //200 is success
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
```

<a id="rs-chgm-h"></a>
## 修改文件Headers

```
var bucket = 'if-pbl';
var key = 'qiniu.mp4';
var headers = {
  'Content-Type': 'application/octet-stream',
  'Last-Modified': 'Web, 21 Oct 2015 07:00:00 GMT',
  'x-custom-header-xx': 'value',
};

bucketManager.changeHeaders(bucket, key, headers, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    //200 is success
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
```

<a id="rs-chtype"></a>
## 修改文件存储类型

```
var bucket = 'if-pbl';
var key = 'qiniu.mp4';
//newType=0表示普通存储，newType为1表示低频存储
var newType = 0;

bucketManager.changeType(bucket, key, newType, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    //200 is success
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
```

<a id="rs-move"></a>
## 移动或重命名文件

移动操作本身支持移动文件到相同，不同空间中，在移动的同时也可以支持文件重命名。唯一的限制条件是，移动的源空间和目标空间必须在同一个机房。

|源空间|目标空间|源文件名|目标文件名|描述|
|------|------|------|--------|------|
|BucketA|BucketA|KeyA|KeyB|相当于同空间文件重命名|
|BucketA|BucketB|KeyA|KeyA|移动文件到BucketB，文件名一致|
|BucketA|BucketB|KeyA|KeyB|移动文件到BucketB，文件名变成KeyB|

`move`操作支持强制覆盖选项，即如果目标文件已存在，可以设置强制覆盖选项`force`来覆盖那个文件的内容。

```
var srcBucket = "if-pbl";
var srcKey = "qiniu.mp4";
var destBucket = "if-pbl";
var destKey = "qiniu_new.mp4";
// 强制覆盖已有同名文件
var options = {
  force: true
}
bucketManager.move(srcBucket, srcKey, destBucket, destKey, options, function(
  err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    //200 is success
    console.log(respInfo.statusCode);
  }
});
```

<a id="rs-copy"></a>
## 复制文件副本
文件的复制和文件移动其实操作一样，主要的区别是移动后源文件不存在了，而复制的结果是源文件还存在，只是多了一个新的文件副本。

```
var srcBucket = "if-pbl";
var srcKey = "qiniu.mp4";
var destBucket = "if-pbl";
var destKey = "qiniu_new_copy.mp4";
// 强制覆盖已有同名文件
var options = {
  force: true
}

bucketManager.copy(srcBucket, srcKey, destBucket, destKey, options, function(
  err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    //200 is success
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
```

<a id="rs-delete"></a>
## 删除空间中的文件

```
var bucket = "if-pbl";
var key = "qiniu_new_copy.mp4";

bucketManager.delete(bucket, key, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
```


<a id="rs-delete-after-days"></a>
## 设置或更新文件的生存时间
可以给已经存在于空间中的文件设置文件生存时间，或者更新已设置了生存时间但尚未被删除的文件的新的生存时间。

```
var bucket = "if-pbl";
var key = "qiniu_new_copy.mp4";
var days = 10;

bucketManager.deleteAfterDays(bucket, key, days, function(err, respBody,
  respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
```

<a id="rs-list"></a>
## 获取指定前缀的文件列表

```
var bucket = 'if-pbl';
// @param options 列举操作的可选参数
//                prefix    列举的文件前缀
//                marker    上一次列举返回的位置标记，作为本次列举的起点信息
//                limit     每次返回的最大列举文件数量
//                delimiter 指定目录分隔符
var options = {
  limit: 10,
  prefix: 'images/',
};

bucketManager.listPrefix(bucket, options, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    throw err;
  }

  if (respInfo.statusCode == 200) {
    //如果这个nextMarker不为空，那么还有未列举完毕的文件列表，下次调用listPrefix的时候，
    //指定options里面的marker为这个值
    var nextMarker = respBody.marker;
    var commonPrefixes = respBody.commonPrefixes;
    console.log(nextMarker);
    console.log(commonPrefixes);
    var items = respBody.items;
    items.forEach(function(item) {
      console.log(item.key);
      // console.log(item.putTime);
      // console.log(item.hash);
      // console.log(item.fsize);
      // console.log(item.mimeType);
      // console.log(item.endUser);
      // console.log(item.type);
    });
  } else {
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
```


<a id="rs-fetch"></a>
## 抓取网络资源到空间

```
var resUrl = 'http://devtools.qiniu.com/qiniu.png';
var bucket = "if-bc";
var key = "qiniu.png";

bucketManager.fetch(resUrl, bucket, key, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    if (respInfo.statusCode == 200) {
      console.log(respBody.key);
      console.log(respBody.hash);
      console.log(respBody.fsize);
      console.log(respBody.mimeType);
    } else {
      console.log(respInfo.statusCode);
      console.log(respBody);
    }
  }
});
```

<a id="rs-prefetch"></a>
## 更新镜像空间中存储的文件内容

```
var bucket = "if-pbl";
var key = "qiniu.mp4";

bucketManager.prefetch(bucket, key, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    //200 is success
    console.log(respInfo.statusCode);
  }
});
```

<a id="rs-batch"></a>
## 资源管理批量操作

<a id="rs-batch-stat"></a>
### 批量获取文件信息

```
//每个operations的数量不可以超过1000个，如果总数量超过1000，需要分批发送
var statOperations = [
  qiniu.rs.statOp(srcBucket, 'qiniu1.mp4'),
  qiniu.rs.statOp(srcBucket, 'qiniu2.mp4'),
  qiniu.rs.statOp(srcBucket, 'qiniu3.mp4'),
  qiniu.rs.statOp(srcBucket, 'qiniu4x.mp4'),
];

bucketManager.batch(statOperations, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    // 200 is success, 298 is part success
    if (parseInt(respInfo.statusCode / 100) == 2) {
      respBody.forEach(function(item) {
        if (item.code == 200) {
          console.log(item.data.fsize + "\t" + item.data.hash + "\t" +
            item.data.mimeType + "\t" + item.data.putTime + "\t" +
            item.data.type);
        } else {
          console.log(item.code + "\t" + item.data.error);
        }
      });
    } else {
      console.log(respInfo.statusCode);
      console.log(respBody);
    }
  }
});
```

<a id="rs-batch-chgm"></a>
### 批量修改文件类型

```
//每个operations的数量不可以超过1000个，如果总数量超过1000，需要分批发送
var chgmOperations = [
  qiniu.rs.changeMimeOp(srcBucket, 'qiniu1.mp4', 'video/x-mp4'),
  qiniu.rs.changeMimeOp(srcBucket, 'qiniu2.mp4', 'video/x-mp4'),
  qiniu.rs.changeMimeOp(srcBucket, 'qiniu3.mp4', 'video/x-mp4'),
  qiniu.rs.changeMimeOp(srcBucket, 'qiniu4.mp4', 'video/x-mp4'),
];

bucketManager.batch(chgmOperations, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    // 200 is success, 298 is part success
    if (parseInt(respInfo.statusCode / 100) == 2) {
      respBody.forEach(function(item) {
        if (item.code == 200) {
          console.log("success");
        } else {
          console.log(item.code + "\t" + item.data.error);
        }
      });
    } else {
      console.log(respInfo.statusCode);
      console.log(respBody);
    }
  }
});
```

<a id="rs-batch-delete"></a>
### 批量删除文件

```
//每个operations的数量不可以超过1000个，如果总数量超过1000，需要分批发送
var deleteOperations = [
  qiniu.rs.deleteOp(srcBucket, 'qiniu1.mp4'),
  qiniu.rs.deleteOp(srcBucket, 'qiniu2.mp4'),
  qiniu.rs.deleteOp(srcBucket, 'qiniu3.mp4'),
  qiniu.rs.deleteOp(srcBucket, 'qiniu4x.mp4'),
];

bucketManager.batch(deleteOperations, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    // 200 is success, 298 is part success
    if (parseInt(respInfo.statusCode / 100) == 2) {
      respBody.forEach(function(item) {
        if (item.code == 200) {
          console.log(item.code + "\tsuccess");
        } else {
          console.log(item.code + "\t" + item.data.error);
        }
      });
    } else {
      console.log(respInfo.deleteusCode);
      console.log(respBody);
    }
  }
});
```

<a id="rs-batch-copy"></a>
### 批量复制文件
```
var srcBucket = 'if-pbl';
var srcKey = 'qiniu.mp4';
var destBucket = srcBucket;

//每个operations的数量不可以超过1000个，如果总数量超过1000，需要分批发送
var copyOperations = [
  qiniu.rs.copyOp(srcBucket, srcKey, destBucket, 'qiniu1.mp4'),
  qiniu.rs.copyOp(srcBucket, srcKey, destBucket, 'qiniu2.mp4'),
  qiniu.rs.copyOp(srcBucket, srcKey, destBucket, 'qiniu3.mp4'),
  qiniu.rs.copyOp(srcBucket, srcKey, destBucket, 'qiniu4.mp4'),
];

bucketManager.batch(copyOperations, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    // 200 is success, 298 is part success
    if (parseInt(respInfo.statusCode / 100) == 2) {
      respBody.forEach(function(item) {
        if (item.code == 200) {
          console.log(item.code + "\tsuccess");
        } else {
          console.log(item.code + "\t" + item.data.error);
        }
      });
    } else {
      console.log(respInfo.deleteusCode);
      console.log(respBody);
    }
  }
});
```

<a id="rs-batch-move"></a>
### 批量移动或重命名文件

```
var srcBucket = 'if-pbl';
var destBucket = srcBucket;

//每个operations的数量不可以超过1000个，如果总数量超过1000，需要分批发送
var moveOperations = [
  qiniu.rs.moveOp(srcBucket, 'qiniu1.mp4', destBucket, 'qiniu1_move.mp4'),
  qiniu.rs.moveOp(srcBucket, 'qiniu2.mp4', destBucket, 'qiniu2_move.mp4'),
  qiniu.rs.moveOp(srcBucket, 'qiniu3.mp4', destBucket, 'qiniu3_move.mp4'),
  qiniu.rs.moveOp(srcBucket, 'qiniu4.mp4', destBucket, 'qiniu4_move.mp4'),
];

bucketManager.batch(moveOperations, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    // 200 is success, 298 is part success
    if (parseInt(respInfo.statusCode / 100) == 2) {
      respBody.forEach(function(item) {
        if (item.code == 200) {
          console.log(item.code + "\tsuccess");
        } else {
          console.log(item.code + "\t" + item.data.error);
        }
      });
    } else {
      console.log(respInfo.deleteusCode);
      console.log(respBody);
    }
  }
});
```

<a id="rs-batch-deleteAfterDays"></a>
### 批量更新文件的有效期

```
var srcBucket = 'if-pbl';

//每个operations的数量不可以超过1000个，如果总数量超过1000，需要分批发送
var deleteAfterDaysOperations = [
  qiniu.rs.deleteAfterDaysOp(srcBucket, 'qiniu1.mp4', 10),
  qiniu.rs.deleteAfterDaysOp(srcBucket, 'qiniu2.mp4', 10),
  qiniu.rs.deleteAfterDaysOp(srcBucket, 'qiniu3.mp4', 10),
  qiniu.rs.deleteAfterDaysOp(srcBucket, 'qiniu4.mp4', 10),
];

bucketManager.batch(deleteAfterDaysOperations, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    // 200 is success, 298 is part success
    if (parseInt(respInfo.statusCode / 100) == 2) {
      respBody.forEach(function(item) {
        if (item.code == 200) {
          console.log(item.code + "\tsuccess");
        } else {
          console.log(item.code + "\t" + item.data.error);
        }
      });
    } else {
      console.log(respInfo.statusCode);
      console.log(respBody);
    }
  }
});
```

<a id="rs-batch-type"></a>
### 批量更新文件存储类型

```
var srcBucket = 'if-pbl';

//每个operations的数量不可以超过1000个，如果总数量超过1000，需要分批发送
//type=0为普通存储，type=1为低频存储
var changeTypeOperations = [
  qiniu.rs.changeTypeOp(srcBucket, 'qiniu1.mp4', 1),
  qiniu.rs.changeTypeOp(srcBucket, 'qiniu2.mp4', 1),
  qiniu.rs.changeTypeOp(srcBucket, 'qiniu3.mp4', 1),
  qiniu.rs.changeTypeOp(srcBucket, 'qiniu4.mp4', 1),
];

bucketManager.batch(changeTypeOperations, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    //throw err;
  } else {
    // 200 is success, 298 is part success
    if (parseInt(respInfo.statusCode / 100) == 2) {
      respBody.forEach(function(item) {
        if (item.code == 200) {
          console.log("success");
        } else {
          console.log(item.code + "\t" + item.data.error);
        }
      });
    } else {
      console.log(respInfo.statusCode);
      console.log(respBody);
    }
  }
});
```

<a id="pfop"></a>
# 持久化数据处理

<a id="pfop-request"></a>
## 发送数据处理请求
对于已经保存到七牛空间的文件，可以通过发送持久化的数据处理指令来进行处理，这些指令支持七牛官方提供的指令，也包括客户自己开发的自定义数据处理的指令。数据处理的结果还可以通过七牛主动通知的方式告知业务服务器。

```
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var config = new qiniu.conf.Config();
//config.useHttpsDomain = true;
config.zone = qiniu.zone.Zone_z1;
var operManager = new qiniu.fop.OperationManager(mac, config);

//处理指令集合
var saveBucket = 'if-bc';
var fops = [
  'avthumb/mp4/s/480x320/vb/150k|saveas/' + qiniu.util.urlsafeBase64Encode(saveBucket + ":qiniu_480x320.mp4"),
  'vframe/jpg/offset/10|saveas/' + qiniu.util.urlsafeBase64Encode(saveBucket + ":qiniu_frame1.jpg")
];
var pipeline = 'jemy';
var srcBucket = 'if-bc';
var srcKey = 'qiniu.mp4';

var options = {
  'notifyURL': 'http://api.example.com/pfop/callback',
  'force': false,
};

//持久化数据处理返回的是任务的persistentId，可以根据这个id查询处理状态
operManager.pfop(srcBucket, srcKey, fops, pipeline, options, function(err, respBody, respInfo) {
  if (err) {
    throw err;
  }

  if (respInfo.statusCode == 200) {
    console.log(respBody.persistentId);
  } else {
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
```

<a id="pfop-status"></a>
## 查询数据处理请求状态
由于数据处理是异步处理，可以根据发送处理请求时返回的 `persistentId` 去查询任务的处理进度，如果在设置了`persistentNotifyUrl` 的情况下，直接业务服务器等待处理结果通知即可，如果需要主动查询，可以采用如下代码中的：

```
var persistentId = 'na0.58df4eee92129336c2075195';
var config = new qiniu.conf.Config();
var operManager = new qiniu.fop.OperationManager(null, config);
//持久化数据处理返回的是任务的persistentId，可以根据这个id查询处理状态
operManager.prefop(persistentId, function(err, respBody, respInfo) {
  if (err) {
    console.log(err);
    throw err;
  }

  if (respInfo.statusCode == 200) {
    console.log(respBody.inputBucket);
    console.log(respBody.inputKey);
    console.log(respBody.pipeline);
    console.log(respBody.reqid);
    respBody.items.forEach(function(item) {
      console.log(item.cmd);
      console.log(item.code);
      console.log(item.desc);
      console.log(item.hash);
      console.log(item.key);
    });
  } else {
    console.log(respInfo.statusCode);
    console.log(respBody);
  }
});
```

<a id="fusion-cdn"></a>
# CDN相关功能
- <a href="#fusion-refresh-urls">文件刷新</a>
- <a href="#fusion-refresh-dirs">目录刷新</a>
- <a href="#fusion-prefetch">文件预取操作</a>
- <a href="#fusion-flux">获取域名流量</a>
- <a href="#fusion-bandwidth">获取域名带宽</a>
- <a href="#fusion-logs">获取日志下载链接</a>
- <a href="#fusion-antileech">构建时间戳防盗链访问链接</a>

在使用CDN相关功能之前，需要构建`CdnManager`对象：

```
var accessKey = 'your access key';
var secretKey = 'your secret key';
var mac = new qiniu.auth.digest.Mac(accessKey, secretKey);
var cdnManager = new qiniu.cdn.CdnManager(mac);
```

<a id="fusion-refresh-urls"></a>
## 文件刷新

```
//URL 列表
var urlsToRefresh = [
  'http://if-pbl.qiniudn.com/nodejs.png',
  'http://if-pbl.qiniudn.com/qiniu.jpg'
];

//刷新链接，单次请求链接不可以超过100个，如果超过，请分批发送请求
cdnManager.refreshUrls(urlsToRefresh, function(err, respBody, respInfo) {
  if (err) {
    throw err;
  }

  console.log(respInfo.statusCode);
  if (respInfo.statusCode == 200) {
    var jsonBody = JSON.parse(respBody);
    console.log(jsonBody.code);
    console.log(jsonBody.error);
    console.log(jsonBody.requestId);
    console.log(jsonBody.invalidUrls);
    console.log(jsonBody.invalidDirs);
    console.log(jsonBody.urlQuotaDay);
    console.log(jsonBody.urlSurplusDay);
    console.log(jsonBody.dirQuotaDay);
    console.log(jsonBody.dirSurplusDay);
  }
});
```

<a id="fusion-refresh-dirs"></a>
## 目录刷新

```
//DIR 列表
var dirsToRefresh = [
  'http://if-pbl.qiniudn.com/examples/',
  'http://if-pbl.qiniudn.com/images/'
];

//刷新目录，刷新目录需要联系七牛技术支持开通权限
//单次请求链接不可以超过10个，如果超过，请分批发送请求
qiniu.cdn.refreshDirs(dirsToRefresh, function(err, respBody, respInfo) {
  if (err) {
    throw err;
  }

  console.log(respInfo.statusCode);
  if (respInfo.statusCode == 200) {
    var jsonBody = JSON.parse(respBody);
    console.log(jsonBody.code);
    console.log(jsonBody.error);
    console.log(jsonBody.requestId);
    console.log(jsonBody.invalidUrls);
    console.log(jsonBody.invalidDirs);
    console.log(jsonBody.urlQuotaDay);
    console.log(jsonBody.urlSurplusDay);
    console.log(jsonBody.dirQuotaDay);
    console.log(jsonBody.dirSurplusDay);
  }
});
```

<a id="fusion-prefetch"></a>
## 文件预取

```
//URL 列表
var urlsToPrefetch = [
  'http://if-pbl.qiniudn.com/nodejs.png',
  'http://if-pbl.qiniudn.com/qiniu.jpg'
];

//预取链接，单次请求链接不可以超过100个，如果超过，请分批发送请求
cdnManager.prefetchUrls(urlsToPrefetch, function(err, respBody, respInfo) {
  if (err) {
    throw err;
  }

  console.log(respInfo.statusCode);
  if (respInfo.statusCode == 200) {
    var jsonBody = JSON.parse(respBody);
    console.log(jsonBody.code);
    console.log(jsonBody.error);
    console.log(jsonBody.requestId);
    console.log(jsonBody.invalidUrls);
    console.log(jsonBody.invalidDirs);
    console.log(jsonBody.urlQuotaDay);
    console.log(jsonBody.urlSurplusDay);
    console.log(jsonBody.dirQuotaDay);
    console.log(jsonBody.dirSurplusDay);
  }
});
```

<a id="fusion-flux"></a>
## 获取域名流量

```
//域名列表
var domains = [
  'if-pbl.qiniudn.com',
  'qdisk.qiniudn.com'
];

//指定日期
var startDate = '2017-06-20';
var endDate = '2017-06-22';
var granularity = 'day';

//获取域名流量
cdnManager.getFluxData(startDate, endDate, granularity, domains, function(err,
  respBody, respInfo) {
  if (err) {
    throw err;
  }

  console.log(respInfo.statusCode);
  if (respInfo.statusCode == 200) {
    var jsonBody = JSON.parse(respBody);
    var code = jsonBody.code;
    console.log(code);

    var tickTime = jsonBody.time;
    console.log(tickTime);

    var fluxData = jsonBody.data;
    domains.forEach(function(domain) {
      var fluxDataOfDomain = fluxData[domain];
      if (fluxDataOfDomain != null) {
        console.log("flux data for:" + domain);
        var fluxChina = fluxDataOfDomain["china"];
        var fluxOversea = fluxDataOfDomain["oversea"];
        console.log(fluxChina);
        console.log(fluxOversea);
      } else {
        console.log("no flux data for:" + domain);
      }
      console.log("----------");
    });
  }
});
```

<a id="fusion-bandwidth"></a>
## 获取域名带宽

```
//域名列表
var domains = [
  'if-pbl.qiniudn.com',
  'qdisk.qiniudn.com'
];

//指定日期
var startDate = '2017-06-20';
var endDate = '2017-06-22';
var granularity = 'day';

//获取域名带宽
cdnManager.getBandwidthData(startDate, endDate, granularity, domains, function(
  err, respBody, respInfo) {
  if (err) {
    console.log(err);
    throw err;
  }

  console.log(respInfo.statusCode);
  if (respInfo.statusCode == 200) {
    var jsonBody = JSON.parse(respBody);
    var code = jsonBody.code;
    console.log(code);

    var tickTime = jsonBody.time;
    console.log(tickTime);

    var bandwidthData = jsonBody.data;
    domains.forEach(function(domain) {
      var bandwidthDataOfDomain = bandwidthData[domain];
      if (bandwidthDataOfDomain != null) {
        console.log("bandwidth data for:" + domain);
        var bandwidthChina = bandwidthDataOfDomain["china"];
        var bandwidthOversea = bandwidthDataOfDomain["oversea"];
        console.log(bandwidthChina);
        console.log(bandwidthOversea);
      } else {
        console.log("no bandwidth data for:" + domain);
      }
      console.log("----------");
    });
  }
});
```

<a id="fusion-logs"></a>
## 获取日志下载链接

```
//域名列表
var domains = [
  'if-pbl.qiniudn.com',
  'qdisk.qiniudn.com'
];

//指定日期
var logDay = '2017-06-20';

//获取域名日志
cdnManager.getCdnLogList(domains, logDay, function(err, respBody, respInfo) {
  if (err) {
    throw err;
  }

  console.log(respInfo.statusCode);
  if (respInfo.statusCode == 200) {
    var jsonBody = JSON.parse(respBody);
    var code = jsonBody.code;
    console.log(code);
    var logData = jsonBody.data;
    domains.forEach(function(domain) {
      console.log("log for domain: " + domain);
      var domainLogs = logData[domain];
      if (domainLogs != null) {
        domainLogs.forEach(function(logItem) {
          console.log(logItem.name);
          console.log(logItem.size);
          console.log(logItem.mtime);
          console.log(logItem.url);
        });
        console.log("------------------");
      }
    });
  }
});
```

<a id="fusion-antileech"></a>
## 构建时间戳防盗链访问链接

具体算法可以参考：[时间戳防盗链](/fusion/kb/timestamp-hotlinking-prevention)

```
var domain = 'http://sg.xiaohongshu.com';
var fileName = 'github.png';
//加密密钥
var encryptKey = 'xxx';
var query = {
  'name': 'qiniu',
  'location': 'shanghai'
};
var deadline = parseInt(Date.now() / 1000) + 3600;
var cdnManager = new qiniu.cdn.CdnManager(null);
var finalUrl = cdnManager.createTimestampAntiLeechUrl(domain, fileName, query, encryptKey, deadline);
console.log(finalUrl);
```

<a id="api-references"></a>
# API 参考

- [存储 API 参考](/kodo)
- [融合CDN API 参考](/fusion)
- [官方数据处理 API 参考](/dora)

<a id="faq"></a>
# 常见问题

- Node.js SDK的callback保留了请求的错误信息，回复信息和头部信息，遇到问题时，可以都打印出来提交给我们排查问题。
- API 的使用，可以参考我们为大家精心准备的[使用实例](https://github.com/qiniu/nodejs-sdk/tree/master/examples)。

<a id="related-resources"></a>
# 相关资源

如果您有任何关于我们文档或产品的建议和想法，欢迎您通过以下方式与我们互动讨论：

* [技术论坛](http://segmentfault.com/qiniu) - 在这里您可以和其他开发者愉快的讨论如何更好的使用七牛云服务
* [提交工单](https://support.qiniu.com/tickets/new) - 如果您的问题不适合在论坛讨论或希望及时解决，您也可以提交一个工单，我们的技术支持人员会第一时间回复您
* [博客](http://blog.qiniu.com) - 这里会持续更新发布市场活动和技术分享文章
* [微博](http://weibo.com/qiniutek)
* [常见问题](https://support.qiniu.com/question)

<a id="contribute-code"></a>
# 贡献代码

1. Fork

2. 创建您的特性分支 git checkout -b my-new-feature

3. 提交您的改动 git commit -am 'Added some feature'

4. 将您的修改记录提交到远程 git 仓库 git push origin my-new-feature

5. 然后到 github 网站的该 git 远程仓库的 my-new-feature 分支下发起 Pull Request

<a id="license"></a>
# 许可证

Copyright (c) 2014 qiniu.com

基于 MIT 协议发布:

* [www.opensource.org/licenses/MIT](http://www.opensource.org/licenses/MIT)
