(function() {
  var parent =
    '<div id="total" style="width:80%;height:30px;border:1px solid;border-radius:3px">' +
    '<div id="bar" style="width:0;border:0;background-color:aqua;height:20px;"></div></div>' +
    '<ul id="fragment-group">' +
    "</ul>";
  var init = function(obj) {
    var data = obj.data;
    obj.node.innerHTML = parent;
    for (var i = 0; i < data.num; i++) {
      widget.add("li", {
        data: "",
        node: document.getElementById("fragment-group")
      });
    }
  };
  widget.register("tr", {
    init: init
  });
})();

(function() {
  var li_children =
    '<div id="total" style="width:100%;height:20px;border:1px solid;border-radius:3px">' +
    '<div id="bar" style="width:0;border:0;background-color:aqua;height:20px;">' +
    "</div>" +
    "</div>";

  var init = function(obj) {
    var li = document.createElement("li");
    li.setAttribute("class", "fragment");
    li.innerHTML = li_children;
    obj.node.appendChild(li);
  };
  widget.register("li", {
    init: init
  });
})();
