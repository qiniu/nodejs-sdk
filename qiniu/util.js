// ------------------------------------------------------------------------------------------
// func encode

exports.base64ToUrlsafe = function(v) {
	return v.replace(/\//g, '_').replace(/\+/g, '-');
}

exports.encode = function(v) {
	var encoded = new Buffer(v || '').toString('base64');
	return exports.base64ToUrlsafe(encoded);
}

// ------------------------------------------------------------------------------------------
// type Binary

function Binary(stream, bytes) {
	this.stream = stream;
	this.bytes = bytes;
}

exports.Binary = Binary;

// ------------------------------------------------------------------------------------------

