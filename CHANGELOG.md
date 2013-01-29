#CHANGELOG

## v3.0.0

2013-1-29

updated:

- 将 callback 方式由原来的 callback(resp) 改成 callback(err, data)。

## v2.3.2

2012-12-31

updated:

- 修复crc32编码
- 修复使用UploadToken方式上传时流式上传bug，流式上传不检查crc32

## v2.3.0

2012-11-23

updated:

- 启用新的 uploadToken（上传凭证）上传方式，可由客户方业务服务器生成上传凭证。上传前无需请求七牛云存储，减少http请求。
