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
  dst.host = src.host;
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
      "host": "",
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
  var filename = self.dataFile;
  fs.exists(filename, function(exists){
    if (!exists) {
      fs.openSync(filename, "a+");

      process.on('exit', function() {
        fs.unlinkSync(filename);
      });

      self.init();
      return;
    }
    fs.readFile(filename, function(err, data){
      if (err) {
        console.log("Load Progress error.");
      }
      if (data.length !== 0) {
        try{
          var myObj = JSON.parse(data);
        } 
        catch (e) {
          console.log("Catch load progress error.");
        }
        for (var i = 0; i < myObj.length; i++) {
          clone(self.data[i], myObj[i]);
        }
      };
    });
  });
};

Progress.prototype.saveProgress = function() {
  var self = this;
  var data = self.data;
  var filename = self.dataFile;
  fs.exists(filename, function(exists){
    if (!exists) {
      fs.openSync(filename, "w");
    }
    try{
      data = JSON.stringify(data);
    }
    catch (e) {
      console.log("Try stringify JSON data. Error: ", e.message);
    }
    fs.writeFile(filename, data, function(err){
      if (err) {
        console.log("Write Progress Error.");
      }
    });
  });
};

// ------------------------------------------------------------------------------------------


// ------------------------------------------------------------------------------------------
// ResumableUpload类

function ResumableUpload(conn, uploadToken, bucket, key, mimeType, customMeta, customer, callbackParams, rotate) {
  this.fd = 0;
  this.uploadToken = uploadToken;
  this.entryURI = bucket + ":" + key;
  this.mimeType = mimeType || null;
  this.customMeta = customMeta || null;
  this.customer = customer || null;
  this.callbackParams = callbackParams || null;
  this.rotate = rotate || "0";
  this.callWithConn = new CallWithConn(conn);
}

ResumableUpload.prototype.upload = function(filename, onret) {
  var self = this,
      success = 0;
      blockIndex = 0,
      fileStat = fs.statSync(filename),
      fileSize = fileStat.size,
      blockCnt = blockCount(fileSize),
      progress = new Progress(blockCnt),
      blockSize = config.BLOCK_SIZE;

  progress.loadProgress();
  if (progress.data.length === 0) { 
    progress.init(blockCnt);
  }
  self.fd = fs.openSync(filename, 'r');
  process.on('exit', function(){
    fs.close(self.fd);
  });
  console.log("Block numbers: ", blockCnt);
  for (; blockIndex < blockCnt; blockIndex++) {
    if (progress.data[blockIndex].checksum === "") {
      if (blockIndex === blockCnt - 1) {
        blockSize = fileSize - blockIndex * config.BLOCK_SIZE;
      }
      self.uploadBlock(filename, blockIndex, blockSize, progress, function(resp){
        if (resp.success) {
          console.log("Upload block success!");
          success += 1;
        }
        if (success >= blockCnt) {
          self.callWithConn.mkFile(resp.host, self.uploadToken, self.entryURI, fileSize, progress, self.mimeType, self.customMeta, self.customer, self.callbackParams, self.rotate, onret);
        }
      });
    }
  }
};

ResumableUpload.prototype.uploadBlock = function(filename, blockIndex, blockSize, progress, onret) {
  var buf,
      end,
      host,
      start,
      response,
      bytesRead,
      restsize,
      bodyCrc32,
      bodyLength,
      fileStream,
      self = this,
      mkBlockSuccess = false;

  if (progress.data[blockIndex].ctx === "") {
    progress.data[blockIndex].offset = 0;
    progress.data[blockIndex].restsize = blockSize;

    bodyLength = blockSize > config.CHUNK_SIZE ? config.CHUNK_SIZE : blockSize;
    start = blockIndex * config.BLOCK_SIZE;
    end = start + bodyLength;
    buf = new Buffer(bodyLength);
    bytesRead = fs.readSync(self.fd, buf, 0, bodyLength, start);

    if (bytesRead !== bodyLength) {
      console.log("Can not read exact content from file!");
      return;
    }
    bodyCrc32 = parseInt("0x" + crc32(buf));
    fileStream = fs.createReadStream(filename, {start: start, end: end});
    fileStream.on("error", function(exception){ 
//      console.log("Exception(uploadBlock): ", exception);
    });
    fileStream.on('close', function(){
//      console.log("Stream closed(uploadBlock).");
    });

    self.callWithConn.mkBlock(self.uploadToken, blockSize, fileStream, bodyLength, function(resp){
      if (responseOK(resp.code) && (resp.data["crc32"] === bodyCrc32)) {
        progress.data[blockIndex].host = host = resp.data["host"];
        progress.data[blockIndex].ctx = resp.data["ctx"];
        progress.data[blockIndex].crc32 = resp.data["crc32"];
        progress.data[blockIndex].checksum = resp.data["checksum"];
        progress.data[blockIndex].offset += bodyLength;
        progress.data[blockIndex].restsize -= bodyLength;
        progress.saveProgress();

        restsize = progress.data[blockIndex].restsize;
        if (restsize === 0) {
          response = {
            success: true,
            host: host
          };    
          onret(response);
        } else {
          start = end;
          end = start + bodyLength;
          self.runUploadChunk(host, filename, restsize, progress, blockIndex, start, end, onret);
        }
      } 
    }); 
  } else if((progress.data[blockIndex].offset + progress.data[blockIndex].restsize) !== blockSize){
    console.log("Block size not match!");
  }
};

ResumableUpload.prototype.runUploadChunk = function(host, filename, restsize, progress, blockIndex, start, end, onret){
  var self = this,
      buf,
      newEnd,
      newStart,
      bodyLength,
      response,
      bodyCrc32,
      fileStream = fs.createReadStream(filename, {start: start, end: end}),
      ctx = progress.data[blockIndex].ctx,
      offset = progress.data[blockIndex].offset;
  
  fileStream.on("error", function(exception){ 
//    console.log("Exception(runUploadChunk): ", exception);
  });
  
  fileStream.on('close', function(){
//    console.log("Stream closed(runUploadChunk).");
  });

  if (restsize <= 0){
    response = {
      success: true,
      host: host 
    };
    return onret(response);
  }
  bodyLength = restsize > config.CHUNK_SIZE ? config.CHUNK_SIZE : restsize;
  buf = new Buffer(bodyLength);
  bytesRead = fs.readSync(self.fd, buf, 0, bodyLength, start);
  if (bytesRead !== bodyLength) {
    console.log("Can not read exact content from file!");
    return;
  }

  bodyCrc32 = parseInt("0x" + crc32(buf));

  self.callWithConn.putBlock(host, self.uploadToken, ctx, offset, fileStream, bodyLength, function(resp){
    if (responseOK(resp.code) && (resp.data["crc32"] === bodyCrc32)) {
      progress.data[blockIndex].host = host = resp.data["host"];
      progress.data[blockIndex].ctx = resp.data["ctx"];
      progress.data[blockIndex].crc32 = resp.data["crc32"];
      progress.data[blockIndex].checksum = resp.data["checksum"];
      progress.data[blockIndex].offset += bodyLength;
      progress.data[blockIndex].restsize -= bodyLength;
      progress.saveProgress();
      restsize = progress.data[blockIndex].restsize;
      if (restsize <= 0){
        response = {
          success: true,
          host: host
        }
        return onret(response);
      }
      newStart = end;
      newEnd = newStart + bodyLength;
      return self.runUploadChunk(host, filename, restsize, progress, blockIndex, newStart, newEnd, onret);
    } else {
      // 如果上传失败，会自动进行无限次重试
      console.log("Retry uploading...");
      return self.runUploadChunk(host, filename, restsize, progress, blockIndex, start, end, onret);
    }
  });
};

// ------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------
// CallWithConn类

function CallWithConn(conn) {
  this.conn = conn;
}

CallWithConn.prototype.callBinaryWithUptoken = function(uploadToken, url, fileStream, size, onret) {
  var binary = new util.Binary(fileStream, size);
  return this.conn.callWithToken(uploadToken, url, binary, onret);
};

CallWithConn.prototype.mkFile = function(host, uploadToken, entryURI, fileSize, progress, mimeType, customMeta, customer, callbackParams, rotate, onret) {
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
  if ((rotate !== undefined) && (rotate !== null) && (parseInt(rotate) > 0)) {
    url += '/rotate/' + rotate;
  }
  url = host + url;
  var body = '';
  var size = progress.data.length;
  for (var i = 0; i < size; i++) {
    if (i === size-1) {
      body += progress.data[i].ctx;
    } else {
      body += progress.data[i].ctx + ",";
    }
  }
  body = new util.Txt(body, 'text/plain');
  return this.conn.callWithToken(uploadToken, url, body, onret);
};

CallWithConn.prototype.mkBlock = function(uploadToken, blockSize, fileStream, size, onret) {
  var url = config.UP_HOST + "/mkblk/" + blockSize.toString();
  return this.callBinaryWithUptoken(uploadToken, url, fileStream, size, onret);
};

CallWithConn.prototype.putBlock = function(host, uploadToken, ctx, offset, fileStream, size, onret) {
  var url = host + "/bput/" + ctx + "/" + offset.toString();
  return this.callBinaryWithUptoken(uploadToken, url, fileStream, size, onret);
};

// ------------------------------------------------------------------------------------------
