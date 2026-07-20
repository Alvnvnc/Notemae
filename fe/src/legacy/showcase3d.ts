/* Galeri botol 3D beranda.

   Modul ini hanya diunduh kalau memang akan dipakai: home.js mengimpornya
   secara dinamis saat section-nya mendekati viewport, dan hanya setelah WebGL
   terbukti ada. three.js berukuran ratusan kilobyte - terlalu mahal untuk
   dikirim ke pengunjung yang tidak pernah menggulir sejauh itu, apalagi ke
   perangkat yang tidak sanggup menampilkannya.

   ---------------------------------------------------------------------------
   Konstruksi botol
   ---------------------------------------------------------------------------
   Semua bodi dibentuk dari ExtrudeGeometry di atas Shape 2D, bukan lathe.
   Flakon parfum hampir tidak pernah berpenampang lingkaran: yang membuatnya
   terbaca sebagai botol parfum justru penampang pipih atau bersegi dengan
   pinggul bertalang. Lathe tidak bisa menghasilkan itu.

     flask    silhouette depan (persegi bersudut membulat) diekstrusi ke arah
              Z setebal botol; bevel membulatkan rusuk depan-belakang
     faceted  penampang segi delapan diekstrusi ke atas setinggi botol; bevel
              jadi talang di bibir atas dan alas
     slim     flask dengan proporsi sempit dan jangkung

   Tidak ada satu pun berkas model yang diunduh: semua geometri dihitung saat
   modul jalan, jadi tidak ada aset yang perlu dilisensikan atau di-cache.

   ---------------------------------------------------------------------------
   Cairan
   ---------------------------------------------------------------------------
   Isi botol memakai penampang yang sama, diekstrusi sampai batas maksimum,
   lalu simpul-simpul di permukaannya digeser di vertex shader ke sebuah
   bidang miring. Kemiringan itu digerakkan pegas teredam yang mengejar
   kecepatan sudut carousel, jadi cairannya benar-benar terlambat menyusul
   putaran lalu berayun sampai diam - bukan tekstur yang berpura-pura.

   Alternatifnya (clipping plane) butuh penutup stensil supaya isi botol tidak
   terlihat berlubang dari atas; pendekatan vertex jauh lebih murah dan tidak
   pernah bocor.

   ---------------------------------------------------------------------------
   Kualitas adaptif
   ---------------------------------------------------------------------------
   Tingkat awal dipilih perfTier() dari sinyal perangkat (lihat webgl.ts).
   Selain itu ada governor yang mengukur FPS nyata tiap frame: kalau frame
   rate jatuh dan bertahan rendah, kualitas diturunkan bertahap - pertama
   memangkas pixelRatio, lalu (kalau masih berat) menukar kaca transmissive ke
   kaca pantulan yang jauh lebih murah. Ini pola AdaptiveDpr/PerformanceMonitor
   drei, ditanam langsung tanpa React Three Fiber. Governor hanya menurunkan,
   tidak pernah menaikkan, jadi tidak ada osilasi. */

import * as THREE from "three";
import { reduceMotion } from "./motion.js";
import { perfTier } from "./webgl.js";

const TAU = Math.PI * 2;
const RADIUS = 2.35;      // jari-jari lingkaran tempat botol berdiri
const DRAG_SLOP = 6;      // px sebelum tekan dianggap geser
const FILL = 0.62;        // tinggi permukaan cairan, relatif tinggi bodi

/* Proporsi tiap keluarga: lebar, tebal, tinggi bodi, radius sudut. */
type Spec = { w: number; d: number; h: number; r: number; kind: "box" | "octagon" };

const SHAPES = {
  flask:   { w: 0.94, d: 0.46, h: 1.28, r: 0.16, kind: "box" } as Spec,
  slim:    { w: 0.62, d: 0.40, h: 1.46, r: 0.14, kind: "box" } as Spec,
  faceted: { w: 0.92, d: 0.60, h: 1.34, r: 0.20, kind: "octagon" } as Spec
};

function specFor(shape: unknown): Spec {
  const key = typeof shape === "string" ? shape : "flask";
  return (SHAPES as Record<string, Spec>)[key] ?? SHAPES.flask;
}

/* Bentuk satu botol dalam data showcase. Field bentuk/tutup opsional: kalau
   tidak ada, buildBottle jatuh ke default flask. */
type ShowcaseFragrance = { brand: string; name: string; slug: string; [k: string]: unknown };
type ShowcaseEntry = {
  glass: string;
  liquid: string;
  metal: string;
  shape?: string;
  cap?: string;
  fragrance: ShowcaseFragrance;
  [k: string]: unknown;
};

export type ShowcaseGallery = { destroy(): void; select(i: number): void };

/* ---- bentuk 2D ---------------------------------------------------------- */

/* Persegi panjang bersudut membulat, berdiri dari y=0 ke y=h dan terpusat di
   x. Dipakai dua kali: sebagai siluet depan bodi, dan (dikecilkan) sebagai
   siluet cairan di dalamnya. */
function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const x = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-x + r, 0);
  s.lineTo(x - r, 0);
  s.quadraticCurveTo(x, 0, x, r);
  s.lineTo(x, h - r);
  s.quadraticCurveTo(x, h, x - r, h);
  s.lineTo(-x + r, h);
  s.quadraticCurveTo(-x, h, -x, h - r);
  s.lineTo(-x, r);
  s.quadraticCurveTo(-x, 0, -x + r, 0);
  return s;
}

/* Segi delapan terpusat: penampang mendatar botol berfaset. Sudutnya dipotong
   sepanjang `cut` dari tiap ujung, itulah yang jadi faset vertikal. */
function octagon(w: number, d: number, cut: number): THREE.Shape {
  const x = w / 2;
  const z = d / 2;
  const s = new THREE.Shape();
  const pts: [number, number][] = [
    [-x + cut, -z], [x - cut, -z], [x, -z + cut], [x, z - cut],
    [x - cut, z], [-x + cut, z], [-x, z - cut], [-x, -z + cut]
  ];
  s.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i += 1) s.lineTo(pts[i]![0], pts[i]![1]);
  s.closePath();
  return s;
}

/* Lingkaran beralur: jari-jari dimodulasi sinus supaya menghasilkan alur
   vertikal saat diekstrusi. Ini bentuk tutup berulir di gambar acuan. */
function fluted(radius: number, ribs: number, amp: number): THREE.Shape {
  const s = new THREE.Shape();
  const steps = ribs * 8;
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * TAU;
    const r = radius + Math.sin(a * ribs) * amp;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/* ---- geometri ----------------------------------------------------------- */

function extrude(shape: THREE.Shape, depth: number, bevel: number, segments = 3, curve = 10): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: segments,
    curveSegments: curve
  });
}

/* Bodi botol beserta ukurannya, sudah berdiri di y=0..h dan terpusat di XZ. */
function buildBody(spec: Spec): THREE.ExtrudeGeometry {
  if (spec.kind === "octagon") {
    // Penampang mendatar diekstrusi ke atas: bevel-nya jadi talang di bibir
    // atas dan alas, persis pinggul bertalang di gambar acuan.
    const bevel = 0.07;
    const geo = extrude(octagon(spec.w, spec.d, spec.r), spec.h - bevel * 2, bevel, 2, 1);
    geo.rotateX(-Math.PI / 2);          // sumbu ekstrusi Z -> Y
    geo.translate(0, bevel, 0);
    return geo;
  }
  // Siluet depan diekstrusi ke belakang: bevel-nya membulatkan rusuk tegak
  // dan rusuk depan-belakang sekaligus.
  const bevel = 0.05;
  const geo = extrude(roundedRect(spec.w - bevel * 2, spec.h - bevel * 2, spec.r), spec.d - bevel * 2, bevel);
  geo.translate(0, bevel, -(spec.d - bevel * 2) / 2);
  return geo;
}

/* Cairan: penampang bodi yang dikecilkan, diekstrusi sampai batas atas
   maksimum. Simpul di permukaannya digeser shader, jadi geometri ini hanya
   perlu menyediakan bidang datar yang cukup rapat untuk dimiringkan. */
function buildLiquid(spec: Spec): THREE.ExtrudeGeometry {
  const inset = 0.055;
  const top = spec.h * FILL;
  if (spec.kind === "octagon") {
    const geo = extrude(octagon(spec.w - inset * 2, spec.d - inset * 2, spec.r), top, 0, 0, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }
  const geo = extrude(roundedRect(spec.w - inset * 2, top, spec.r), spec.d - inset * 2, 0, 0, 8);
  geo.translate(0, 0, -(spec.d - inset * 2) / 2);
  return geo;
}

/* Kepala botol. Mengembalikan Group supaya tiap bagian bisa punya bahan
   sendiri (logam tutup vs kaca kerah). */
function buildCap(kind: string | undefined, spec: Spec, metalMat: THREE.Material, glassMat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const neckR = Math.min(spec.w, spec.d) * 0.30;

  // Kerah: selalu ada, menyambung bahu botol ke tutup.
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(neckR * 0.92, neckR * 1.05, 0.09, 24),
    metalMat
  );
  collar.position.y = 0.045;
  g.add(collar);

  if (kind === "ribbed") {
    const capH = 0.34;
    const geo = extrude(fluted(neckR * 1.32, 22, neckR * 0.045), capH, 0.012, 2, 1);
    geo.rotateX(-Math.PI / 2);
    const cap = new THREE.Mesh(geo, metalMat);
    cap.position.y = 0.08;
    g.add(cap);
  } else if (kind === "plate") {
    // Kubah kecil lalu pelat label persegi di atasnya - siluet khas flakon
    // berfaset di gambar acuan.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(neckR * 1.1, 20, 12, 0, TAU, 0, Math.PI / 2),
      metalMat
    );
    dome.position.y = 0.09;
    dome.scale.y = 0.85;
    g.add(dome);

    const plate = new THREE.Mesh(
      extrude(roundedRect(spec.w * 0.86, 0.15, 0.02), 0.2, 0.012),
      metalMat
    );
    plate.position.set(0, 0.16, -0.1);
    g.add(plate);
  } else {
    // pyramid: kerucut segi empat, dipakai varian yang lebih tegas.
    const cone = new THREE.Mesh(new THREE.ConeGeometry(neckR * 1.5, 0.32, 4), metalMat);
    cone.position.y = 0.25;
    cone.rotation.y = Math.PI / 4;
    g.add(cone);
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(neckR * 1.1, neckR * 1.1, 0.1, 20), glassMat
    );
    ring.position.y = 0.11;
    g.add(ring);
  }
  return g;
}

/* ---- bahan -------------------------------------------------------------- */

/* Peta lingkungan dibuat dari kanvas 2D, bukan berkas HDRI: kaca butuh
   sesuatu untuk dipantulkan, dan gradien dengan beberapa sumber cahaya sudah
   cukup meyakinkan tanpa menambah unduhan. */
function buildEnv(renderer: THREE.WebGLRenderer): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d")!;

  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#2b352a");
  sky.addColorStop(0.42, "#101710");
  sky.addColorStop(1, "#060906");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);

  const blob = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  blob(140, 48, 120, "rgba(255,246,224,0.98)");   // key
  blob(376, 84, 104, "rgba(216,161,91,0.55)");    // amber, sisi berlawanan
  blob(256, 214, 150, "rgba(126,146,116,0.26)");  // pantulan lantai
  // Dua pias tegas: kaca tanpa tepi terang kehilangan bentuknya di latar gelap.
  ctx.fillStyle = "rgba(255,252,240,0.5)";
  ctx.fillRect(48, 96, 12, 150);
  ctx.fillRect(452, 110, 9, 130);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

/* Bahan cairan + kail shader yang memiringkan permukaannya.

   Yang digeser hanya simpul di atas ambang `uFill`; sisi dan alasnya tetap.
   Normal permukaannya ikut dihitung ulang, kalau tidak bidang miring itu
   akan memantulkan cahaya seolah masih datar dan kemiringannya tidak
   terbaca sama sekali.

   Jalur ringan (lowPower): transmission dimatikan sepenuhnya. Di three.js
   material transmission > 0 mana pun memaksa satu lintasan render scene
   tambahan tiap frame - itu biaya terbesar galeri ini. Cairan yang duduk di
   dalam kaca nyaris tidak menampakkan pembiasannya sendiri, jadi versi
   opaque-tembus (opacity, bukan transmission) tampil hampir sama tanpa
   lintasan itu. */
function makeLiquidMaterial(color: string, fillTop: number, lowPower: boolean): THREE.MeshPhysicalMaterial {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    transmission: lowPower ? 0 : 0.72,
    thickness: 1.6,
    ior: 1.36,
    roughness: lowPower ? 0.24 : 0.16,
    metalness: 0,
    envMapIntensity: lowPower ? 1.0 : 1.25,
    transparent: true,
    opacity: lowPower ? 0.9 : 1,
    side: THREE.DoubleSide
  });

  const tilt = new THREE.Vector2();
  mat.userData.tilt = tilt;
  mat.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uFill = { value: fillTop };
    shader.uniforms.uTilt = { value: tilt };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uFill;\nuniform vec2 uTilt;"
      )
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
         if (position.y > uFill - 0.004) {
           objectNormal = normalize(vec3(-uTilt.x, 1.0, -uTilt.y));
         }`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         if (transformed.y > uFill - 0.004) {
           transformed.y = uFill + dot(uTilt, transformed.xz);
         }`
      );
  };
  return mat;
}

/* Bahan kaca. Jalur ringan membangun kaca dari pantulan (envMap + clearcoat)
   alih-alih pembiasan (transmission): tanpa lintasan render transmissive,
   biaya per frame turun tajam; siluet kaca tetap terbaca karena tepinya
   dibentuk pantulan env dan lapisan clearcoat, bukan tembus pandangnya. */
function makeGlassMaterial(entry: ShowcaseEntry, env: THREE.Texture, lowPower: boolean): THREE.MeshPhysicalMaterial {
  const glass = lowPower
    ? new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(entry.glass),
        transmission: 0,
        transparent: true,
        opacity: 0.72,
        roughness: 0.08,
        metalness: 0,
        envMapIntensity: 1.6,
        clearcoat: 1,
        clearcoatRoughness: 0.05
      })
    : new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(entry.glass),
        transmission: 1,
        // Kaca meneruskan bayangan tutup logam ke dalam bodi - itu memang yang
        // dilakukan kaca sungguhan, dan besarnya diatur pembiasan oleh normal,
        // bukan oleh nilai ini. Ketebalan dijaga sedang supaya bayangan itu
        // melunak alih-alih jadi kotak bertepi keras.
        thickness: 0.45,
        ior: 1.48,
        roughness: 0.06,
        metalness: 0,
        envMapIntensity: 1.5,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        transparent: true
      });
  glass.envMap = env;
  return glass;
}

function buildBottle(entry: ShowcaseEntry, env: THREE.Texture, lowPower: boolean): THREE.Group {
  const spec = specFor(entry.shape);
  const group = new THREE.Group();

  const glass = makeGlassMaterial(entry, env, lowPower);

  // Logam yang terlalu pekat jadi lubang hitam saat dibiaskan kaca. Roughness
  // yang agak tinggi menyebarkan pantulannya, jadi tutupnya tetap terbaca
  // sebagai logam gelap alih-alih siluet kosong.
  const metal = new THREE.MeshStandardMaterial({
    color: new THREE.Color(entry.metal),
    metalness: 0.82,
    roughness: 0.34,
    envMapIntensity: 1.5
  });

  const glassMesh = new THREE.Mesh(buildBody(spec), glass);
  group.add(glassMesh);

  const liquidMat = makeLiquidMaterial(entry.liquid, spec.h * FILL, lowPower);
  const liquidMesh = new THREE.Mesh(buildLiquid(spec), liquidMat);
  group.add(liquidMesh);

  const cap = buildCap(entry.cap, spec, metal, glass);
  cap.position.y = spec.h;
  group.add(cap);

  // Referensi disimpan supaya governor bisa menukar bahan hidup-hidup saat FPS
  // jatuh (lihat swapToCheapMaterials di mountShowcase).
  group.userData.liquid = liquidMat;
  group.userData.glassMesh = glassMesh;
  group.userData.liquidMesh = liquidMesh;
  group.userData.entry = entry;
  group.userData.height = spec.h;
  // Botol duduk di lantai imajiner; digeser turun supaya titik tengahnya
  // jatuh di sumbu pandang kamera tanpa perlu menggeser kameranya.
  group.position.y = -spec.h * 0.52;
  group.userData.baseY = group.position.y;
  return group;
}

/**
 * @param stage  wadah .showcase__stage
 * @param items  hasil pickShowcase()
 * @param onPick dipanggil saat botol ditekan
 */
export function mountShowcase(
  stage: HTMLElement,
  items: ShowcaseEntry[],
  onPick: (index: number) => void
): ShowcaseGallery | null {
  const canvasEl = stage.querySelector<HTMLCanvasElement>("#showcase-canvas");
  if (!canvasEl || !items.length) return null;
  const canvas: HTMLCanvasElement = canvasEl;

  // Satu keputusan kemampuan awal untuk seluruh galeri: perangkat kuat memakai
  // kaca transmissive penuh, perangkat lemah/ponsel memakai kaca pantulan yang
  // jauh lebih murah. Governor di bawah bisa menurunkan lebih jauh saat jalan.
  const lowPower = perfTier() === "low";

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowPower, alpha: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  // Transmission menuntut satu lintasan render tambahan tiap frame; di layar
  // padat piksel biayanya naik kuadratik tanpa terlihat lebih baik. Jalur
  // ringan tidak memakai transmission sama sekali, jadi bisa lebih hemat lagi.
  const pixelStart = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.5);
  renderer.setPixelRatio(pixelStart);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const env = buildEnv(renderer);
  scene.environment = env;

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  camera.position.set(0, 0.26, 7.3);
  camera.lookAt(0, 0, 0);

  // Env map menanggung sebagian besar pencahayaan; lampu-lampu ini menegaskan
  // tepi kaca supaya siluetnya tidak larut ke latar gelap.
  const key = new THREE.DirectionalLight(0xfff2d8, 2.4);
  key.position.set(2.4, 3.6, 3.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xd8a15b, 1.7);
  rim.position.set(-3, 1.4, -2.4);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xbfd0b4, 0.65);
  fill.position.set(-1.2, -2.2, 2.6);
  scene.add(fill);

  const turntable = new THREE.Group();
  scene.add(turntable);

  const bottles = items.map((entry, i) => {
    const b = buildBottle(entry, env, lowPower);
    const a = (i / items.length) * TAU;
    b.position.x = Math.sin(a) * RADIUS;
    b.position.z = Math.cos(a) * RADIUS;
    b.userData.index = i;
    turntable.add(b);
    return b;
  });

  /* ---- keadaan ------------------------------------------------------- */
  let selected = 0;
  let targetSpin = 0;      // rotasi yang dituju (radian)
  let spin = 0;            // rotasi sekarang
  let angVel = 0;          // kecepatan sudut, penggerak ayunan cairan
  let slosh = 0;           // kemiringan permukaan cairan
  let sloshVel = 0;
  let hovered = -1;
  let running = false;
  let disposed = false;    // digunakan callback async agar tidak menghidupkan yang sudah dibongkar
  let started = false;     // loop render baru mulai setelah shader dikompilasi
  let frame = 0;
  let clock = 0;
  let idleFrames = 0;
  let driftX = 0;          // tarikan dari posisi pointer, -1..1

  /* ---- governor kualitas --------------------------------------------- */
  let fpsEma = 60;         // FPS terukur, dihaluskan
  let lowStreak = 0;       // berapa frame beruntun di bawah ambang
  let warmup = 0;          // frame pertama diabaikan (mount/kompilasi kerap lambat)
  let quality = 0;         // 0 = tingkat awal; makin tinggi makin diturunkan
  let cheap = lowPower;    // apakah bahan sudah versi murah
  let swapPause = false;   // jeda render sesaat saat program bahan baru dikompilasi
  let pixelNow = pixelStart;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const angleFor = (i: number) => -(i / items.length) * TAU;

  function setPixel(ratio: number) {
    pixelNow = ratio;
    renderer.setPixelRatio(ratio);
    resize();
  }

  /* Tukar seluruh kaca + cairan ke versi murah tanpa transmission. Dipanggil
     governor sebagai langkah terakhir kalau memangkas pixelRatio saja belum
     cukup. Program bahan baru dikompilasi di luar jalur render (swapPause)
     supaya pertukaran ini - yang justru terjadi saat FPS sedang jatuh - tidak
     menambah satu hitch lagi. */
  function swapToCheapMaterials() {
    if (cheap) return;
    cheap = true;
    for (const b of bottles) {
      const entry = b.userData.entry as ShowcaseEntry;
      const glassMesh = b.userData.glassMesh as THREE.Mesh;
      const liquidMesh = b.userData.liquidMesh as THREE.Mesh;
      const spec = specFor(entry.shape);
      (glassMesh.material as THREE.Material).dispose();
      glassMesh.material = makeGlassMaterial(entry, env, true);
      (liquidMesh.material as THREE.Material).dispose();
      const lm = makeLiquidMaterial(entry.liquid, spec.h * FILL, true);
      liquidMesh.material = lm;
      b.userData.liquid = lm;
    }
    swapPause = true;
    const resume = () => { swapPause = false; };
    if (typeof renderer.compileAsync === "function") renderer.compileAsync(scene, camera).then(resume, resume);
    else swapPause = false;
  }

  /* Satu tingkat penurunan. Hanya turun, tidak pernah naik - jadi tak ada
     osilasi. pixelRatio dipangkas dulu (dampak besar, tanpa hitch), baru
     bahan ditukar sebagai upaya terakhir. */
  function stepDown() {
    if (quality === 0) {
      quality = 1;
      setPixel(Math.max(1, pixelNow - 0.25));
    } else if (quality === 1) {
      quality = 2;
      setPixel(1);
    } else if (quality === 2 && !cheap) {
      quality = 3;
      swapToCheapMaterials();
    }
  }

  function select(i: number, { silent = false }: { silent?: boolean } = {}) {
    const n = items.length;
    const next = ((i % n) + n) % n;
    const want = angleFor(next);
    // Selalu ambil jalan memutar terpendek, kalau tidak melompat dari botol
    // terakhir ke pertama akan memutar hampir satu lingkaran penuh.
    const delta = ((want - targetSpin + Math.PI) % TAU + TAU) % TAU - Math.PI;
    targetSpin += delta;
    selected = next;
    if (reduceMotion) spin = targetSpin;
    if (!silent) stage.dispatchEvent(new CustomEvent("showcase:select", { detail: { index: next } }));
    wake();
  }

  /* ---- render loop ---------------------------------------------------- */

  function resize() {
    const w = stage.clientWidth;
    const h = canvas!.clientHeight || stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Botol harus tetap utuh di layar sempit: memundurkan kamera lebih jujur
    // daripada memotong bagian atasnya.
    camera.position.z = w < 720 ? 9.6 : 7.3;
    camera.updateProjectionMatrix();
    wake();
  }

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    /* dt WAJIB positif. Stempel waktu rAF adalah saat frame mulai diproses,
       dan itu bisa mendahului performance.now() yang dicatat wake() kalau
       wake() dipanggil di tengah frame. dt negatif membuat pow(0.0016, dt)
       melompat di atas 1, ease jadi negatif, dan setiap lerp di bawah ini
       menjauh dari targetnya alih-alih mendekat - skala botol meledak dalam
       beberapa frame. */
    const dt = Math.min(0.05, Math.max(0.001, (now - clock) / 1000 || 0.016));
    clock = now;

    const ease = reduceMotion ? 1 : 1 - Math.pow(0.0016, dt);

    // Pointer yang menepi ikut menyeret carousel, jadi mouse bisa menyetir
    // tanpa harus menekan. Nilainya kecil: ini isyarat arah, bukan kemudi.
    if (!reduceMotion && !dragging && Math.abs(driftX) > 0.12) {
      targetSpin -= driftX * 0.55 * dt;
    }

    const prev = spin;
    spin += (targetSpin - spin) * ease;
    turntable.rotation.y = spin;
    angVel = dt > 0 ? (spin - prev) / dt : 0;

    /* Ayunan cairan: pegas teredam yang mengejar kecepatan sudut. Cairan
       tertinggal saat rak mulai berputar, lalu berayun melewati titik diam
       sebelum tenang - itulah yang membuatnya terbaca sebagai zat cair dan
       bukan blok warna yang ikut berputar. */
    if (reduceMotion) {
      slosh = 0;
    } else {
      const K = 46;   // kekakuan
      const C = 7.4;  // redaman
      const target = THREE.MathUtils.clamp(angVel * 0.16, -0.42, 0.42);
      sloshVel += (-K * (slosh - target) - C * sloshVel) * dt;
      slosh = THREE.MathUtils.clamp(slosh + sloshVel * dt, -0.5, 0.5);
    }

    bottles.forEach((b, i) => {
      const isSel = i === selected;
      const isHot = i === hovered;
      const wantScale = isSel ? 1.14 : isHot ? 1.04 : 0.9;
      const s = b.scale.x + (wantScale - b.scale.x) * ease;
      b.scale.setScalar(s);

      // Botol menghadap kamera apa pun posisinya di lingkaran, jadi sisi
      // lebarnya selalu terbaca dari depan.
      b.rotation.y = -spin;
      if (!reduceMotion) {
        const lift = isSel ? 0.1 : 0;
        b.position.y += (b.userData.baseY + lift - b.position.y) * ease;
        if (isSel) b.rotation.y += Math.sin(now / 2800) * 0.2;
      }
      // Kemiringan dipasang di ruang lokal botol. Karena tiap botol sudah
      // diputar balik menghadap kamera, sumbu X lokalnya sejajar layar -
      // arah yang sama dengan gerakan carousel.
      (b.userData.liquid as THREE.MeshPhysicalMaterial).userData.tilt.set(slosh, slosh * 0.22);
    });

    // Selama program bahan baru dikompilasi (swapPause), transformasi tetap
    // maju tapi jangan dirender - render di titik itu justru memicu kompilasi
    // sinkron yang ingin dihindari.
    if (!swapPause) renderer.render(scene, camera);

    // Governor: ukur FPS nyata dan turunkan kualitas kalau bertahan rendah.
    // warmup melewatkan frame-frame awal yang kerap lambat karena mount.
    if (!reduceMotion && !swapPause) {
      if (warmup < 45) {
        warmup += 1;
      } else {
        fpsEma += (1 / dt - fpsEma) * 0.08;
        if (fpsEma < 45) {
          if (++lowStreak > 40) { lowStreak = 0; stepDown(); }
        } else {
          lowStreak = 0;
        }
      }
    }

    // Berhenti sendiri begitu semuanya diam: tidak ada gunanya membakar GPU
    // untuk frame yang identik.
    const settled =
      Math.abs(targetSpin - spin) < 0.0004 &&
      Math.abs(slosh) < 0.0015 &&
      Math.abs(sloshVel) < 0.0015 &&
      hovered === -1;
    if (settled && !reduceMotion && idleFrames++ > 90) sleep();
    if (!settled) idleFrames = 0;
  }

  function wake() {
    idleFrames = 0;
    if (running) return;
    running = true;
    clock = performance.now();
    frame = requestAnimationFrame(tick);
  }
  function sleep() {
    running = false;
    cancelAnimationFrame(frame);
  }

  /* ---- interaksi ------------------------------------------------------ */

  function pick(e: PointerEvent): number {
    const r = canvas!.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(bottles, true)[0];
    if (!hit) return -1;
    let o: THREE.Object3D | null = hit.object;
    while (o && o.userData.index === undefined) o = o.parent;
    return o ? (o.userData.index as number) : -1;
  }

  let dragging = false;
  let dragMoved = 0;
  let lastX = 0;

  const onDown = (e: PointerEvent) => {
    dragging = true;
    dragMoved = 0;
    lastX = e.clientX;
    canvas.setPointerCapture?.(e.pointerId);
    wake();
  };

  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    driftX = ((e.clientX - r.left) / r.width) * 2 - 1;

    if (dragging) {
      const dx = e.clientX - lastX;
      dragMoved += Math.abs(dx);
      lastX = e.clientX;
      // Lebar kanvas dipetakan ke kira-kira setengah putaran, jadi kecepatan
      // geser terasa sama di layar sempit maupun lebar.
      targetSpin += (dx / canvas.clientWidth) * Math.PI;
      spin = targetSpin;
      wake();
      return;
    }
    const at = pick(e);
    if (at !== hovered) {
      hovered = at;
      canvas.style.cursor = at >= 0 ? "pointer" : "grab";
    }
    wake();
  };

  const onUp = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    canvas.releasePointerCapture?.(e.pointerId);

    if (dragMoved > DRAG_SLOP) {
      // Geser: jatuhkan ke botol terdekat, jangan berhenti di antara dua.
      const step = TAU / items.length;
      select(Math.round(-targetSpin / step));
      return;
    }
    const at = pick(e);
    if (at < 0) return;
    if (at !== selected) select(at);
    onPick(at);
  };

  const onLeave = () => {
    driftX = 0;
    if (hovered !== -1) { hovered = -1; canvas.style.cursor = "grab"; }
    wake();
  };

  /* Roda mouse memutar rak, tapi hanya saat pointernya memang di atas
     kanvas dan gulirannya mendatar-dominan. Membajak guliran tegak akan
     memerangkap halaman: pengunjung yang mau lewat jadi tidak bisa. */
  const onWheel = (e: WheelEvent) => {
    if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    e.preventDefault();
    targetSpin -= (e.deltaX / canvas.clientWidth) * Math.PI;
    spin = targetSpin;
    wake();
  };

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "pan-y";

  const ro = new ResizeObserver(resize);
  ro.observe(stage);

  // Di luar layar tidak ada yang perlu digambar.
  const io = new IntersectionObserver(([en]) => (en!.isIntersecting ? wake() : sleep()), { threshold: 0.02 });
  io.observe(stage);

  /* Program MeshPhysicalMaterial - apalagi varian transmission - berukuran
     besar dan baru dikompilasi three.js pada render pertama. Kalau kompilasi
     itu jatuh tepat di tengah scroll dari hero ke sini, ia memblokir main
     thread dan Lenis membacanya sebagai sentakan. compileAsync memindahkannya
     ke luar jalur kritis (memakai KHR_parallel_shader_compile bila ada); loop
     render baru dimulai setelah program siap, jadi frame pertama yang terlihat
     sudah murah alih-alih memicu kompilasi. */
  function startLoop() {
    if (disposed || started) return;
    started = true;
    resize();
    select(0, { silent: true });
    spin = targetSpin;
    wake();
  }
  if (typeof renderer.compileAsync === "function") {
    renderer.compileAsync(scene, camera).then(startLoop, startLoop);
  } else {
    renderer.compile(scene, camera);
    startLoop();
  }

  /* ---- pembongkaran --------------------------------------------------- */

  function destroy() {
    disposed = true;
    sleep();
    io.disconnect();
    ro.disconnect();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("pointerleave", onLeave);
    canvas.removeEventListener("wheel", onWheel);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
    });
    env.dispose();
    renderer.dispose();
  }

  return { destroy, select };
}
