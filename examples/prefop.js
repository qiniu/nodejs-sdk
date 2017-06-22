const qiniu = require("../index.js");

var persistentId = 'z0.594b66f745a2650c99aa9e57';
//持久化数据处理返回的是任务的persistentId，可以根据这个id查询处理状态
qiniu.fop.prefop(persistentId, function(err, respBody, respInfo) {
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
  }
});
