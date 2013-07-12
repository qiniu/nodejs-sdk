

exports.UNDEDINED_KEY = '?';
exports.BlkputRet = BlkputRet;
exports.PutExtra = PutExtra;
exports.PutRet = PutRet;
exports.put = put;
exports.putFile = putFile;
exports.blockCount = blockCount;
exports.Settings = Settings;
exports.setSettings = setSettings;

function BlkputRet(ctx, checksum, crc32, offset) {
  this.ctx = ctx || null;
  this.checksum = checksum || null;
  this.crc32 = crc32 || null;
  this.offset = offset || null;
}

function PutExtra(params, mimeType, chunkSize, tryTimes, 
                  progresses, notify, notifyErr){
  this.params = params || {};
  this.mimeType = mimeType || null;
  this.chunkSize = chunkSize || null;
  this.tryTimes = tryTimes || null;
  this.progresses = progresses || [];
  this.notify = notify || null;
  this.notifyErr = notifyErr || null;
}

function PutRet(hash, key) {
  this.hash = hash || null;
  this.key = key || null;
}

function put(ret, uptoken, key, f, fsize, extra) {

}

function putFile(ret, uptoken, key, localFile, extra) {

}

function blockCount(fsize) {

}

function Settings(taskQsize, workers, chunkSize, tryTimes) {
  this.taskQsize = taskQsize || null;
  this.workers = workers || null;
  this.chunkSize = chunkSize || 256;  // 256k
  this.tryTimes = tryTimes || 3;
}

function setSettings(settings) {

}
