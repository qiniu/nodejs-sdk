function dealWithOthers(token, putExtra, config) {
  controlTabDisplay("others");
  var uploadUrl = qiniu.getUploadUrl(config);
  var ctx = "";
  var board = {};
  var chunk_size;
  var isfirstAddBoard = true;
  var width;
  var speedCalInfo = {
    isResumeUpload: false,
    resumeFilesize: 0,
    startTime: "",
    currentTime: ""
  };
  var uploader = new plupload.Uploader({
    runtimes: "html5,flash,silverlight,html4",
    url: uploadUrl,
    browse_button: "select", //触发文件选择对话框的按钮，为那个元素id
    flash_swf_url: "../js/Moxie.swf", //swf文件，当需要使用swf方式进行上传时需要配置该参数
    silverlight_xap_url: "../js/Moxie.xap",
    chunk_size: config.BLOCK_SIZE,
    multipart_params: {
      // token从服务端获取，没有token无法上传
      token: token
    },
    init: {
      PostInit: function() {
        console.log("upload init");
      },
      FilesAdded: function(up, files) {
        chunk_size = uploader.getOption("chunk_size");
        for (var i = 0; i < files.length; i++) {
          var id = files[i].id;
          //添加上传dom面板
          board[id] = addUploadBoard(files[i], config, files[i].name, "2");
          board[id].start = true;
          //拿到初始宽度来为后面方便进度计算
          if (isfirstAddBoard) {
            width = getBoardWidth(board[id]);
            isfirstAddBoard = false;
          }
          //绑定上传按钮开始事件
          board[id].querySelector(".control-upload").onclick = function() {
            if (board[id].start) {
              uploader.start();
              board[id].start = false;
              this.innerText = "暂停上传";
            } else {
              uploader.stop();
              board[id].start = "reusme";
              this.innerText = "继续上传";
            }
          };
        }
      },
      FileUploaded: function(up, file, info) {
        //{response: "{"hash":"FjTrY2r9G1pXtxiN-jAi6qb2E1tz","key":"FjTrY2r9G1pXtxiN-jAi6qb2E1tz"}", status: 200, responseHeaders: "Pragma: no-cache"}
        console.log(info);
      },
      UploadComplete: function(up, files) {
        // Called when all files are either uploaded or failed
        console.log("[完成]");
      },
      Error: function(up, err) {
        alert(err.response);
      }
    }
  });
  uploader.init();

  uploader.bind("BeforeUpload", function(uploader, file) {
    ctx = "";
    key = file.name;
    putExtra.params["x:name"] = key.split(".")[0];
    var id = file.id;
    chunk_size = uploader.getOption("chunk_size");
    var directUpload = function() {
      var multipart_params_obj = {};
      multipart_params_obj.token = token;
      if (putExtra.params) {
        //putExtra params
        for (var k in putExtra.params) {
          if (k.startsWith("x:") && putExtra.params[k]) {
            multipart_params_obj[k] = putExtra.params[k].toString();
          }
        }
      }
      multipart_params_obj.key = key;
      uploader.setOption({
        url: uploadUrl,
        multipart: true,
        multipart_params: multipart_params_obj
      });
    };

    var resumeUpload = function() {
      var localFileInfo = localStorage.getItem("qiniu_" + file.name);
      var blockSize = chunk_size;
      if (localFileInfo) {
        // TODO: although only the html5 runtime will enter this statement
        // but need uniform way to make convertion between string and json
        localFileInfo = JSON.parse(localFileInfo);
        var before = localFileInfo.time || 0;
        // if the last upload time is within one day
        //      will upload continuously follow the last breakpoint
        // else
        //      will reupload entire file
        if (!qiniu.checkExpire(before)) {
          if (localFileInfo.percent !== 100) {
            if (file.size === localFileInfo.total) {
              // TODO: if file.name and file.size is the same
              // but not the same file will cause error
              file.percent = localFileInfo.percent;
              file.loaded = localFileInfo.offset;
              ctx = localFileInfo.ctx;
              // set speed info
            }
            // set block size
            if (localFileInfo.offset + blockSize > file.size) {
              blockSize = file.size - localFileInfo.offset;
            }
          } else {
            // remove file info when file.size is conflict with file info
            localStorage.removeItem("qiniu_" + file.name);
          }
        } else {
          // remove file info when upload percent is 100%
          // avoid 499 bug
          localStorage.removeItem("qiniu_" + file.name);
        }
      } else {
        // remove file info when last upload time is over one day
        localStorage.removeItem("qiniu_" + file.name);
      }
      var multipart_params_obj = {};
      //计算已上传的chunk数量
      var index = Math.floor(file.loaded / chunk_size);
      var dom_total = board[id].querySelector("#total").querySelector("#bar");
      if (board[id].start != "reusme") {
        board[id].querySelector(".fragment-group").classList.add("hide");
      }
      dom_total.style.width =
        Math.floor(file.percent / 100 * width.totalWidth - 2) + "px";
      //初始化已上传的chunk进度
      for (var i = 0; i < index; i++) {
        var dom_finished = board[id]
          .querySelectorAll(".fragment-group li")
          [i].querySelector("#bar-child");
        dom_finished.style.width = Math.floor(width.childWidth - 2) + "px";
      }
      //var ie = that.detectIEVersion();
      // case IE 9-
      // add accept in multipart params
      // if (ie && ie <= 9) {
      //   multipart_params_obj.accept = "text/plain; charset=utf-8";
      //   logger.debug("add accept text/plain in multipart params");
      // }
      // TODO: to support bput
      // http://developer.qiniu.com/docs/v6/api/reference/up/bput.html
      uploader.setOption({
        url: uploadUrl + "/mkblk/" + blockSize,
        multipart: false,
        required_features: "chunks",
        headers: {
          Authorization: "UpToken " + token
        },
        multipart_params: multipart_params_obj
      });
    };
    //判断是否采取分片上传
    if ((uploader.runtime === 'html5' || uploader.runtime === 'flash') && chunk_size){
      if (file.size < chunk_size) {
        directUpload();
      } else {
        resumeUpload();
      }
    }else{
      console.log("directUpload because file.size < chunk_size || is_android_weixin_or_qq()")
      directUpload();
    }
  });

  uploader.bind("ChunkUploaded", function(up, file, info) {
    var res = JSON.parse(info.response);
    // ctx should look like '[chunk01_ctx],[chunk02_ctx],[chunk03_ctx],...'
    ctx = ctx ? ctx + "," + res.ctx : res.ctx;
    var leftSize = info.total - info.offset;
    var chunk_size = uploader.getOption && uploader.getOption("chunk_size");
    if (leftSize < chunk_size) {
      up.setOption({
        url: uploadUrl + "/mkblk/" + leftSize
      });
    }
    up.setOption({
      headers: {
        Authorization: "UpToken " + token
      }
    });
    localStorage.setItem(
      "qiniu_" + file.name,
      JSON.stringify({
        ctx: ctx,
        percent: file.percent,
        total: info.total,
        offset: info.offset,
        time: new Date().getTime()/1000
      })
    );
  });
  //每个事件监听函数都会传入一些很有用的参数，
  //我们可以利用这些参数提供的信息来做比如更新UI，提示上传进度等操作
  uploader.bind("UploadProgress", function(uploader, file) {
    var id = file.id;
    //更新进度条进度信息;
    var fileUploaded = file.loaded || 0;
    var width = board[id].querySelector("#total").offsetWidth;
    var dom_total = board[id].querySelector("#total").querySelector("#bar");
    var percent = file.percent + "%";
    dom_total.style.width = Math.floor(file.percent / 100 * width - 2) + "px";
    board[id].querySelector(".speed").innerText =
      "进度：" + percent;
    var count = Math.ceil(file.size / uploader.getOption("chunk_size"));
    if (file.size > chunk_size) {
      setChunkProgress(file, board[id], chunk_size, count);
    }
  });

  uploader.bind("FileUploaded", function(uploader, file) {
    if (ctx) {
      //调用sdk的url构建函数
      var id = file.id;
      var requestURI = qiniu.createFileUrl(uploadUrl, file, key, putExtra);
      var xhr = createAjax();
      xhr.open("POST", requestURI);
      xhr.setRequestHeader("Content-Type", "text/plain");
      let auth = "UpToken " + token;
      xhr.setRequestHeader("Authorization", auth);
      xhr.send(ctx);
      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (xhr.status === 200) {
            uploadFinish(this.responseText,board[id])
          } else {
            console.log(JSON.parse(this.responseText));
          }
        }
      };
    }
  });

  function setChunkProgress(file, board, chunk_size, count) {
    var index = Math.ceil(file.loaded / chunk_size);
    var leftSize = file.loaded - chunk_size * (index - 1);
    if (index == count) {
      chunk_size = file.size - chunk_size * (index - 1);
    }
    var dom = board
      .querySelectorAll(".fragment-group li")
      [index - 1].querySelector("#bar-child");
    dom.style.width = Math.floor(leftSize / chunk_size * width.childWidth - 2) + "px";
  }

  function uploadFinish(res,board){
    var data = JSON.parse(res)
    console.log(data);
    board.querySelector("#total").classList.add("hide");
    board.querySelector(".control-container").innerHTML =
      "<p><strong>Hash：</strong>" +
      data.hash +
      "</p>" +
      "<p><strong>Bucket：</strong>" +
      data.bucket +
      "</p>";
  }
}


