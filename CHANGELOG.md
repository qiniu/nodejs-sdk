#CHANGELOG

## v3.0.0

2013-1-29

updated:

- 本次升级为非兼容调整，主要改变是将 callback 方式由原来的 callback(resp) 改成 callback(err, data)
- 原来的回调方式 callback(resp) 中，如果 API 调用出错，返回的数据 resp 中包含出错码以及相应的出错信息；如果调用成功，则返回 200 和七牛云存储 API 返回的数据。
- 现有的回调方式 callback(err, data) 中，如果 API 调用出错，返回的 err 不为 null，其中包含出错码以及相应的出错信息；如果调用成功，err 的值为 null，七牛云存储 API 返回的数据放在 data 中。因此，调用新版本的 API 时，需要在回调函数中首先判断 err 的值是否为 null，如果不是则表示 API 调用不成功，必须中断后续操作，否则表示 API 调用成功。更多详细信息请参考本 SDK 文档中的示例代码、demo文件或者测试代码。

## v2.3.2

2012-12-31

updated:

- 修复crc32编码
- 修复使用UploadToken方式上传时流式上传bug，流式上传不检查crc32

## v2.3.0

2012-11-23

updated:

- 启用新的 uploadToken（上传凭证）上传方式，可由客户方业务服务器生成上传凭证。上传前无需请求七牛云存储，减少http请求。
