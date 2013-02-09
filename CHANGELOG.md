#CHANGELOG

## v2.4.1

2013-02-09

Issue [#43](https://github.com/qiniu/nodejs-sdk/pull/43):

- imageMogr bugfix: auto-orient
- auth.UploadToken, auth.DownloadToken 改为 auth.PutPolicy, auth.GetPolicy
- auth.UploadToken.generateToken() 改为 auth.PutPolicy.token()
- auth.DownloadToken.generateToken() 改为 auth.GetPolicy.token()
- auth.DownloadToken.pattern 改为 auth.GetPolicy.scope


## v2.4.0

2013-01-23

Issue [#36](https://github.com/qiniu/nodejs-sdk/pull/36):

- 增加 auth.DownloadToken 类
- auth.UploadToken 增加：escape、asyncOps 成员，generateSignature 改名为 generateToken
- 增加 rs.copy, rs.move, rs.batchGet, rs.batchStat, rs.batchDelete, rs.batchCopy, rs.batchMove
- 增加 Travis-CI 的支持

Issue [#32](https://github.com/qiniu/nodejs-sdk/pull/32):

- auth.UploadToken.generateSignature 各个参数调整为可选
- uploadWithToken 非兼容调整: rs.uploadWithToken(uploadToken, stream, key, mimeType, customMeta, callbackParams, crc32, onret)
- generateActionString 非兼容调整: action = util.generateActionString(bucket, key, mimeType, customMeta, crc32)


## v2.3.2

2012-12-31

- 修复crc32编码
- 修复使用UploadToken方式上传时流式上传bug，流式上传不检查crc32


## v2.3.0

2012-11-23

- 启用新的 uploadToken（上传凭证）上传方式，可由客户方业务服务器生成上传凭证。上传前无需请求七牛云存储，减少http请求。

