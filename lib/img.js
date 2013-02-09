/*
 * 图像处理接口，生成图像处理的参数
 * func mkMogrifyParams() => string
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
exports.mkMogrifyParams = function(opts){
    opts = opts || {};
    var keys = ["thumbnail", "gravity", "crop", "quality", "rotate", "format"];
    var params_string = "", key = null, val = null;
    if (undefined !== opts.auto_orient && opts.auto_orient === true){
        params_string += "/auto-orient";
    }
    for (var i=0; i < keys.length; i++) {
        key = keys[i];
        if (undefined !== opts[key]) {
            params_string += '/' + key + '/' + opts[key];
        }
    }
    return 'imageMogr' + params_string;
};

/*
 * 图像处理接口，生成最终的缩略图预览URL
 */
exports.mogrify = function(source_img_url, opts){
    return source_img_url + '?' + this.mkMogrifyParams(opts);
};
