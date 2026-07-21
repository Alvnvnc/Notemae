/* ==========================================================================
   Notemae — interactive WebGL flow background
   Procedural domain-warped noise distorted by pointer velocity.
   No external media assets; degrades to the CSS poster when WebGL is absent.
   Public API: window.ScentBG.setFamily(a, b) | .setPaused(bool) | .isActive()
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("bg-canvas");
  if (!canvas) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Tingkat kemampuan, sinyal murah yang sama dipakai galeri 3D (webgl.js).
  // Perangkat lemah/ponsel memakai FBM 3-oktaf alih-alih 5: separuh lebih
  // sedikit evaluasi noise per piksel, selisih visual pada gradien selembut
  // ini nyaris tak terlihat. Default optimistis - API yang absen tidak
  // menurunkan mesin kelas atas.
  var lowTier =
    reduceMotion ||
    (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
    window.innerWidth < 768 ||
    (navigator.hardwareConcurrency || 8) <= 4 ||
    (navigator.deviceMemory || 8) <= 4;
  var OCTAVES = lowTier ? 3 : 5;

  var gl =
    canvas.getContext("webgl", { antialias: false, alpha: true, powerPreference: "high-performance" }) ||
    canvas.getContext("experimental-webgl", { antialias: false, alpha: true });

  // Software rasteriser (SwiftShader, llvmpipe, Mesa softpipe) berarti setiap
  // piksel shader dikerjakan CPU. Untuk latar dekoratif itu tidak sepadan:
  // main thread habis dan seluruh halaman terasa berat. Poster CSS-nya sudah
  // menyerupai hasil akhir, jadi lebih baik berhenti di situ.
  function isSoftwareRenderer(context) {
    try {
      var info = context.getExtension("WEBGL_debug_renderer_info");
      if (!info) return false;
      var name = String(context.getParameter(info.UNMASKED_RENDERER_WEBGL) || "");
      return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
    } catch (e) {
      return false;
    }
  }

  // ---- Fallback: no WebGL (atau WebGL tanpa GPU) -> poster CSS + API kosong.
  if (gl && isSoftwareRenderer(gl)) gl = null;
  if (!gl) {
    window.ScentBG = {
      setFamily: function () {},
      setPaused: function () {},
      isActive: function () { return false; }
    };
    window.dispatchEvent(new CustomEvent("scent:webgl-failed"));
    return;
  }

  var VERT = [
    "attribute vec2 aPos;",
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = aPos * 0.5 + 0.5;",
    "  gl_Position = vec4(aPos, 0.0, 1.0);",
    "}"
  ].join("\n");

  var FRAG = [
    "precision highp float;",
    "#define OCTAVES " + OCTAVES,
    "varying vec2 vUv;",
    "uniform vec2 uResolution;",
    "uniform float uTime;",
    "uniform vec2 uMouse;",
    "uniform vec2 uVel;",
    "uniform float uStrength;",
    "uniform vec3 uColA;",
    "uniform vec3 uColB;",
    "uniform vec3 uColBase;",
    "uniform float uReduce;",

    "float hash(vec2 p){",
    "  p = fract(p * vec2(123.34, 456.21));",
    "  p += dot(p, p + 45.32);",
    "  return fract(p.x * p.y);",
    "}",

    "float noise(vec2 p){",
    "  vec2 i = floor(p); vec2 f = fract(p);",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  float a = hash(i);",
    "  float b = hash(i + vec2(1.0, 0.0));",
    "  float c = hash(i + vec2(0.0, 1.0));",
    "  float d = hash(i + vec2(1.0, 1.0));",
    "  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
    "}",

    "float fbm(vec2 p){",
    "  float v = 0.0; float amp = 0.5;",
    "  for (int i = 0; i < OCTAVES; i++){",
    "    v += amp * noise(p);",
    "    p *= 2.02; amp *= 0.5;",
    "  }",
    "  return v;",
    "}",

    "void main(){",
    "  float aspect = uResolution.x / max(uResolution.y, 1.0);",
    "  vec2 p = vUv; p.x *= aspect;",
    "  vec2 m = uMouse; m.x *= aspect;",

    "  float t = uTime * (uReduce > 0.5 ? 0.0 : 1.0);",

    // localized pointer wake: gaussian falloff around the cursor
    "  vec2 toM = p - m;",
    "  float d = length(toM);",
    "  float infl = exp(-d * d * 7.0);",
    "  vec2 flow = uVel * uStrength * infl * 1.4;",

    // domain-warped fbm
    "  vec2 q = vec2(fbm(p * 2.6 + t * 0.03), fbm(p * 2.6 + vec2(3.1, 1.7) - t * 0.025));",
    "  vec2 r = vec2(fbm(p * 2.6 + q * 1.4 + flow + t * 0.02),",
    "               fbm(p * 2.6 + q * 1.4 + flow.yx - t * 0.02));",
    "  float f = fbm(p * 2.6 + r * 1.2 + flow);",

    // ridges give material-like veins
    "  float ridge = abs(2.0 * f - 1.0);",
    "  float veins = pow(1.0 - ridge, 2.4);",

    // colour build-up
    "  vec3 col = uColBase;",
    "  col = mix(col, uColA, smoothstep(0.25, 0.85, f));",
    "  col = mix(col, uColB, smoothstep(0.45, 1.0, r.x) * 0.65);",
    "  col += uColA * veins * 0.35;",

    // pointer highlight
    "  col += uColB * infl * uStrength * 0.5;",

    // gentle vignette to protect text contrast
    "  float vig = smoothstep(1.25, 0.25, length(vUv - 0.5) * 1.6);",
    "  col *= mix(0.55, 1.08, vig);",

    // subtle grain to avoid banding
    "  col += (hash(vUv * uResolution.xy) - 0.5) * 0.02;",

    "  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);",
    "}"
  ].join("\n");

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("ScentBG shader error:", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  var program = null;
  var buffer = null;
  var uni = {};

  function buildProgram() {
    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn("ScentBG link error:", gl.getProgramInfoLog(program));
      return false;
    }
    gl.useProgram(program);

    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    ["uResolution", "uTime", "uMouse", "uVel", "uStrength", "uColA", "uColB", "uColBase", "uReduce"].forEach(function (n) {
      uni[n] = gl.getUniformLocation(program, n);
    });
    return true;
  }

  if (!buildProgram()) {
    window.ScentBG = { setFamily: function () {}, setPaused: function () {}, isActive: function () { return false; } };
    window.dispatchEvent(new CustomEvent("scent:webgl-failed"));
    return;
  }

  // ---- state ----
  // Latar ini gradien noise yang lembut, tidak ada tepi tajam yang bisa
  // dimenangkan resolusi tinggi. Menaikkan dpr hanya melipatgandakan kerja
  // fragment shader per frame; 1.25 sudah tidak terbedakan.
  var DPR_CAP = 1.25;
  var FRAME_MS = 1000 / 30;
  // Saat tidak ada interaksi, fieldnya cuma menghanyut pelan lewat uTime; 15fps
  // tidak terbedakan dari 30 di situ, tapi separuh frame = separuh kerja shader.
  // Begitu pointer/palet bergerak (strength naik), kembali ke 30fps penuh.
  var IDLE_FRAME_MS = 1000 / 15;
  function dprCap() {
    return (lowTier || window.innerWidth < 768) ? 1 : DPR_CAP;
  }
  var dpr = Math.min(window.devicePixelRatio || 1, dprCap());
  var width = 0, height = 0;

  var base = [0.055, 0.07, 0.055];
  var curA = [0.32, 0.44, 0.29], tgtA = curA.slice();
  var curB = [0.82, 0.64, 0.37], tgtB = curB.slice();

  var mouse = [0.5, 0.5], mouseTarget = [0.5, 0.5];
  var vel = [0, 0], velTarget = [0, 0];
  var strength = 0;
  var lastPointer = null;

  var timeSec = 0;
  var lastFrame = 0;
  var running = false;
  var pausedByUser = false;
  var tabHidden = document.hidden;
  // past the hero the field stays alive behind the translucent bands,
  // throttled to every second frame and with a calmer pointer response
  var pastHero = false;
  var frameNo = 0;

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // ---- pointer input ----
  function onPointer(e) {
    if (reduceMotion) return; // no pointer-driven flow under reduced motion
    var x = e.clientX / width;
    var y = 1.0 - e.clientY / height; // flip: up is positive
    // clamp re-entry jumps to avoid flashes
    if (lastPointer) {
      var dx = x - lastPointer.x;
      var dy = y - lastPointer.y;
      var mag = Math.min(Math.sqrt(dx * dx + dy * dy) * 9.0, 1.2);
      velTarget[0] = dx * 12.0;
      velTarget[1] = dy * 12.0;
      strength = Math.min(strength + mag, 1.0);
    }
    mouseTarget[0] = x;
    mouseTarget[1] = y;
    lastPointer = { x: x, y: y };
    ensureRunning();
  }

  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener(
    "pointerdown",
    function (e) {
      strength = Math.min(strength + 0.5, 1.0);
      onPointer(e);
    },
    { passive: true }
  );

  // ---- render loop ----
  function damp(current, target, lambda, dt) {
    return current + (target - current) * (1 - Math.exp(-lambda * dt));
  }

  function render(now) {
    if (!running) return;
    frameNo++;
    if (pastHero && frameNo % 2 === 0) {
      // half-rate behind the content bands — same pacing, half the GPU cost
      requestAnimationFrame(render);
      return;
    }
    // Fieldnya bergerak lambat; 30fps tidak terbedakan dari 60fps di sini,
    // tapi separuh frame berarti separuh kerja fragment shader. Diam total
    // (tanpa pointer) diturunkan lagi ke 15fps.
    var budget = strength > 0.03 ? FRAME_MS : IDLE_FRAME_MS;
    if (lastFrame && now - lastFrame < budget) {
      requestAnimationFrame(render);
      return;
    }
    var dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0.016;
    lastFrame = now;

    if (!reduceMotion) timeSec += dt;

    // smooth pointer + velocity (delta-time damping, plan §5)
    mouse[0] = damp(mouse[0], mouseTarget[0], 10, dt);
    mouse[1] = damp(mouse[1], mouseTarget[1], 10, dt);
    vel[0] = damp(vel[0], velTarget[0], 9, dt);
    vel[1] = damp(vel[1], velTarget[1], 9, dt);
    velTarget[0] *= 0.9;
    velTarget[1] *= 0.9;
    strength *= Math.exp(-2.2 * dt); // dissipation

    // palette transition (~1.5s crossfade)
    for (var i = 0; i < 3; i++) {
      curA[i] = damp(curA[i], tgtA[i], 3.0, dt);
      curB[i] = damp(curB[i], tgtB[i], 3.0, dt);
    }

    gl.uniform2f(uni.uResolution, canvas.width, canvas.height);
    gl.uniform1f(uni.uTime, timeSec);
    gl.uniform2f(uni.uMouse, mouse[0], mouse[1]);
    gl.uniform2f(uni.uVel, vel[0], vel[1]);
    gl.uniform1f(uni.uStrength, strength * (pastHero ? 0.35 : 1.0));
    gl.uniform3fv(uni.uColA, curA);
    gl.uniform3fv(uni.uColB, curB);
    gl.uniform3fv(uni.uColBase, base);
    gl.uniform1f(uni.uReduce, reduceMotion ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (reduceMotion) { running = false; return; } // one static frame only

    requestAnimationFrame(render);
  }

  // Snap-and-draw a single frame (used for the reduced-motion path).
  function renderOnce() {
    mouse[0] = mouseTarget[0]; mouse[1] = mouseTarget[1];
    for (var i = 0; i < 3; i++) { curA[i] = tgtA[i]; curB[i] = tgtB[i]; }
    running = true; lastFrame = 0;
    requestAnimationFrame(render);
  }

  function canRun() {
    return !pausedByUser && !tabHidden;
  }

  function ensureRunning() {
    if (running || !canRun()) return;
    running = true;
    lastFrame = 0;
    requestAnimationFrame(render);
  }

  function stop() { running = false; }

  // ---- lifecycle: visibility + scroll position (plan §3 / §11) ----
  document.addEventListener("visibilitychange", function () {
    tabHidden = document.hidden;
    if (tabHidden) stop();
    else ensureRunning();
  });

  function syncScrollState() {
    pastHero = window.scrollY > window.innerHeight * 0.8;
  }
  window.addEventListener("scroll", syncScrollState, { passive: true });
  syncScrollState();

  window.addEventListener("resize", function () {
    dpr = Math.min(window.devicePixelRatio || 1, dprCap());
    resize();
    ensureRunning();
  });

  // ---- context loss recovery ----
  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    stop();
  });
  canvas.addEventListener("webglcontextrestored", function () {
    if (buildProgram()) { resize(); ensureRunning(); }
  });

  // ---- public API ----
  window.ScentBG = {
    setFamily: function (a, b) {
      if (a) tgtA = a.slice();
      if (b) tgtB = b.slice();
      if (reduceMotion) { renderOnce(); return; } // static swap, no crossfade loop
      strength = Math.min(strength + 0.35, 1.0); // little pulse on change
      ensureRunning();
    },
    setPaused: function (v) {
      pausedByUser = !!v;
      if (pausedByUser) stop();
      else ensureRunning();
    },
    isActive: function () { return true; }
  };

  // ---- boot ----
  resize();
  document.body.setAttribute("data-webgl", "on");
  if (reduceMotion) {
    renderOnce(); // single static frame, no continuous animation
  } else {
    ensureRunning();
  }
})();
