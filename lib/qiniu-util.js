// ------------------------------------------------------------------------------------------
// func encode

exports.base64ToUrlsafe = function(v) {
    v = v.replace(/\n|\r|\t/g,"");
    return v.replace(/\+/g, '-').replace(/\//g, '_');
}

exports.encode = function(v) {
	var encoded = new Buffer(v || '').toString('base64');
	return exports.base64ToUrlsafe(encoded);
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
}

// ------------------------------------------------------------------------------------------
// type Binary

function Binary(stream, bytes) {
	this.stream = stream;
	this.bytes = bytes;
}

exports.Binary = Binary;
