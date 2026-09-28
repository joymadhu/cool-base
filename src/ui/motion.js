import { $, reduceMotion } from "../lib/dom.js";

// Scroll reveals, sliding nav highlight, scroll progress bar and pointer-following glow/tilt.
export function initMotion() {
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("shown");
      revealIO.unobserve(e.target);
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal").forEach((el) => {
    const sibs = [...el.parentElement.children].filter((c) => c.classList.contains("reveal"));
    el.style.setProperty("--d", Math.min(sibs.indexOf(el), 8) * 0.07 + "s");
    revealIO.observe(el);
  });

  const nav = $("nav"), ink = $("navInk");
  const links = [...nav.querySelectorAll("a")];
  function moveInk(a) {
    if (!a) { ink.style.opacity = 0; return; }
    ink.style.opacity = 1;
    ink.style.width = a.offsetWidth + "px";
    ink.style.transform = `translateX(${a.offsetLeft}px)`;
    links.forEach((l) => l.classList.toggle("active", l === a));
  }
  const sectionIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && scrollY >= 200) moveInk(links.find((l) => l.getAttribute("href") === "#" + e.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  links.forEach((l) => { const s = document.querySelector(l.getAttribute("href")); if (s) sectionIO.observe(s); });

  const topbar = $("topbar"), progress = $("progress");
  let scrollQueued = false;
  addEventListener("scroll", () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
      topbar.classList.toggle("scrolled", scrollY > 10);
      if (scrollY < 200) moveInk(null);
    });
  }, { passive: true });

  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest?.(".card, .meme");
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    el.style.setProperty("--mx", x + "px");
    el.style.setProperty("--my", y + "px");
    if (el.classList.contains("meme") && !reduceMotion) {
      const rx = (y / r.height - 0.5) * -10, ry = (x / r.width - 0.5) * 12;
      el.style.transform = `perspective(700px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-4px)`;
    }
  }, { passive: true });
  document.addEventListener("pointerout", (e) => {
    const el = e.target.closest?.(".meme");
    if (el && !el.contains(e.relatedTarget)) el.style.transform = "";
  });
}
