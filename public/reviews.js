// Shows approved member reviews on the home page. Text is inserted as plain text, never as HTML.
(async () => {
  const box = document.getElementById("reviewList"); if (!box) return;
  try {
    const r = await fetch("/api/reviews"); if (!r.ok) return;
    const { reviews } = await r.json(); if (!reviews || !reviews.length) return;
    document.getElementById("storiesNote").textContent = "Shared by our members and approved by our team.";
    for (const v of reviews) {
      const f = document.createElement("figure"); f.className = "review";
      const st = document.createElement("p"); st.className = "stars"; st.setAttribute("aria-label", v.rating + " out of 5"); st.textContent = "★".repeat(v.rating) + "☆".repeat(5 - v.rating);
      const q = document.createElement("blockquote"); q.textContent = v.body;
      const c = document.createElement("figcaption"); c.textContent = [v.name, v.city].filter(Boolean).join(", ") || "PiousHalf member";
      f.append(st, q, c); box.append(f);
    }
  } catch {}
})();
