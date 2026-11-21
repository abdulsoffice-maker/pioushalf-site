// Light deterrents only: no website can fully stop a screenshot. Real protection is in the terms, the private storage and the server checks.
(() => {
  const guarded = el => el && el.closest && el.closest("img, .logo, .brand, .myphoto, .thumb");
  document.addEventListener("contextmenu", e => { if (guarded(e.target)) e.preventDefault(); });
  document.addEventListener("dragstart", e => { if (guarded(e.target)) e.preventDefault(); });
})();
