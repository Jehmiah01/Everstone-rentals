import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Scroll-driven 3D road for the homepage. Loaded on demand by scroll-road.tsx,
 * only on wide screens with motion allowed, so phones never download three.js.
 *
 * The road is drawn in page coordinates: one world unit is a fixed number of
 * CSS pixels and the camera follows window.scrollY, so the asphalt stays pinned
 * to its path through the sections while the lane dashes slide along it.
 */

const DASHES = 80;
const SAMPLES = 720; // asphalt strip resolution along the curve
const FOV = 24;
const CAM_Z = 40;

// Accent light per section: white at the hero, red at the fleet, cyan at booking.
const WHITE = new THREE.Color("#ffffff");
const RED = new THREE.Color("#C8102E"); // the site's brand red
const CYAN = new THREE.Color().setRGB(80 / 255, 220 / 255, 255 / 255, THREE.SRGBColorSpace);

const ASPHALT = new THREE.Color("#3b3f46");
const PAINT = new THREE.Color("#f4f5f1");
const RAIL = new THREE.Color("#c3c8cf");

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };

/** An element's box in page coordinates (CSS px from the top-left of the document). */
function pageBox(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY, bottom: r.bottom + scrollY, width: r.width, height: r.height };
}

function asphaltTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 205 + Math.random() * 50; // speckle, multiplied with the asphalt color
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fine lines along the rail's length, used as a roughness map for a brushed look. */
function brushedTexture() {
  const c = document.createElement("canvas");
  c.width = 4;
  c.height = 256;
  const g = c.getContext("2d");
  if (g) {
    for (let y = 0; y < 256; y++) {
      const v = Math.round(170 + Math.random() * 85);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(0, y, 4, 1);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Starts the road on `canvas`, measuring sections inside `root`.
 * Returns a stop function, or null if WebGL could not start.
 */
export function startRoad(canvas: HTMLCanvasElement, root: HTMLElement, onLost: () => void): (() => void) | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 400);
  camera.position.z = CAM_Z;
  scene.add(camera);

  // 6. Environment map so the metal edges have something to reflect.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(new RoomEnvironment(renderer), 0.04);
  scene.environment = envTarget.texture;

  // 7. Accent light rides with the camera; its color blends by section.
  const accent = new THREE.DirectionalLight(0xffffff, 2.6);
  accent.position.set(-6, 9, 14);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(8, -5, 10);
  camera.add(accent, accent.target, fill, fill.target);
  accent.target.position.set(0, 0, -CAM_Z);
  fill.target.position.set(0, 0, -CAM_Z);

  const asphaltMap = asphaltTexture();
  const brushedMap = brushedTexture();
  const asphalt = new THREE.MeshStandardMaterial({ color: ASPHALT, map: asphaltMap, roughness: 0.92, metalness: 0.04, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: RAIL.clone(), metalness: 0.85, roughness: 0.3, roughnessMap: brushedMap });
  const paint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 });

  // 3. Eighty lane dashes: one box, one InstancedMesh, one draw call.
  const dashGeo = new THREE.BoxGeometry(1, 1, 1);
  const dashes = new THREE.InstancedMesh(dashGeo, paint, DASHES);
  dashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dashes.frustumCulled = false;
  scene.add(dashes);

  let curve: THREE.CatmullRomCurve3 | null = null;
  let road: THREE.Mesh | null = null;
  let rails: THREE.Mesh[] = [];
  let anchors: { y: number; color: THREE.Color }[] = [];
  let points: THREE.Vector3[] = [];
  let roadW = 1, roadPx = 90, wpp = 1, vw = 1, vh = 1, length = 1, taperFrom = 0.92;

  /** 1. Measure the sections and place the road's control points beside them. */
  function measure(): boolean {
    vw = document.documentElement.clientWidth;
    vh = document.documentElement.clientHeight;
    const hero = root.querySelector("section");
    const fleet = root.querySelector("#fleet");
    const pickup = root.querySelector("#pickup");
    const end = root.querySelector("[data-road-end] a") ?? root.querySelector("[data-road-end]");
    if (!hero || !fleet || !pickup || !end) return false;

    const box = pageBox(hero.firstElementChild ?? hero); // the max-w-6xl content column
    const H = pageBox(hero), F = pageBox(fleet), P = pageBox(pickup), B = pageBox(end);
    const gridEl = fleet.querySelector(".grid");
    const G = gridEl ? pageBox(gridEl) : { ...F, top: F.top + F.height * 0.35, bottom: F.bottom - 48 };
    const availability = root.querySelector("#availability");
    const how = root.querySelector("#how");
    const requirements = root.querySelector("#requirements");

    const gutter = vw - box.right;
    roadPx = Math.min(110, Math.max(72, gutter * 0.7));
    // Run in the right-hand margin when it is wide enough, otherwise hug the window edge.
    const spine = gutter >= roadPx + 16 ? box.right + gutter / 2 : vw - roadPx * 0.35;
    const sway = Math.max(0, Math.min(18, (gutter - roadPx) / 2 - 6));
    const by = (B.top + B.bottom) / 2;

    const px: [number, number][] = [
      [spine, H.top - vh], // starts above the page, out of sight
      [box.left + box.width * 0.86, H.top + H.height * 0.12],
      [box.left + box.width * 0.8, H.top + H.height * 0.55], // through the open side of the hero
      [box.left + box.width * 0.84, F.top + (G.top - F.top) * 0.5], // beside the fleet heading
      [spine, G.top + 30], // alongside the car photos
      [spine - sway, (G.top + G.bottom) / 2],
      [spine, G.bottom],
    ];
    if (availability) { const A = pageBox(availability); px.push([spine + sway, A.top + A.height * 0.5]); }
    if (how) { const W = pageBox(how); px.push([spine - sway, W.top + W.height * 0.5]); }
    if (requirements) { const Q = pageBox(requirements); px.push([spine + sway, Q.top + Q.height * 0.35], [spine, Q.bottom]); }
    px.push(
      [spine, Math.max(P.top + 40, by - 150)],
      [spine - roadPx * 0.6, by + 8], // turn toward the booking button
      [B.right + 170, by + 10],
      [B.right + 24, by + 4], // ends just right of "Book a car"
    );

    wpp = (2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / vh;
    points = px.map(([x, y]) => new THREE.Vector3((x - vw / 2) * wpp, -y * wpp, 0));
    roadW = roadPx * wpp;
    anchors = [
      { y: H.top + H.height / 2, color: WHITE },
      { y: F.top + F.height / 2, color: RED },
      { y: P.top + P.height / 2, color: CYAN },
    ];
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    return true;
  }

  /** Width multiplier: the road narrows as it arrives at the button. */
  const widthAt = (t: number) => (t <= taperFrom ? 1 : 1 - 0.45 * smooth(taperFrom, 1, t));

  /** 2. The asphalt as one BufferGeometry strip, plus brushed-metal edge rails. */
  function build() {
    road?.geometry.dispose();
    rails.forEach((r) => r.geometry.dispose());
    if (road) scene.remove(road);
    rails.forEach((r) => scene.remove(r));
    rails = [];

    curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    curve.arcLengthDivisions = 2400; // even spacing for getPointAt on a long path
    length = curve.getLength();
    const taperPx = Math.min(420, Math.max(160, roadPx * 3));
    taperFrom = Math.max(0.5, 1 - (taperPx * wpp) / length);

    const pos = new Float32Array((SAMPLES + 1) * 6);
    const uv = new Float32Array((SAMPLES + 1) * 4);
    const index: number[] = [];
    const left: THREE.Vector3[] = [], right: THREE.Vector3[] = [];
    const p = new THREE.Vector3(), T = new THREE.Vector3(), n = new THREE.Vector3();

    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      curve.getPointAt(t, p);
      curve.getTangentAt(t, T);
      n.set(-T.y, T.x, 0).normalize(); // across the road, in the page plane
      const half = (roadW / 2) * widthAt(t);
      const L = p.clone().addScaledVector(n, half);
      const R = p.clone().addScaledVector(n, -half);
      pos.set([L.x, L.y, L.z, R.x, R.y, R.z], i * 6);
      const v = (t * length) / roadW; // the speckle repeats once per road width
      uv.set([0, v, 1, v], i * 4);
      if (i % 3 === 0 || i === SAMPLES) { left.push(L); right.push(R); }
      if (i < SAMPLES) { const a = i * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    road = new THREE.Mesh(geo, asphalt);
    road.frustumCulled = false;
    scene.add(road);

    const railR = Math.max(2.4, roadPx * 0.03) * wpp;
    for (const edge of [left, right]) {
      const path = new THREE.CatmullRomCurve3(edge.map((v) => v.clone().setZ(railR * 0.6)), false, "centripetal");
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, edge.length * 2, railR, 10, false), metal);
      mesh.frustumCulled = false;
      rails.push(mesh);
      scene.add(mesh);
    }
  }

  // 4. Place dash i at t = (i / 80 + offset) % 1, facing along the road.
  const m = new THREE.Matrix4(), basis = new THREE.Matrix4(), q = new THREE.Quaternion();
  const P0 = new THREE.Vector3(), T0 = new THREE.Vector3(), N0 = new THREE.Vector3(), Z0 = new THREE.Vector3(), S0 = new THREE.Vector3();
  const dashColor = new THREE.Color();
  function placeDashes(offset: number) {
    if (!curve) return;
    const dashL = roadW * 0.26, dashW = roadW * 0.045, dashH = roadW * 0.012;
    for (let i = 0; i < DASHES; i++) {
      const t = (((i / DASHES + offset) % 1) + 1) % 1;
      curve.getPointAt(t, P0);
      curve.getTangentAt(t, T0);
      N0.set(-T0.y, T0.x, 0).normalize();
      Z0.crossVectors(N0, T0);
      basis.makeBasis(N0, T0, Z0);
      q.setFromRotationMatrix(basis);
      // Fade near both ends so a dash wrapping from the end to the start never pops.
      const fade = smooth(0, 0.035, t) * (1 - smooth(0.95, 0.985, t));
      const s = Math.max(1e-4, fade);
      S0.set(dashW * widthAt(t) * s, dashL * s, dashH);
      P0.z += dashH * 0.5 + roadW * 0.01; // lifted off the asphalt to avoid flicker
      m.compose(P0, q, S0);
      dashes.setMatrixAt(i, m);
      dashes.setColorAt(i, dashColor.copy(ASPHALT).lerp(PAINT, fade));
    }
    dashes.instanceMatrix.needsUpdate = true;
    if (dashes.instanceColor) dashes.instanceColor.needsUpdate = true;
  }

  function accentAt(y: number, out: THREE.Color) {
    if (y <= anchors[0].y) return out.copy(anchors[0].color);
    for (let k = 1; k < anchors.length; k++) {
      if (y <= anchors[k].y) return out.copy(anchors[k - 1].color).lerp(anchors[k].color, smooth(anchors[k - 1].y, anchors[k].y, y));
    }
    return out.copy(anchors[anchors.length - 1].color);
  }

  // 5. Scroll progress drives the offset, smoothed with damp() every frame.
  const clock = new THREE.Clock();
  const light = new THREE.Color(1, 1, 1), lightGoal = new THREE.Color(1, 1, 1);
  let offset = 0, lastY = -1, lastLight = -1, dirty = true, raf = 0;

  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.1);
    if (!curve) return;
    const y = scrollY;
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    const goal = -(y / maxScroll) * 0.6;
    const before = offset;
    offset = THREE.MathUtils.damp(offset, goal, 5, dt);
    if (Math.abs(goal - offset) < 1e-5) offset = goal;
    accentAt(y + vh / 2, lightGoal);
    light.lerp(lightGoal, 1 - Math.exp(-4 * dt));
    const hex = light.getHex();
    if (!dirty && y === lastY && offset === before && hex === lastLight) return; // nothing moved
    dirty = false;
    lastY = y;
    lastLight = hex;

    accent.color.copy(light);
    metal.color.copy(RAIL).lerp(light, 0.35);
    camera.position.y = -(y + vh / 2) * wpp; // the camera follows the page
    placeDashes(offset);
    renderer.render(scene, camera);
  }

  let timer = 0;
  function rebuild() {
    if (measure()) {
      build();
      dirty = true;
    }
  }
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(rebuild, 150); };
  const resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(root);
  addEventListener("resize", schedule);
  const lost = (event: Event) => { event.preventDefault(); onLost(); };
  canvas.addEventListener("webglcontextlost", lost);

  rebuild();
  if (!curve) {
    stop();
    return null;
  }
  raf = requestAnimationFrame(frame);

  function stop() {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    resizeObserver.disconnect();
    removeEventListener("resize", schedule);
    canvas.removeEventListener("webglcontextlost", lost);
    road?.geometry.dispose();
    rails.forEach((r) => r.geometry.dispose());
    dashGeo.dispose();
    [asphalt, metal, paint].forEach((mat) => mat.dispose());
    asphaltMap.dispose();
    brushedMap.dispose();
    envTarget.dispose();
    pmrem.dispose();
    renderer.dispose();
  }
  return stop;
}
