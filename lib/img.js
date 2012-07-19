/*
 * 图像处理接口，生成最终的缩略图预览URL
 * func mogrify() => string
 * opts = {
 *   "thumbnail": <ImageSizeGeometry>,
 *   "gravity": <GravityType>, =NorthWest, North, NorthEast, West, Center, East, SouthWest, South, SouthEast
 *   "crop": <ImageSizeAndOffsetGeometry>,
 *   "quality": <ImageQuality>,
 *   "rotate": <RotateDegree>,
 *   "format": <DestinationImageFormat>, =jpg, gif, png, tif, etc.
 *   "auto_orient": <TrueOrFalse>
 * }
 */
exports.mogrify = function(source_img_url, opts){
    opts = opts || {};
    var params_string = "", key = null, val = null;
    var keys = ["thumbnail", "gravity", "crop", "quality", "rotate", "format"];
    for (var i=0; i < keys.length; i++) {
        key = keys[i];
        if (undefined !== opts[key]) {
            params_string += '/' + key + '/' + opts[key];
        }
    }
    if(undefined !== opts.auto_orient && opts.auto_orient === true){params_string += "/auto-orient";}
    var query_params = 'imageMogr' + params_string;
	return source_img_url + '?' + query_params;
};
