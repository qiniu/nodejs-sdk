# Node wrapper for Qiniu Resource (Cloud) Storage API

![logo](http://qiniutek.com/images/logo-2.png)

该 SDK 适用于 NodeJS 0.4.7 及其以上版本，基于 [七牛云存储官方API](/v2/api/) 构建。若您的服务端是一个基于 NodeJS 编写的网络程序，使用此 SDK ，能让您以非常便捷地方式将数据安全地存储到七牛云存储上。以便让您应用的终端用户进行高速上传和下载，同时也使得您的服务端更加轻盈。

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

SDK 使用文档参考：[http://docs.qiniutek.com/v2/sdk/nodejs/](http://docs.qiniutek.com/v2/sdk/nodejs/)

### 示例程序

   	var qiniu = require('../index.js');
	var mime = require('mime');

	qiniu.conf.ACCESS_KEY = '<Please apply your access key>';
	qiniu.conf.SECRET_KEY = '<Dont send your secret key to anyone>';

	var key = __filename;
	var friendName = key;
	var bucket = 'qiniu_test_bucket';
	var DEMO_DOMAIN = bucket + '.dn.qbox.me';

	var conn = new qiniu.digestauth.Client();

	// 创建bucket
	qiniu.rs.mkbucket(conn, bucket, function(resp) {
  		console.log("\n===> Make bucket result: ", resp);
  		if (resp.code != 200) {
    		return;
  		}
	});

	// 使用新创建的bucket创建RS服务
	var rs = new qiniu.rs.Service(conn, bucket);

	var opts = {
    	scope: bucket,
    	expires: 3600,
    	callbackUrl: null,
    	callbackBodyType: null,
    	customer: "sunikbear@gmail.com"
  	};
  	
  	// 组装Upload Token上传参数
  	// 产生规格详见文档：http://docs.qiniutek.com/v3/api/io/
  	var localFile = key,
  		 customMeta = "",
  		 callbackParams = {},
  		 enableCrc32Check = false;
  		 
  	// 创建 Upload Token
  	var token = new qiniu.auth.UploadToken(opts);
  	var uploadToken = token.generateToken();
  	var mimeType = mime.lookup(key);

	// 使用Upload Token以multipart/form-data形式上传文件
	rs.uploadFileWithToken(uploadToken, localFile, bucket, key, mimeType, customMeta, callbackParams, enableCrc32Check, function(resp){
    	console.log("\n===> Upload File with Token result: ", resp);
    	if (resp.code != 200) {
      		clear(rs);
      		return;
    	}
    	
    	// 查看文件属性
      	rs.stat(key, function(resp) {
		  	console.log("\n===> Stat result: ", resp);
		  	if (resp.code != 200) {
          	clear(rs);
				return;
			}
			
			// 获取文件下载链接（含文件属性信息）
			rs.get(key, friendName, function(resp) {
				console.log("\n===> Get result: ", resp);
				if (resp.code != 200) {
            		clear(rs);
				   return;
				}
				
				// 删除文件
				rs.remove(key, function(resp) {
            		clear(rs);
				   console.log("\n===> Delete result: ", resp);
				});
			});
		});
	});
	
	// 将bucket的内容作为静态内容发布
	rs.publish(DEMO_DOMAIN, function(resp){
      	console.log("\n===> Publish result: ", resp);
      	if (resp.code != 200){
        	clear(rs);
        	return;
   		}
   	});   	   					  	
      		
   	// 删除bucket，慎用！
 	function clear(rs) {
 		rs.drop(function(resp){
    		console.log("\n===> Drop result: ", resp);
  		});
	}


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
