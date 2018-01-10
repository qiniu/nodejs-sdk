function addUploadBoard(file, config, key, type) {
  var count = Math.ceil(file.size / config.BLOCK_SIZE);
  //let board = document.getElementById("process");
  var board = widget.add("tr", {
    data: { num: count, name: key, size: file.size },
    node: document.getElementById("fsUploadProgress" + type)
  });
  count > 1 ? "" : board.querySelector(".resume").classList.add("hide");
  return board;
}

function getBoardWidth(board) {
  var total_width = board.querySelector("#total").offsetWidth;
  board.querySelector(".fragment-group").classList.remove("hide");
  var child_width = board
    .querySelector(".fragment-group li")
    .querySelector("#bar-parent").offsetWidth;
  board.querySelector(".fragment-group").classList.add("hide");
  return { totalWidth: total_width, childWidth: child_width };
}

function controlTabDisplay(type) {
  switch (type) {
    case "sdk":
      document.querySelector(".box2").classList.remove("hide");
      document.querySelector(".box").classList.add("hide");
      break;
    case "others":
      document.querySelector(".box2").classList.add("hide");
      document.querySelector(".box").classList.remove("hide");
      break;
    case "form":
      document.querySelector(".box").classList.add("hide");
      document.querySelector(".box2").classList.add("hide");
      break;
  }
}

