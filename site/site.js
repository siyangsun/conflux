// Click-to-load embeds: swap the thumbnail button for the iframe.
document.addEventListener("click", (e) => {
  const b = e.target.closest(".embed");
  if (!b) return;
  const f = document.createElement("iframe");
  f.src = b.dataset.src;
  f.height = b.dataset.h;
  f.allow = "autoplay;encrypted-media;fullscreen";
  f.allowFullscreen = true;
  f.className = "embed";
  b.replaceWith(f);
});

// "checked N min ago" from the latest successful workflow run; falls back to the baked-in build time.
(() => {
  const el = document.getElementById("checked");
  if (!el) return;
  const ago = (t) => {
    const m = Math.max(0, Math.round((Date.now() - new Date(t)) / 6e4));
    return m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago";
  };
  const show = (p, t) => (el.textContent = p + " " + ago(t));
  show("updated", el.dataset.built);
  if (location.hostname === "localhost") return; // the repo's run history is only meaningful on the deployed site
  fetch("https://api.github.com/repos/" + el.dataset.repo + "/actions/workflows/feed.yml/runs?per_page=1&status=success")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((j) => {
      const t = j.workflow_runs[0] && j.workflow_runs[0].updated_at;
      if (t) show("checked", t);
    })
    .catch(() => {});
})();

// Search page: load search.json once, show items containing every word typed.
(() => {
  const q = document.getElementById("q");
  if (!q) return;
  const out = document.getElementById("results");
  let rows;
  const run = () => {
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    out.replaceChildren();
    if (!rows || !words.length) return;
    for (const r of rows.filter((r) => words.every((w) => r[4].includes(w))).slice(0, 100)) {
      const li = document.createElement("li"), a = document.createElement("a"), m = document.createElement("span");
      a.href = r[1];
      a.textContent = r[0];
      m.className = "meta";
      m.textContent = " " + r[3] + " · " + r[2];
      li.append(a, m);
      out.append(li);
    }
  };
  q.addEventListener("input", run);
  fetch(q.dataset.src).then((r) => r.json()).then((j) => { rows = j; run(); });
})();
