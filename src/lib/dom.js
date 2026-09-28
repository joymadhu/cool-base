export const $ = (id) => document.getElementById(id);
export const root = document.documentElement;
export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function stamp() {
  $("updated").textContent = "Updated " + new Date().toLocaleTimeString();
}
