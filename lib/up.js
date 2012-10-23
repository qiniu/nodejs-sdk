var fs = require("fs");
var crc = require("crc");
var util = require("./util.js");
var config = require("./conf.js");

exports.ResumableUpload = ResumableUpload;

function clone(dst, src){
  dst.ctx = src.ctx;
  dst.checksum = src.checksum;
  dst.crc32 = src.crc32;
  dst.offset = src.offset;
  dst.restsize = src.restsize;
}

function blockCount(fileSize) {
  var blockCnt = (fileSize + config.BLOCK_SIZE - 1) / config.BLOCK_SIZE;
  return Math.floor(blockCnt);
}

// ------------------------------------------------------------------------------------------
// Progress类

function Progress() {
  this.data = [];
  this.dataFile = "data.txt";
}

Progress.prototype.init = function(blockCount) {
  for (var i = 0; i < blockCount ; i++) {
    var prog = {
      "ctx": "",
      "checksum": "",
      "crc32": 0,
      "offset": 0,
      "restsize": 0,
    };
    this.data.push(prog);
  }
};

Progress.prototype.loadProgress = function() {
  var that = this;
  var filename = this.dataFile;
  fs.exists(filename, function(exists){
    fs.readFile(filename, function(err, data){
      if (err) { throw err };
      if (data.length !== 0) {
        var myObj = JSON.parse(data);
        for (var i = 0; i < myObj.length; i++) {
          clone(that.data[i], myObj[i]);
        }
      };
    });
  });
};

Progress.prototype.saveProgress = function() {
  var data = this.data;
  var filename = this.dataFile;
  console.log(data);
  fs.exists(filename, function(exists){
    fs.writeFile(filename, JSON.stringify(data), function(err){
      if (err) { throw err };
      console.log("It's saved!\n");
    });
  });
};
// ------------------------------------------------------------------------------------------


// ------------------------------------------------------------------------------------------
// ResumableUpload类

function ResumableUpload(conn, uploadToken, bucket, key, mimeType, customMeta, customer, callbackParams) {
  this.uploadToken = uploadToken;
  this.entryURI = bucket + ":" + key;
  this.mimeType = mimeType || null;
  this.customMeta = customMeta || null;
  this.customer = customer || null;
  this.callbackParams = callbackParams || null;
  this.callWithConn = new CallWithConn(conn);
}

ResumableUpload.prototype.upload = function(filename) {
  var result = null;
  var fileStat = fs.statSync(filename);
  var fileSize = fileStat.size;
  var blockCnt = blockCount(fileSize);

  var progress = new Progress(blockCnt);
  progress.loadProgress();
  if (progress.data.length === 0) { 
    progress.init(blockCnt);
  }

  for (var blockIndex = 0; blockIndex < blockCnt; blockIndex++) {
    if (progress.data[blockIndex].checksum === "") {
      var blockSize = config.BLOCK_SIZE;
      if (blockIndex === blockCnt - 1) {
        blockSize = fileSize - blockIndex * config.BLOCK_SIZE;
      }
      result = this.uploadBlock(filename, blockIndex, blockSize, progress, 3);
      if (result.code === 200) {
        progress.data[blockIndex].checksum = result.data["checksum"];
      } else {
        progress.saveProgress();
      }
    }
  }
  if (result.code === 200) {
    result = this.callWithConn.mkFile(this.uploadToken, this.entryURI, fileSize, progress);
    if (result.code === 200) {
      console.log("Upload Successfully!");
    }
  }
  return result;
};

ResumableUpload.prototype.uploadBlock = function(filename, blockIndex, blockSize, progress, retryTimes) {
  if (progress.data[blockIndex].ctx === "") {
    progress.data[blockIndex].offset = 0;
    progress.data[blockIndex].restsize = blockSize;

    var bodyLength = blockSize > config.CHUNK_SIZE ? config.CHUNK_SIZE : blockSize;
    for (var i = 0; i < retryTimes; i++) {
      var start = blockIndex * config.BLOCK_SIZE;
      var end = start + bodyLength;

      // 这里先设编码为"ascii"，实际使用中并不一定是，因为该上传功能必须对任何文件都适用，包括二进制文件
      var fileStream = fs.createReadStream(filename, {start: start, end: end, encoding: "ascii"});
      var result = this.callWithConn.mkBlock(this.uploadToken, blockSize, fileStream, bodyLength);

      var body;
      fileStream.on('data', function(textData){
        body += textData;
      });

      // 计算该block的crc32值，参数body必须是字符串
      var bodyCrc32 = crc.crc32(body);

      if ((result.code === 200) && (result.data["crc32"] === bodyCrc32)) {
        progress.data[blockIndex].ctx = result.data["ctx"];
        progress.data[blockIndex].offset = result.data["offset"];
        progress.data[blockIndex].restsize = blockSize - bodyLength;
      } else if(i === retryTimes -1) {
        console.log("Uploading block error. Expected crc32: ", bodyCrc32, ", but got: ", result.data["crc32"]);
      }
    } 
  } else if((progress.data[blockIndex].offset + progress.data[blockIndex].restsize) !== blockSize){
      throw("Block size not match");
  }
  var restsize = progress.data[blockIndex].restsize;
  while(restsize > 0){
    var bodyLength = restsize > config.CHUNK_SIZE ? config.CHUNK_SIZE : restsize;
    for (var i = 0; i < retryTimes; i++) {
      var start = blockIndex * config.BLOCK_SIZE;
      var end = start + bodyLength;
      var fileStream = fs.createReadStream(filename, {start: start, end: end, encoding: "ascii"});
      var ctx = progress.data[blockIndex].ctx;
      var offset = progress.data[blockIndex].offset;
      var result = this.callWithConn.putBlock(this.uploadToken, ctx, offset, fileStream, bodyLength);

      var body;
      fileStream.on('data', function(textData){
        body += textData;
      });

      var bodyCrc32 = crc.crc32(body);
      if ((result.code === 200) && (result.data["crc32"] === bodyCrc32)) {
        progress.data[blockIndex].ctx = result.data["ctx"];
        progress.data[blockIndex].offset += bodyLength;
        progress.data[blockIndex].restsize -= bodyLength;
        restsize = progress.data[blockIndex].restsize;
      } else if(i === retryTimes -1) {
        console.log("Uploading block error. Expected crc32: ", bodyCrc32, ", but got: ", result.data["crc32"]);
      }
    }
  }
};

// ------------------------------------------------------------------------------------------


// ------------------------------------------------------------------------------------------
// CallWithConn类

function CallWithConn(conn) {
  this.conn = conn;
}

CallWithConn.prototype.callBinaryWithUptoken = function(uploadToken, url, fileStream, size, retryTimes) {
  var result;
  var retryTimes = retryTimes || 0;
  var binary = new util.Binary(fileStream, size);

  this.conn.callWithToken(uploadToken, url, binary, function(resp){
    if (resp.code !== 200) {
      while(retryTimes < config.MAX_RETRY_TIMES) {
        return this.callBinaryWithUptoken(uploadToken, url, fileStream, size, retryTimes + 1);
      }
    }
    result = resp
  });
  return result;
}

CallWithConn.prototype.mkFile = function(uploadToken, entryURI, fileSize, progress, mimeType, customMeta, customer, callbackParams) {
  var url = '/rs-mkfile/' + util.encode(entryURI) + "/fsize/" + fileSize.toString();
  if ((mimeType !== undefined) && (mimeType !== null)) {
    url += '/mimeType/' + util.encode(mimeType);
  }
  if ((customMeta !== undefined) && (customMeta !== null)) {
    url += '/meta/' + util.encode(customMeta);
  }
  if ((customer !== undefined) && (customer !== null)) {
    url += '/customer/' + customer;
  }
  if ((callbackParams !== undefined) && (callbackParams !== null)) {
    var callbackString = util.generateQueryString(callbackParams);
    url += '/params/' + util.encode(callbackString);
  }
  var body = '';
  var size = 0;
  for(var data in progress.data){
    body += util.encode(data.ctx);
    size += 1;
  }
  return this.callBinaryWithUptoken(uploadToken, url, body, size, 0);
};

CallWithConn.prototype.mkBlock = function(uploadToken, blockSize, fileStream, size) {
  var url = config.UP_HOST + "/mkblk/" + blockSize.toString();
  return this.callBinaryWithUptoken(uploadToken, url, fileStream, size, 0);
};

CallWithConn.prototype.putBlock = function(uploadToken, ctx, offset, fileStream, size) {
  var url = config.UP_HOST + "/bput/" + ctx + "/" + offset;
  return this.callBinaryWithUptoken(uploadToken, url, fileStream, size, 0);
};

// ------------------------------------------------------------------------------------------