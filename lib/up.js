var fs = require("fs");
var crc32 = require("crc32");
var rs = require("./rs.js");
var util = require("./util.js");
var config = require("./conf.js");

exports.ResumableUpload = ResumableUpload;

// ------------------------------------------------------------------------------------------
// 用于包装上传功能
// 若文件大小大于一个Block的大小，则采用断点续上传功能
// 否则，采用普通的上传方式

exports.Upload = function(filename, conn, uploadToken, bucket, key, mimeType, customMeta, customer, callbackParams, onret){
  var fileStat = fs.statSync(filename);
  var fileSize = fileStat.size;
  if (fileSize > config.BLOCK_SIZE) {
    var resumableUpload = new ResumableUpload(conn, uploadToken, bucket, key, mimeType, customMeta, customer, callbackParams);
    resumableUpload.upload(filename, onret);
  } else{
      var rs = new rs.Service(conn, bucket);
      rs.uploadFileWithToken(uploadToken, filename, key, mimeType, customMeta, callbackParams, true, onret);
  }
}

// ------------------------------------------------------------------------------------------

function clone(dst, src){
  dst.ctx = src.ctx;
  dst.checksum = src.checksum;
  dst.crc32 = src.crc32;
  dst.offset = src.offset;
  dst.restsize = src.restsize;
}

function blockCount(fileSize) {
  var blockCnt = (fileSize + config.BLOCK_SIZE - 1) / config.BLOCK_SIZE;
  blockCnt = Math.floor(blockCnt);
  return blockCnt;
}

/* Chunk Count
function chunkCount(blockCnt) {
  var chunkCnt = (blockCnt + config.CHUNK_SIZE - 1) / config.CHUNK_SIZE;
  chunkCnt = Math.floor(chunkCnt);
  return chunkCnt;
}
*/

function responseOK(number) {
  return (Math.floor(number/100) === 2);
}

// ------------------------------------------------------------------------------------------
// Progress类

function Progress() {
  this.data = [];
  this.dataFile = "progress.txt";
}

Progress.prototype.init = function(blockCount) {
  var self = this;
  for (var i = 0; i < blockCount ; i++) {
    var prog = {
      "ctx": "",
      "checksum": "",
      "crc32": 0,
      "offset": 0,
      "restsize": 0,
    };
    self.data.push(prog);
  }
};

Progress.prototype.loadProgress = function() {
  var self = this;
  var filename = this.dataFile;
  fs.exists(filename, function(exists){
    if (!exists) {
      fs.openSync(filename, "a+");
      self.init();
      return;
    }
    fs.readFile(filename, function(err, data){
      if (err) { throw err }
      if (data.length !== 0) {
        var myObj = JSON.parse(data);
        for (var i = 0; i < myObj.length; i++) {
          clone(self.data[i], myObj[i]);
        }
      };
    });
  });
};

Progress.prototype.saveProgress = function() {
  var data = this.data;
  var filename = this.dataFile;
  fs.exists(filename, function(exists){
    if (!exists) {
      fs.openSync(filename, "w");
    }
    fs.writeFile(filename, JSON.stringify(data), function(err){
      if (err) { 
        throw("Write progress error");
      }
    });
  });
};

Progress.prototype.deleteProgess = function() {
  var filename = this.dataFile;
  fs.exists(filename, function(exists){
    fs.unlinkSync(filename);
  });
};

// ------------------------------------------------------------------------------------------


// ------------------------------------------------------------------------------------------
// ResumableUpload类

function ResumableUpload(conn, uploadToken, bucket, key, mimeType, customMeta, customer, callbackParams) {
  this.fd = 0;
  this.uploadToken = uploadToken;
  this.entryURI = bucket + ":" + key;
  this.mimeType = mimeType || null;
  this.customMeta = customMeta || null;
  this.customer = customer || null;
  this.callbackParams = callbackParams || null;
  this.callWithConn = new CallWithConn(conn);
}

ResumableUpload.prototype.upload = function(filename, onret) {
  var self = this;
  var fileStat = fs.statSync(filename);
  var fileSize = fileStat.size;
  var blockCnt = blockCount(fileSize);

  var progress = new Progress(blockCnt);
  progress.loadProgress();
  if (progress.data.length === 0) { 
    progress.init(blockCnt);
  }
  self.fd = fs.openSync(filename, 'r');
  var success = 0;

  for (var blockIndex = 0; blockIndex < blockCnt; blockIndex++) {
    if (progress.data[blockIndex].checksum === "") {
      var blockSize = config.BLOCK_SIZE;
      if (blockIndex === blockCnt - 1) {
        blockSize = fileSize - blockIndex * config.BLOCK_SIZE;
      }

      self.uploadBlock(filename, blockIndex, blockSize, progress, 3, function(resp){
        if (resp) {
          console.log("Upload block success!");
          success += 1;
        }
        if (success >= blockCnt) {
          fs.close(self.fd);
          self.callWithConn.mkFile(self.uploadToken, self.entryURI, fileSize, progress, self.mimeType, self.customMeta, self.customer, self.callbackParams, onret);
          progress.deleteProgess();
        }
      });
    }
  }
};

ResumableUpload.prototype.uploadBlock = function(filename, blockIndex, blockSize, progress, retryTimes, onret) {
  var mkBlockSuccess = false;
  var self = this;
  if (progress.data[blockIndex].ctx === "") {

    progress.data[blockIndex].offset = 0;
    progress.data[blockIndex].restsize = blockSize;

    var bodyLength = blockSize > config.CHUNK_SIZE ? config.CHUNK_SIZE : blockSize;
    var start = blockIndex * config.BLOCK_SIZE;
    var end = start + bodyLength;
    var buf = new Buffer(bodyLength);
    var bytesRead = fs.readSync(self.fd, buf, 0, bodyLength, start);
    if (bytesRead !== bodyLength) {
      console.log("Can not read exact content from file!");
      return;
    }
    var bodyCrc32 = parseInt("0x" + crc32(buf));
    var fileStream = fs.createReadStream(filename, {start: start, end: end});

    self.callWithConn.mkBlock(self.uploadToken, blockSize, fileStream, bodyLength, function(resp){
      if (responseOK(resp.code) && (resp.data["crc32"] === bodyCrc32)) {
        progress.data[blockIndex].ctx = resp.data["ctx"];
        progress.data[blockIndex].crc32 = resp.data["crc32"];
        progress.data[blockIndex].checksum = resp.data["checksum"];
        progress.data[blockIndex].offset += bodyLength;
        progress.data[blockIndex].restsize -= bodyLength;
        progress.saveProgress();

        var restsize = progress.data[blockIndex].restsize;

        if (restsize === 0) {
          onret(true);
        } else {
          start = end;
          end = start + bodyLength;
          self.runUploadChunk(filename, restsize, progress, blockIndex, start, end, onret);
        }
      } 
    }); 
  } else if((progress.data[blockIndex].offset + progress.data[blockIndex].restsize) !== blockSize){
      throw("Block size not match");
  }
};

ResumableUpload.prototype.runUploadChunk = function(filename, restsize, progress, blockIndex, start, end, onret){
  var self = this;
  if (restsize <= 0){
    return onret(true);
  }
  var bodyLength = restsize > config.CHUNK_SIZE ? config.CHUNK_SIZE : restsize;
  var buf = new Buffer(bodyLength);
  bytesRead = fs.readSync(self.fd, buf, 0, bodyLength, start);
  if (bytesRead !== bodyLength) {
    console.log("Can not read exact content from file!");
    return;
  }
  var bodyCrc32 = parseInt("0x" + crc32(buf));

  var fileStream = fs.createReadStream(filename, {start: start, end: end});
  var ctx = progress.data[blockIndex].ctx;
  var offset = progress.data[blockIndex].offset;

  self.callWithConn.putBlock(self.uploadToken, ctx, offset, fileStream, bodyLength, function(resp){
    console.log(resp);
    if (responseOK(resp.code) && (resp.data["crc32"] === bodyCrc32)) {
      progress.data[blockIndex].ctx = resp.data["ctx"];
      progress.data[blockIndex].crc32 = resp.data["crc32"];
      progress.data[blockIndex].checksum = resp.data["checksum"];
      progress.data[blockIndex].offset += bodyLength;
      progress.data[blockIndex].restsize -= bodyLength;
      progress.saveProgress();
      restsize = progress.data[blockIndex].restsize;
      if (restsize <= 0){
        return onret(true);
      }
      var newStart = end;
      var newEnd = newStart + bodyLength;
      return self.runUploadChunk(filename, restsize, progress, blockIndex, newStart, newEnd, onret);
    } else {
      // 如果上传失败，会自动进行无限次重试
      console.log("Retry uploading...");
      return self.runUploadChunk(filename, restsize, progress, blockIndex, start, end, onret);
    }
  });
};

// ------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------
// CallWithConn类

function CallWithConn(conn) {
  this.conn = conn;
}

CallWithConn.prototype.callBinaryWithUptoken = function(uploadToken, url, fileStream, size, retryTimes, onret) {
  var retryTimes = retryTimes || 0;
  var binary = new util.Binary(fileStream, size);
  return this.conn.callWithToken(uploadToken, url, binary, onret);
};

CallWithConn.prototype.mkFile = function(uploadToken, entryURI, fileSize, progress, mimeType, customMeta, customer, callbackParams, onret) {
  var url = '/rs-mkfile/' + util.encode(entryURI) + "/fsize/" + fileSize.toString();
  if ((mimeType !== undefined) && (mimeType !== null) && (mimeType !== "")) {
    url += '/mimeType/' + util.encode(mimeType);
  }
  if ((customMeta !== undefined) && (customMeta !== null) && (customMeta !== "")) {
    url += '/meta/' + util.encode(customMeta);
  }
  if ((customer !== undefined) && (customer !== null) && (customer !== "")) {
    url += '/customer/' + customer;
  }
  if ((callbackParams !== undefined) && (callbackParams !== null) && (callbackParams !== "")) {
    var callbackString = util.generateQueryString(callbackParams);
    if (callbackString) {
      url += '/params/' + util.encode(callbackString);
    }
  }
  url = config.UP_HOST + url;
  var body = '';
  var size = progress.data.length;
  for (var i = 0; i < size; i++) {
    if (i === size-1) {
      body += progress.data[i].ctx;
    } else {
      body += progress.data[i].ctx + ",";
    }
  }
  return this.conn.callWithToken(uploadToken, url, body, onret);
};

CallWithConn.prototype.mkBlock = function(uploadToken, blockSize, fileStream, size, onret) {
  var url = config.UP_HOST + "/mkblk/" + blockSize.toString();
  return this.callBinaryWithUptoken(uploadToken, url, fileStream, size, 0, onret);
};

CallWithConn.prototype.putBlock = function(uploadToken, ctx, offset, fileStream, size, onret) {
  var url = config.UP_HOST + "/bput/" + ctx + "/" + offset.toString();
  return this.callBinaryWithUptoken(uploadToken, url, fileStream, size, 0, onret);
};

// ------------------------------------------------------------------------------------------
