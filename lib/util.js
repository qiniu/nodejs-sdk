var fs = require('fs');
var crypto = require('crypto');

// ------------------------------------------------------------------------------------------
// func encode

exports.base64ToUrlsafe = function(v) {
	return v.replace(/\//g, '_').replace(/\+/g, '-');
};

exports.encode = function(v) {
	var encoded = new Buffer(v || '').toString('base64');
	return exports.base64ToUrlsafe(encoded);
};

exports.generateActionString = function(localFile, bucket, key, mimeType, customMeta, enableCrc32Check) {
  if (!fs.existsSync(localFile)) {
    return;
  }
  var today = new Date();
  var key = crypto.createHash('sha1').update(localFile + today.toString()).digest('hex');
  var entryUri = bucket + ":" + key;
  if (mimeType === "") {
    mimeType = mime.lookup(localFile);
    if (mimeType === "") {
      mimeType = "application/octet-stream";
    }
  }
  var actionParams = '/rs-put/' + this.encode(entryUri) + '/mimeType/' + this.encode(mimeType);
  if (customMeta !== "") {
    actionParams += '/meta/' + this.encode(customMeta);
  }
  /*
  if (enableCrc32Check) {
    var fileContent = fs.readFileSync(localFile);
    actionParams += '/crc32/' + this.crc32(fileContent, "").toString();
  }
 */
  return actionParams;
}

exports.generateQueryString = function (params) {
  if (params.constructor === String) {
    return params;
  }
  var total_params = [];
  for (var key in params) {
    total_params.push(escape(key) + "=" + escape(params[key]));
  }
  total_params.join("&");
}

// ------------------------------------------------------------------------------------------
// func readAll

exports.readAll = function(strm, ondata) {
	var out = [];
	var total = 0;
	strm.on('data', function(chunk) {
		out.push(chunk);
		total += chunk.length;
	});
	strm.on('end', function() {
		var data;
		switch (out.length) {
		case 0:
			data = new Buffer(0);
			break;
		case 1:
			data = out[0];
			break;
		default:
			data = new Buffer(total);
			var pos = 0;
			for (var i = 0; i < out.length; i++) {
				var chunk = out[i];
				chunk.copy(data, pos);
				pos += chunk.length;
			}
		}
		ondata(data);
	});
};

// ------------------------------------------------------------------------------------------
// type Binary

function Binary(stream, bytes) {
	this.stream = stream;
	this.bytes = bytes;
}

exports.Binary = Binary;

// type Form

function Form(stream, contentType) {
	this.stream = stream;
	this.contentType = contentType;
}

exports.Form = Form;
// ------------------------------------------------------------------------------------------

