// Preview adaptation (accessibility only). In the original, the eleven spell icons in the grid
// respond to mouse clicks only. This makes each icon focusable and operable with Enter or Space
// by forwarding to the icon's own original onclick (toggleSpell). Mouse behaviour, markup and
// visuals are unchanged; aria-pressed mirrors the original grey-out state.
(function () {
  var icons = document.querySelectorAll(".container .col > img[onclick]");
  Array.prototype.forEach.call(icons, function (img) {
    img.tabIndex = 0;
    img.setAttribute("role", "button");
    img.setAttribute("aria-label", "Toggle " + img.id);
    var sync = function () {
      img.setAttribute("aria-pressed", String(!/grayscale/.test(img.style.filter)));
    };
    sync();
    new MutationObserver(sync).observe(img, { attributes: true, attributeFilter: ["style"] });
    img.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        img.click();
      }
    });
  });
})();
