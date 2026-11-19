// Gentle verse carousel. Respects reduced-motion (all verses shown stacked, no autoplay). Pauses on hover and focus.
(function () {
  const stage = document.getElementById("vstage"); if (!stage) return;
  const items = [...stage.querySelectorAll(".verse")], dots = document.getElementById("vDots");
  const still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still) { stage.classList.add("stacked"); document.querySelector(".vnav").hidden = true; return; }
  let i = 0, timer = null;
  items.forEach((_, n) => { const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", "Verse " + (n + 1)); b.addEventListener("click", () => go(n, true)); dots.appendChild(b); });
  function go(n, user) { i = (n + items.length) % items.length; items.forEach((el, k) => { el.classList.toggle("on", k === i); el.setAttribute("aria-hidden", String(k !== i)); }); [...dots.children].forEach((d, k) => d.setAttribute("aria-current", String(k === i))); if (user) restart(); }
  function restart() { clearInterval(timer); timer = setInterval(() => go(i + 1), 16000); }
  document.getElementById("vPrev").addEventListener("click", () => go(i - 1, true));
  document.getElementById("vNext").addEventListener("click", () => go(i + 1, true));
  const sec = document.getElementById("verses"); ["mouseenter", "focusin"].forEach(e => sec.addEventListener(e, () => clearInterval(timer))); ["mouseleave", "focusout"].forEach(e => sec.addEventListener(e, restart));
  go(0); restart();
})();
