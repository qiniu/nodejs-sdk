## CHANGE LOG

### v6.1.13

2016-10-13

- 修正从uptoken获取bucket

### v6.1.12

2016-10-10

- 增加多机房接口调用支持

### v6.1.11

2016-05-06

- npm 通过travis 自动发布

### v6.1.10

2016-04-25

- list 增加delimiter 支持
- 增加强制copy/move
- 底层使用putReadable 谢谢 @thesadabc
- 修正result 处理 谢谢 @loulin
- fix Unhandled stream error in pipe 谢谢@loulin
- putExtra 修正 paras 为 params

### v6.1.9

2015-12-03

- Make secure base url 
- policy add fsizeMin 
- 修正 getEncodedEntryUri(bucket, key) 
- 文档修正 

### v6.1.8

2015-05-13

- 上传增加putpolicy2

### v6.1.7

2015-05-09

- 上传putpolicy2增加 callbackHost、persistentPipeline, callbackFetchKey
- 增加fetch 函数
- imageview -> imageview2


### v6.1.6

2014-10-31

- 上传putpolicy2增加fsizelimit, insertonly


### v6.1.5

2014-7-23 issue [#111](https://github.com/qiniu/nodejs-sdk/pull/111)

- [#109] 统一user agent
- [#110] 更新put policy

### v6.1.4

2014-7-10 issue [#108](https://github.com/qiniu/nodejs-sdk/pull/108)

- [#107] 调整上传host


### v6.1.3

2014-4-03 issue [#102](https://github.com/qiniu/nodejs-sdk/pull/102)

- [#98] 增加pfop 功能
- [#99] 增加针对七牛callback的检查

### v6.1.2

2014-2-17 issue [#96](https://github.com/qiniu/nodejs-sdk/pull/96)

- Content-Length = 0 时的细节修复


### v6.1.1

2013-12-5 issue [#90](https://github.com/qiniu/nodejs-sdk/pull/90)

- 创建buffer前检测


### v6.1.0

2013-10-08 issues [#81](https://github.com/qiniu/nodejs-sdk/pull/81)

- 使用urllib
- 修复callbackUrl的bug
- 调整bucket的下载域名

### v6.0.0

2013-07-16 issue [#56](https://github.com/qiniu/nodejs-sdk/pull/56)

- 遵循 [sdkspec v6.0.4](https://github.com/qiniu/sdkspec/tree/v6.0.4)
