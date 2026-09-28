import { $ } from "../lib/dom.js";

// Scroll reveals, sliding nav highlight, scroll progress bar and scroll-state header.
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

  // Nav: a soft pill follows the pointer, a pixel-bordered pill marks the current section.
  const nav = $("nav"), ink = $("navInk"), hover = $("navHover");
  const links = [...nav.querySelectorAll("a")];
  const mobileLinks = [...document.querySelectorAll("#mobileMenu a")];
  const place = (pill, a) => {
    pill.style.width = a.offsetWidth + "px";
    pill.style.transform = `translateX(${a.offsetLeft}px)`;
  };
  let active = null;
  function setActive(id) {
    active = links.find((l) => l.getAttribute("href") === "#" + id) || null;
    links.forEach((l) => l.classList.toggle("active", l === active));
    mobileLinks.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === "#" + id));
    if (active) { place(ink, active); ink.style.opacity = 1; } else ink.style.opacity = 0;
  }
  links.forEach((a) => {
    a.addEventListener("pointerenter", () => {
      if (a === active) { hover.style.opacity = 0; return; }
      // Jump into place without sliding when the pointer first enters the nav.
      if (hover.style.opacity !== "1") { hover.style.transition = "none"; place(hover, a); void hover.offsetWidth; hover.style.transition = ""; }
      place(hover, a);
      hover.style.opacity = 1;
    });
    a.addEventListener("click", () => setActive(a.getAttribute("href").slice(1)));
  });
  nav.addEventListener("pointerleave", () => (hover.style.opacity = 0));

  const sectionIds = ["overview", "volume", "blocks", "activity", "tokens", "memes"];
  const sectionIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting && scrollY >= 200) setActive(e.target.id === "activity" ? "blocks" : e.target.id); });
  }, { rootMargin: "-45% 0px -50% 0px" });
  sectionIds.forEach((id) => { const s = $(id); if (s) sectionIO.observe(s); });
  addEventListener("resize", () => active && place(ink, active));
  document.fonts?.ready.then(() => active && place(ink, active));

  // Mobile menu
  const masthead = $("topbar"), menuBtn = $("menuBtn");
  const setMenu = (open) => {
    masthead.classList.toggle("menu-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  };
  menuBtn.addEventListener("click", () => setMenu(!masthead.classList.contains("menu-open")));
  mobileLinks.forEach((a) => a.addEventListener("click", () => setMenu(false)));
  addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  const progress = $("progress");
  let scrollQueued = false;
  addEventListener("scroll", () => {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
      masthead.classList.toggle("scrolled", scrollY > 10);
      if (scrollY < 200 && active) setActive(null);
    });
  }, { passive: true });

}
