async (page) => {
  var data = await page.evaluate(() => {
    var headings = document.querySelectorAll("h2, h3");
    var lbSection = null;
    for (var i = 0; i < headings.length; i++) {
      var text = headings[i].textContent;
      if (text.includes("LLM Leaderboard") || text.includes("Leaderboard")) {
        lbSection = headings[i].closest("div");
        break;
      }
    }
    if (!lbSection) return { entries: [] };
    var container = lbSection;
    while (container && container.querySelectorAll('a[href*="/"]').length < 3) {
      container = container.parentElement;
    }
    var raw = container ? container.innerText : "";
    var lines = raw.split("\n").filter(function(l) { return l.trim(); });
    var entries = [];
    for (var j = 0; j < lines.length; j++) {
      var match = lines[j].match(/^(\d+)\.$/);
      if (match && j + 3 < lines.length) {
        var rank = parseInt(match[1]);
        var model = lines[j + 1];
        var author = (lines[j + 2] === "by" && lines[j + 3]) ? lines[j + 3] : lines[j + 2];
        var tokens = "";
        for (var k = j + 2; k < Math.min(j + 6, lines.length); k++) {
          if (lines[k].indexOf("tokens") > -1) {
            tokens = lines[k].replace(/(\d)(tokens)/gi, "$1 $2").replace(/([TGBMK])(tokens)/gi, "$1 $2");
            break;
          }
        }
        entries.push({ rank: rank, model: model, author: author, tokens: tokens });
      }
    }
    return { entries: entries };
  });
  return JSON.stringify(data);
}
