/* Opening splash: the logo, a yellow taxi crossing the bridge as the city loads, then a fade into the title. */
const MIN_SHOW = 2400; // ms, so the intro plays out even on a fast load

const el = document.getElementById('splash');
const fill = el.querySelector('.sp-fill');
const car = el.querySelector('.sp-carpos');
const text = el.querySelector('.sp-text');
const pct = el.querySelector('.sp-pct');

let target = 0;
let shown = 0;
let raf = 0;

// the percentage counts up smoothly towards the last reported progress
function tick() {
  shown += (target - shown) * 0.12;
  if (target - shown < 0.002) shown = target;
  pct.textContent = `${Math.round(shown * 100)}%`;
  raf = shown < target ? requestAnimationFrame(tick) : 0;
}

export const splash = {
  progress(p, label) {
    target = Math.max(target, p);
    // transforms only, so they keep animating while the main thread is busy building the city
    fill.style.transform = `scaleX(${target})`;
    car.style.transform = `translateX(${target * 100}%)`;
    if (label && text.textContent !== label) {
      text.classList.remove('swap');
      void text.offsetWidth; // restart the fade
      text.textContent = label;
      text.classList.add('swap');
    }
    if (!raf) raf = requestAnimationFrame(tick);
  },
  async done() {
    this.progress(1, 'Welcome to Kolkata');
    const wait = MIN_SHOW - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    el.classList.add('out');
    setTimeout(() => el.remove(), 1200);
  },
  error(msg) {
    el.classList.add('failed');
    text.textContent = msg;
  },
};
