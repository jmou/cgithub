// Progressive enhancement for the bits of data GitHub itself loads lazily:
// the branch/tag dropdown, the latest-commit bar above a file listing, and the
// language breakdown. All degrade gracefully without JS: the button's
// command/commandfor still opens the (empty) dialog natively; the placeholders
// just never fill in.
document.addEventListener("DOMContentLoaded", () => {
  const dialog = document.querySelector(".ref-selector-menu");
  if (dialog) {
    const list = dialog.querySelector(".ref-selector-list");
    const { owner, repo } = dialog.dataset;
    const cache = {};

    async function load(type) {
      if (Object.prototype.hasOwnProperty.call(cache, type)) {
        list.innerHTML = cache[type];
        return;
      }
      list.textContent = "Loading…";
      try {
        const res = await fetch(`/api/${owner}/${repo}/refs/${type}`);
        const html = res.ok ? await res.text() : "";
        cache[type] = html || "Failed to load.";
        list.innerHTML = cache[type];
      } catch {
        list.textContent = "Failed to load.";
      }
    }

    let opened = false;
    dialog.addEventListener("toggle", () => {
      if (dialog.open && !opened) {
        opened = true;
        load("branches");
      }
    });

    for (const tab of dialog.querySelectorAll("[data-ref-type]")) {
      tab.addEventListener("click", () => {
        for (const other of dialog.querySelectorAll("[data-ref-type]")) {
          other.classList.toggle("active", other === tab);
        }
        load(tab.dataset.refType);
      });
    }
  }

  for (const placeholder of document.querySelectorAll(".placeholder[data-src]")) {
    fetch(placeholder.dataset.src)
      .then((res) => (res.ok ? res.text() : ""))
      .then((html) => {
        if (html.trim()) {
          placeholder.outerHTML = html;
        } else {
          placeholder.remove();
        }
      })
      .catch(() => placeholder.remove());
  }
});
