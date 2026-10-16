// The one 3D moment on the page: a small kraft parcel.
// Loaded lazily from Hero.astro. Throws if WebGL is unavailable so the caller
// can keep the plain fallback.
import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  BoxGeometry,
  PlaneGeometry,
  HemisphereLight,
  DirectionalLight,
  CanvasTexture,
  SRGBColorSpace,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function initParcel(canvas: HTMLCanvasElement, host: HTMLElement, reduceMotion: boolean) {
  const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.9, 8.2);
  camera.lookAt(0, 0, 0);

  scene.add(new HemisphereLight(0xffffff, 0xb9bfe8, 1.5));
  const sun = new DirectionalLight(0xffffff, 2.6);
  sun.position.set(-3, 5, 4);
  scene.add(sun);

  // ── Parcel ────────────────────────────────────────────
  const W = 2.4, H = 1.55, D = 1.7;
  const parcel = new Group();

  const kraft = new MeshStandardMaterial({ color: 0xf2b04a, roughness: 0.82, metalness: 0 });
  const tapeMat = new MeshStandardMaterial({ color: 0xd9962f, roughness: 0.6, metalness: 0 });
  const labelMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const inkMat = new MeshStandardMaterial({ color: 0x1b2158, roughness: 0.9 });

  parcel.add(new Mesh(new RoundedBoxGeometry(W, H, D, 4, 0.1), kraft));

  // Tape wraps over the top and down both long sides
  const tape = new Mesh(new BoxGeometry(0.34, H + 0.012, D + 0.012), tapeMat);
  parcel.add(tape);

  // Shipping label on the front face
  const label = new Mesh(new BoxGeometry(0.82, 0.54, 0.012), labelMat);
  label.position.set(0.62, -0.18, D / 2 + 0.008);
  parcel.add(label);
  [0.56, 0.5, 0.44, 0.3].forEach((w, i) => {
    const line = new Mesh(new BoxGeometry(w, 0.045, 0.014), inkMat);
    // left-aligned to the label's inner edge
    line.position.set(0.62 - 0.33 + w / 2, -0.18 + 0.16 - i * 0.12, D / 2 + 0.016);
    parcel.add(line);
  });

  parcel.rotation.set(0.28, -0.6, 0);
  scene.add(parcel);

  // Soft contact shadow, baked into a texture
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(27,33,88,0.38)');
  grad.addColorStop(1, 'rgba(27,33,88,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const contactTex = new CanvasTexture(c);
  contactTex.colorSpace = SRGBColorSpace;
  const contact = new Mesh(
    new PlaneGeometry(4.6, 4.6),
    new MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false })
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = -1.5;
  scene.add(contact);

  // ── Sizing ────────────────────────────────────────────
  function resize() {
    const { clientWidth: w, clientHeight: h } = host;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the parcel fully visible on narrow stages
    camera.position.z = camera.aspect < 1.2 ? 8.2 + (1.2 - camera.aspect) * 6 : 8.2;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  // ── Motion: pointer-tilt + idle float, damped (never snaps) ──
  const target = { x: 0, y: 0 };
  const state = { x: 0, y: 0, enter: 0 };
  const base = { x: 0.28, y: -0.6 };
  const hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (hasHover && !reduceMotion) {
    window.addEventListener('pointermove', (e) => {
      target.x = (e.clientY / window.innerHeight - 0.5) * 0.35;
      target.y = (e.clientX / window.innerWidth - 0.5) * 0.7;
    }, { passive: true });
  }

  const render = (t: number) => {
    state.enter += (1 - state.enter) * 0.045;
    state.x += (target.x - state.x) * 0.06;
    state.y += (target.y - state.y) * 0.06;
    const float = reduceMotion ? 0 : Math.sin(t / 1100) * 0.07;
    const settle = 1 - state.enter;
    parcel.rotation.x = base.x + state.x + settle * 0.5;
    parcel.rotation.y = base.y + state.y - settle * 1.4 + (reduceMotion ? 0 : Math.sin(t / 2600) * 0.09);
    parcel.position.y = float;
    const s = 0.86 + state.enter * 0.14;
    parcel.scale.setScalar(s);
    const k = 1 - float * 0.5;
    contact.scale.setScalar(k * s);
    renderer.render(scene, camera);
  };

  // ── Loop only while on screen and tab is visible ──────
  if (reduceMotion) {
    state.enter = 1;
    render(0);
    return;
  }

  let raf = 0;
  let onScreen = true;
  const tick = (t: number) => {
    render(t);
    raf = requestAnimationFrame(tick);
  };
  const sync = () => {
    const run = onScreen && !document.hidden;
    if (run && !raf) raf = requestAnimationFrame(tick);
    if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  render(0); // never leave a blank canvas if the host starts off-screen
  new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; sync(); }).observe(host);
  document.addEventListener('visibilitychange', sync);
  sync();
}
