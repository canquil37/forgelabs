// Five interactive shader wallpapers.
// Each fragment shader is appended to COMMON. All read u_res, u_time,
// u_mouse (raw px), u_mouseSmooth (eased px), u_clicks[8] (vec4: px.xy, startTime, alive).

const COMMON = `
precision highp float;
uniform vec2 u_res;
uniform vec2 u_offset;
uniform vec2 u_mouse;
uniform vec2 u_mouseSmooth;
uniform float u_time;
uniform vec4 u_clicks[8];
uniform int u_mood;
uniform int u_lens;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i + vec2(0,0)), hash21(i + vec2(1,0)), u.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(7.1, 3.7);
    a *= 0.5;
  }
  return v;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
vec2 toAR(vec2 frag) {
  // u_offset lets the same program render into a sub-rect of a larger canvas
  // (used by the shared dock renderer). For full-canvas use, u_offset is 0.
  return ((frag - u_offset) / u_res - 0.5) * vec2(u_res.x / u_res.y, 1.0);
}

// ---- math-glyph helpers (used by MANIFOLD / LAGRANGIAN) ----
float strokeSeg(vec2 p, vec2 a, vec2 b, float w) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  float d = length(pa - ba * h);
  return smoothstep(w, w * 0.4, d);
}
// Procedural "math glyph" in [0,1]^2 cell space. idx is a hashed float in [0,1)
// — different ranges pick different symbol-like shapes.
float mathGlyph(vec2 p, float idx) {
  float c = 0.0;
  float w = 0.085;
  if (idx < 0.14) {
    // = (equals)
    c = max(strokeSeg(p, vec2(0.16, 0.38), vec2(0.84, 0.38), w),
            strokeSeg(p, vec2(0.16, 0.62), vec2(0.84, 0.62), w));
  } else if (idx < 0.28) {
    // ∫ (integral): tall vertical with hooks
    c = strokeSeg(p, vec2(0.5, 0.05), vec2(0.5, 0.95), w);
    c = max(c, strokeSeg(p, vec2(0.5, 0.95), vec2(0.74, 0.86), w));
    c = max(c, strokeSeg(p, vec2(0.5, 0.05), vec2(0.26, 0.14), w));
  } else if (idx < 0.42) {
    // ○ (variable/circle)
    float d = abs(length(p - vec2(0.5)) - 0.30);
    c = smoothstep(w, w * 0.4, d);
  } else if (idx < 0.55) {
    // × (multiply)
    c = max(strokeSeg(p, vec2(0.22, 0.22), vec2(0.78, 0.78), w),
            strokeSeg(p, vec2(0.22, 0.78), vec2(0.78, 0.22), w));
  } else if (idx < 0.68) {
    // + (plus)
    c = max(strokeSeg(p, vec2(0.16, 0.5), vec2(0.84, 0.5), w),
            strokeSeg(p, vec2(0.5, 0.16), vec2(0.5, 0.84), w));
  } else if (idx < 0.82) {
    // Σ (sigma)
    c = strokeSeg(p, vec2(0.2, 0.1), vec2(0.8, 0.1), w);
    c = max(c, strokeSeg(p, vec2(0.2, 0.9), vec2(0.8, 0.9), w));
    c = max(c, strokeSeg(p, vec2(0.2, 0.1), vec2(0.58, 0.5), w));
    c = max(c, strokeSeg(p, vec2(0.2, 0.9), vec2(0.58, 0.5), w));
  } else {
    // numeral "1" — vertical bar with serif/base
    c = strokeSeg(p, vec2(0.5, 0.12), vec2(0.5, 0.88), w);
    c = max(c, strokeSeg(p, vec2(0.32, 0.88), vec2(0.68, 0.88), w));
    c = max(c, strokeSeg(p, vec2(0.5, 0.12), vec2(0.36, 0.22), w));
  }
  return c;
}

// ---- post-process: applied to every shader's final color ----
vec3 saturateCol(vec3 c, float s) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(vec3(l), c, s);
}
vec3 postProcess(vec3 col, vec2 frag) {
  // MOOD: 0 Nocturne (default), 1 Solar, 2 Bloom, 3 Mono
  if (u_mood == 1) {
    // Solar: shift palette toward gold/amber, scorch the highlights
    col = mix(col, col.rrg * vec3(1.0, 0.85, 0.55), 0.55);
    col += pow(max(col, 0.0), vec3(2.2)) * vec3(0.35, 0.18, 0.04);
    col = saturateCol(col, 1.15);
  } else if (u_mood == 2) {
    // Bloom: cyan + magenta — rotate channels into a candy palette
    vec3 rot = vec3(col.b, col.r, col.g);
    col = mix(col, rot * vec3(1.05, 0.95, 1.15), 0.7);
    col += pow(max(col, 0.0), vec3(3.0)) * vec3(0.10, 0.05, 0.25);
    col = saturateCol(col, 1.20);
  } else if (u_mood == 3) {
    // Mono: warm black-and-white
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = vec3(l) * vec3(1.05, 0.98, 0.88);
    col += pow(l, 4.0) * vec3(0.30, 0.20, 0.10);
  }

  // LENS: 0 Raw, 1 Cinema, 2 Dream, 3 Neon
  if (u_lens == 1) {
    vec2 uv = frag / u_res - 0.5;
    float v = 1.0 - 0.95 * dot(uv, uv);
    col *= clamp(v, 0.0, 1.0);
    col = saturateCol(col, 0.78);
    col = pow(max(col, 0.0), vec3(1.05));
  } else if (u_lens == 2) {
    // Dream: lift shadows, soft glow, slight blur-feel via gamma
    col = sqrt(max(col, 0.0));
    col += pow(max(col, 0.0), vec3(2.5)) * 0.7;
    col = mix(col, col * vec3(1.05, 1.0, 1.1), 0.5);
  } else if (u_lens == 3) {
    // Neon: pump saturation, crush blacks, add chromatic glow
    col = saturateCol(col, 1.6);
    col = max(col - 0.04, 0.0) * 1.08;
    col += pow(max(col, 0.0), vec3(4.5)) * vec3(0.6, 0.3, 0.9);
  }
  return col;
}
`;

// ---------- 1. MERCURY ---------- chrome metaballs that pool toward cursor
const MERCURY = `
float field(vec2 uv, vec2 m) {
  float t = u_time * 0.32;
  float d = 100.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float orbit = 0.42 + 0.16 * sin(t * 0.6 + fi * 1.7);
    vec2 p = orbit * vec2(cos(t * 0.7 + fi * 1.31), sin(t * 0.9 + fi * 1.77));
    float r = 0.13 + 0.035 * sin(t * 1.3 + fi * 2.0);
    d = smin(d, length(uv - p) - r, 0.36);
  }
  d = smin(d, length(uv - m) - 0.20, 0.42);
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 4.0) {
        vec2 cp = (ck.xy / u_res - 0.5) * vec2(u_res.x / u_res.y, 1.0);
        float rr = dt * 0.48;
        float ring = exp(-pow((length(uv - cp) - rr) * 5.0, 2.0)) * exp(-dt * 0.85);
        d -= ring * 0.16;
      }
    }
  }
  return d;
}
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);
  float d = field(uv, m);
  vec2 e = vec2(0.004, 0.0);
  float dx = field(uv + e.xy, m) - field(uv - e.xy, m);
  float dy = field(uv + e.yx, m) - field(uv - e.yx, m);
  vec2 n = normalize(vec2(dx, dy) + 1e-6);

  // fake matcap: sky/ground based on n.y, with iridescent band
  vec3 sky    = mix(vec3(0.62, 0.74, 0.95), vec3(0.92, 0.94, 1.00), n.y * 0.5 + 0.5);
  vec3 ground = mix(vec3(0.03, 0.05, 0.10), vec3(0.18, 0.16, 0.30), -n.y * 0.5 + 0.5);
  vec3 chrome = mix(ground, sky, smoothstep(-0.35, 0.55, n.y));

  float band = sin(d * 55.0 + atan(n.y, n.x) * 3.0 + u_time * 0.5) * 0.5 + 0.5;
  chrome += pow(band, 8.0) * vec3(0.45, 0.5, 0.65);

  // rim/fresnel along the silhouette
  float edge = exp(-abs(d) * 55.0);
  chrome += edge * vec3(0.65, 0.78, 1.0) * 0.55;

  float mask = smoothstep(0.014, -0.014, d);

  // background: subtle nebula
  float bn = fbm(uv * 2.2 + u_time * 0.04);
  vec3 bg = mix(vec3(0.01, 0.012, 0.022), vec3(0.04, 0.05, 0.10), bn);
  bg += 0.05 * exp(-length(uv - m) * 2.8) * vec3(0.55, 0.7, 1.0);

  vec3 col = mix(bg, chrome, mask);
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.014;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 2. AURORA ---------- domain-warped flow with magenta/teal bands
const AURORA = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  // pull field toward cursor
  vec2 toM = m - uv;
  float dM = length(toM);
  vec2 warp = toM * exp(-dM * 1.4) * 0.55;

  vec2 p = uv + warp;
  vec2 q = vec2(fbm(p + u_time * 0.06), fbm(p + vec2(5.2, 1.3) + u_time * 0.08));
  vec2 r = vec2(fbm(p + 1.8 * q + vec2(1.7, 9.2) + u_time * 0.09),
                fbm(p + 1.8 * q + vec2(8.3, 2.8) + u_time * 0.11));
  float f = fbm(p + 2.6 * r);
  float t = f + 0.28 * sin(uv.x * 3.5 + u_time * 0.25);

  vec3 c1 = vec3(0.015, 0.025, 0.07);
  vec3 c2 = vec3(0.0, 0.55, 0.62);
  vec3 c3 = vec3(0.65, 0.12, 0.78);
  vec3 c4 = vec3(0.98, 0.88, 0.55);

  vec3 col = c1;
  col = mix(col, c2, smoothstep(0.30, 0.50, t));
  col = mix(col, c3, smoothstep(0.50, 0.70, t));
  col = mix(col, c4, smoothstep(0.78, 0.88, t));

  // cursor halo
  col += exp(-dM * 3.8) * vec3(0.5, 0.35, 0.7) * 0.35;
  col += exp(-dM * 14.0) * vec3(1.0, 0.95, 0.9) * 0.4;

  // click pulses: bright rings that fade
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.55;
        float ring = exp(-pow((length(uv - cp) - rr) * 10.0, 2.0)) * exp(-dt * 0.9);
        col += ring * vec3(0.75, 0.95, 1.0) * 1.4;
      }
    }
  }
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 3. LATTICE ---------- voronoi crystals; cursor seeds a cell
const LATTICE = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  float scale = 7.5;
  vec2 g = uv * scale;
  vec2 gi = floor(g);
  vec2 gf = fract(g);

  float minD = 10.0, minD2 = 10.0;
  vec2 minSite = vec2(0.0);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 nb = vec2(float(x), float(y));
      vec2 cell = gi + nb;
      vec2 h = hash22(cell);
      vec2 site = nb + 0.5 + 0.42 * vec2(sin(u_time * 0.6 + h.x * 6.28),
                                          cos(u_time * 0.5 + h.y * 6.28));
      float d = length(site - gf);
      if (d < minD) { minD2 = minD; minD = d; minSite = cell; }
      else if (d < minD2) { minD2 = d; }
    }
  }
  // cursor as moving site
  vec2 ms = m * scale;
  float dM = length(ms - g);
  if (dM < minD) { minD2 = minD; minD = dM; minSite = vec2(-9999.0); }
  else if (dM < minD2) { minD2 = dM; }

  float edge = minD2 - minD;
  float h = hash21(minSite);

  vec3 jewelA = vec3(0.95, 0.55, 0.25); // amber
  vec3 jewelB = vec3(0.85, 0.25, 0.55); // ruby
  vec3 jewelC = vec3(0.2, 0.45, 0.95);  // sapphire
  vec3 jewelD = vec3(0.25, 0.85, 0.65); // emerald
  vec3 cellCol = mix(jewelA, jewelB, smoothstep(0.0, 0.33, h));
  cellCol = mix(cellCol, jewelC, smoothstep(0.33, 0.66, h));
  cellCol = mix(cellCol, jewelD, smoothstep(0.66, 1.0, h));
  float darken = 0.18 + 0.55 * hash21(minSite + 1.27);
  cellCol *= darken;

  // mouse-owned cell glows brighter
  if (minSite.x < -9000.0) {
    cellCol = mix(cellCol, vec3(1.0, 0.96, 0.9), 0.55);
  }

  vec3 col = cellCol;
  // bright edges
  float edgeMask = smoothstep(0.05, 0.0, edge);
  col = mix(col, vec3(1.0, 0.95, 0.85), edgeMask * 0.9);
  // inner cell shading using minD (distance to nearest seed)
  col *= 0.55 + 0.55 * (1.0 - minD);
  // cursor halo
  col += exp(-length(uv - m) * 3.5) * vec3(0.8, 0.9, 1.0) * 0.18;

  // click cracks
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 2.6) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.65;
        float r1 = exp(-pow((length(uv - cp) - rr) * 14.0, 2.0)) * exp(-dt * 1.1);
        float r2 = exp(-pow((length(uv - cp) - rr * 0.55) * 16.0, 2.0)) * exp(-dt * 1.4);
        col += (r1 + r2) * vec3(1.0, 0.95, 0.85) * 1.2;
      }
    }
  }
  // vignette
  col *= 1.0 - 0.35 * pow(length(uv) * 0.9, 2.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 4. PLASMA ---------- iridescent fluid, mouse is heat source
const PLASMA = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);
  float t = u_time * 0.32;

  vec2 p = uv * 2.6;
  vec2 mp = m * 2.6;
  float v = 0.0;
  v += sin(p.x * 1.3 + t);
  v += sin(p.y * 1.7 + t * 0.85);
  v += sin((p.x + p.y) * 0.85 + t * 1.15);
  v += sin(length(p - mp) * 2.4 - t * 1.6);
  v += sin(length(p + vec2(sin(t * 0.7), cos(t * 0.9))) * 1.4 + t * 0.7);
  v *= 0.2;

  // mouse heat: local oscillation
  float heat = exp(-length(uv - m) * 2.2);
  v += heat * sin(length(uv - m) * 22.0 - u_time * 3.2) * 0.32;

  // click shockwaves push v
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 2.5) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.7;
        float ring = exp(-pow((length(uv - cp) - rr) * 5.0, 2.0)) * exp(-dt * 0.95);
        v += ring * 2.4;
      }
    }
  }

  // iqs cosine palette, twisted
  vec3 a = vec3(0.50, 0.45, 0.55);
  vec3 b = vec3(0.50, 0.50, 0.55);
  vec3 c = vec3(1.00, 1.00, 1.00);
  vec3 d = vec3(0.10, 0.25, 0.55);
  vec3 col = a + b * cos(6.28318 * (c * v + d));

  // deepen shadows
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col *= mix(0.55, 1.15, smoothstep(0.2, 0.85, lum));

  // soft cursor halo
  col += heat * vec3(0.25, 0.18, 0.35) * 0.5;

  // gentle vignette
  col *= 1.0 - 0.28 * length(uv) * 0.9;

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 5. PRISM ---------- refractive glass shard, chromatic aberration
const PRISM = `
vec3 patternBG(vec2 uv) {
  // luminous gradient with drifting grid + soft bokeh
  float n = fbm(uv * 1.4 + u_time * 0.05);
  vec3 a = vec3(0.04, 0.07, 0.16);
  vec3 b = vec3(0.45, 0.10, 0.55);
  vec3 c = vec3(0.10, 0.35, 0.65);
  vec3 bg = mix(a, b, smoothstep(0.2, 0.8, n));
  bg = mix(bg, c, smoothstep(0.5, 0.9, fbm(uv * 2.0 - u_time * 0.04)));

  vec2 g = abs(fract(uv * 4.5 + u_time * 0.05) - 0.5);
  float grid = smoothstep(0.49, 0.495, max(g.x, g.y));
  bg += grid * vec3(0.35, 0.55, 0.9) * 0.22;

  // a few drifting orbs
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 op = 0.7 * vec2(cos(u_time * 0.2 + fi * 1.7), sin(u_time * 0.17 + fi * 2.3));
    float d = length(uv - op);
    bg += exp(-d * 6.0) * 0.5 * vec3(0.6 + 0.3 * sin(fi), 0.5 + 0.3 * cos(fi * 1.7), 0.9);
  }
  return bg;
}
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  // rotating shard centered on cursor; rotation grows with click energy
  float clickEnergy = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 4.0) clickEnergy += exp(-dt * 0.6);
    }
  }
  float ang = u_time * 0.12 + length(m) * 1.4 + clickEnergy * 1.2;
  float ca = cos(ang), sa = sin(ang);
  vec2 p = mat2(ca, -sa, sa, ca) * (uv - m);

  // sdf rounded square shard
  vec2 bx = vec2(0.26, 0.20);
  vec2 q = abs(p) - bx;
  float sdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.05;

  float inside = smoothstep(0.006, -0.006, sdf);

  // approximate normal for fresnel
  vec2 e = vec2(0.003, 0.0);
  float sdx = (length(max(abs((mat2(ca,-sa,sa,ca)*(uv+e.xy-m))) - bx, 0.0)) - 0.05)
            - (length(max(abs((mat2(ca,-sa,sa,ca)*(uv-e.xy-m))) - bx, 0.0)) - 0.05);
  float sdy = (length(max(abs((mat2(ca,-sa,sa,ca)*(uv+e.yx-m))) - bx, 0.0)) - 0.05)
            - (length(max(abs((mat2(ca,-sa,sa,ca)*(uv-e.yx-m))) - bx, 0.0)) - 0.05);
  vec2 nrm = normalize(vec2(sdx, sdy) + 1e-6);

  // refraction: shift sample by inward normal scaled by depth
  float depth = clamp(-sdf, 0.0, 0.3);
  vec2 rOff = -nrm * (0.18 + 0.6 * depth);
  vec3 col;
  col.r = patternBG(uv + rOff * 0.92).r;
  col.g = patternBG(uv + rOff * 1.00).g;
  col.b = patternBG(uv + rOff * 1.08).b;

  vec3 bgCol = patternBG(uv);
  col = mix(bgCol, col, inside);

  // tinted body
  col = mix(col, col * vec3(1.1, 1.05, 1.2), inside * 0.35);

  // bright edge highlight
  float edge = smoothstep(0.02, 0.0, abs(sdf));
  col += edge * vec3(1.0, 0.96, 0.9) * 0.9;

  // specular dot from a fake light
  vec3 L = normalize(vec3(0.4, 0.7, 0.6));
  float spec = pow(max(dot(vec3(nrm, 0.7), L), 0.0), 22.0);
  col += spec * inside * vec3(1.0) * 0.7;

  // click shockwaves
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 2.5) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.55;
        float ring = exp(-pow((length(uv - cp) - rr) * 12.0, 2.0)) * exp(-dt * 1.1);
        col += ring * vec3(0.9, 0.95, 1.0) * 0.9;
      }
    }
  }
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 6. NEBULA ---------- volumetric cosmic clouds, cursor stirs them
const NEBULA = `
float starLayer(vec2 uv, float scale, float seed) {
  vec2 g = uv * scale + seed;
  vec2 gi = floor(g);
  vec2 gf = fract(g);
  vec2 h = hash22(gi);
  float d = length((gf - h) * 2.0 - 1.0) * 0.5 + length(gf - h);
  float twinkle = 0.6 + 0.4 * sin(u_time * 2.0 + hash21(gi) * 6.28);
  return exp(-d * 60.0) * step(0.93, hash21(gi + 11.0)) * twinkle;
}
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  // pull clouds toward the cursor
  vec2 toM = m - uv;
  vec2 p = uv + toM * exp(-length(toM) * 1.3) * 0.45;

  float n1 = fbm(p * 1.8 + u_time * 0.04);
  float n2 = fbm(p * 3.2 - u_time * 0.05 + n1);
  float n3 = fbm(p * 0.9 + 1.4 * n1);

  vec3 c1 = vec3(0.02, 0.012, 0.06);
  vec3 c2 = vec3(0.55, 0.10, 0.62);
  vec3 c3 = vec3(0.95, 0.40, 0.30);
  vec3 c4 = vec3(0.18, 0.65, 1.00);

  vec3 col = c1;
  col = mix(col, c2, smoothstep(0.30, 0.62, n1));
  col = mix(col, c3, smoothstep(0.55, 0.78, n2) * 0.75);
  col = mix(col, c4, smoothstep(0.55, 0.85, n3) * 0.55);

  // stars
  float stars = 0.0;
  stars += starLayer(uv, 60.0, 0.0);
  stars += starLayer(uv, 110.0, 23.0) * 0.7;
  stars += starLayer(uv, 180.0, 51.0) * 0.5;
  col += stars * vec3(1.0, 0.98, 0.95);

  // cursor warmth
  col += exp(-length(uv - m) * 3.4) * vec3(0.55, 0.40, 0.75) * 0.30;

  // click bursts: bright nebula flash
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.55;
        float ring = exp(-pow((length(uv - cp) - rr) * 9.0, 2.0)) * exp(-dt * 0.9);
        float bloom = exp(-length(uv - cp) * 3.5) * exp(-dt * 1.5);
        col += ring * vec3(0.9, 0.8, 1.0) * 1.5;
        col += bloom * vec3(0.7, 0.4, 0.95) * 1.2;
      }
    }
  }
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 7. GALAXY ---------- spiral disk seen from above
const GALAXY = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  // galaxy follows the cursor with inertia (m already smoothed)
  vec2 d = uv - m;
  // slight ellipse tilt
  d.y *= 1.15;
  float r = length(d);
  float a = atan(d.y, d.x);

  float arms = 3.0;
  // logarithmic spiral
  float twist = a * arms - log(max(r, 0.005)) * 5.0 - u_time * 0.18;
  float arm = 0.5 + 0.5 * sin(twist);
  arm = pow(arm, 3.0);

  // density along arms, modulated by noise for clumpiness
  float clump = fbm(vec2(twist * 0.4, r * 6.0) + u_time * 0.04);
  float density = arm * exp(-r * 1.7) * (0.6 + 0.9 * clump);

  // arm color: hot core → magenta → blue at the edge
  vec3 armCol = mix(vec3(0.18, 0.35, 1.0), vec3(0.95, 0.45, 0.85), smoothstep(0.0, 0.5, r));
  armCol = mix(armCol, vec3(1.0, 0.85, 0.55), smoothstep(0.0, 0.18, r) * arm);

  vec3 col = density * armCol * 1.6;

  // bright galactic core
  col += exp(-r * 9.0) * vec3(1.0, 0.92, 0.75) * 2.4;
  col += exp(-r * 3.0) * vec3(0.95, 0.55, 0.30) * 0.45;

  // foreground stars
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sc = 70.0 + fi * 50.0;
    vec2 g = uv * sc + fi * 13.7;
    vec2 gi = floor(g);
    vec2 gf = fract(g);
    vec2 h = hash22(gi);
    float dd = length(gf - h);
    float s = exp(-dd * 55.0) * step(0.94, hash21(gi + 0.5));
    col += s * vec3(1.0, 0.97, 0.9);
  }

  // deep space background
  float bgn = fbm(uv * 0.8);
  col += vec3(0.01, 0.012, 0.025) + bgn * vec3(0.04, 0.02, 0.06);

  // click shockwave through the disk
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.55;
        float ring = exp(-pow((length(uv - cp) - rr) * 10.0, 2.0)) * exp(-dt * 1.0);
        col += ring * vec3(0.9, 0.85, 1.0) * 1.4;
      }
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 8. SINGULARITY ---------- black hole w/ gravitational lensing
const SINGULARITY = `
vec3 starfield(vec2 uv) {
  vec3 col = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float fl = float(layer);
    float sc = 70.0 + fl * 55.0;
    vec2 g = uv * sc + fl * 17.3;
    vec2 gi = floor(g);
    vec2 gf = fract(g);
    vec2 h = hash22(gi);
    float dd = length(gf - h);
    float twinkle = 0.7 + 0.3 * sin(u_time * 2.2 + hash21(gi) * 6.28);
    float star = exp(-dd * 55.0) * step(0.93, hash21(gi + 0.5)) * twinkle;
    col += star * vec3(0.95, 0.97, 1.05);
  }
  // distant nebula tint
  float n = fbm(uv * 1.1 + u_time * 0.02);
  col += smoothstep(0.55, 0.85, n) * vec3(0.18, 0.08, 0.30) * 0.6;
  col += smoothstep(0.55, 0.85, fbm(uv * 1.4 - 3.0)) * vec3(0.05, 0.15, 0.30) * 0.5;
  return col;
}
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 bh = toAR(u_mouseSmooth);

  vec2 d = uv - bh;
  float r = length(d);
  float a = atan(d.y, d.x);

  // gravitational lensing: warp samples radially inward, stronger near horizon
  float lensStrength = 0.055;
  // mass grows briefly with clicks
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) lensStrength += 0.03 * exp(-dt * 1.2);
    }
  }
  float lens = lensStrength / max(r * r, 0.004);
  vec2 sampled = uv - normalize(d) * lens;

  vec3 col = starfield(sampled);

  // accretion disk: bright ring with doppler boost on one side
  float disk = exp(-pow((r - 0.22) * 12.0, 2.0));
  float spin = a * 5.0 + u_time * 1.6 + r * 22.0;
  float diskPat = 0.4 + 0.6 * sin(spin) * 0.5 + 0.5 * sin(spin * 0.3);
  // doppler: brighten where motion is toward us (left side)
  float doppler = 0.5 + 0.5 * cos(a);
  vec3 diskCol = mix(vec3(1.00, 0.45, 0.10), vec3(1.00, 0.92, 0.70), diskPat);
  diskCol *= 0.7 + 1.1 * doppler;
  col += disk * diskCol * 1.9;

  // event horizon (pure black inside)
  float eh = smoothstep(0.115, 0.105, r);
  col *= 1.0 - eh;

  // bright photon ring right at horizon edge
  float pr = exp(-pow((r - 0.118) * 90.0, 2.0));
  col += pr * vec3(1.0, 0.85, 0.55) * 2.4;

  // outer halo
  col += exp(-pow((r - 0.30) * 5.0, 2.0)) * vec3(0.45, 0.18, 0.55) * 0.4;

  // click shockwaves (in addition to mass bump)
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 2.5) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.6;
        float ring = exp(-pow((length(uv - cp) - rr) * 10.0, 2.0)) * exp(-dt * 1.1);
        col += ring * vec3(0.9, 0.95, 1.0) * 0.9;
      }
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 9. WORMHOLE ---------- log-polar tunnel
const WORMHOLE = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  vec2 d = uv - m;
  float r = length(d);
  float a = atan(d.y, d.x);

  // map radius to "depth" — small r = far down the tunnel
  float depth = 0.35 / max(r, 0.012);
  // travel speed boosted by clicks
  float boost = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.5) boost += 1.8 * exp(-dt * 0.9);
    }
  }
  float z = depth + u_time * (0.65 + boost);

  // wave the angle a little so the tunnel feels organic
  float aw = a + 0.18 * sin(z * 0.4) + 0.12 * sin(z * 0.13);

  vec2 tuv = vec2(aw * 0.85, z);
  float pat = fbm(tuv * vec2(1.3, 1.1));
  float bands = 0.5 + 0.5 * sin(z * 3.0 + pat * 4.0);

  vec3 cA = vec3(0.04, 0.06, 0.22);
  vec3 cB = vec3(0.75, 0.25, 0.95);
  vec3 cC = vec3(0.18, 0.85, 1.00);
  vec3 col = mix(cA, cB, pat);
  col = mix(col, cC, smoothstep(0.55, 0.85, pat));
  col *= 0.55 + 0.7 * bands;

  // streaks of light running down the tunnel
  vec2 sg = vec2(aw * 12.0, z * 2.5);
  vec2 sgi = floor(sg);
  vec2 sgf = fract(sg);
  vec2 sh = hash22(sgi);
  float streak = exp(-abs(sgf.x - sh.x) * 18.0) * step(0.55, hash21(sgi));
  col += streak * vec3(0.95, 0.85, 1.0) * 0.9;

  // dark throat
  col *= smoothstep(0.0, 0.18, r);
  // bright lip around throat
  col += exp(-pow((r - 0.05) * 28.0, 2.0)) * vec3(1.0, 0.88, 0.65) * 1.5;

  // fade far edge
  col *= 1.0 - smoothstep(0.95, 1.4, r) * 0.7;

  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 10. HYPERSPACE ---------- radial star streaks from cursor
const HYPERSPACE = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  vec2 d = uv - m;
  float r = length(d);
  float a = atan(d.y, d.x);

  // speed boost from clicks
  float boost = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) boost += 3.0 * exp(-dt * 1.0);
    }
  }

  // log-polar streaks
  float lr = log(max(r, 0.002));
  float speed = 1.6 + boost;
  vec2 lp = vec2(a * 4.0, lr * 3.2 - u_time * speed);

  float streak = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 g = lp + fi * vec2(0.31, 0.71);
    vec2 gi = floor(g);
    vec2 gf = fract(g);
    vec2 h = hash22(gi);
    // long radial streaks: tight on tangential axis, long on radial
    vec2 e = (gf - h) * vec2(8.0, 0.55);
    float s = exp(-dot(e, e) * 1.4);
    s *= step(0.55, hash21(gi + fi));
    streak += s * (0.6 + 0.4 * hash21(gi + fi * 3.1));
  }

  // hue varies with angle
  vec3 streakCol = mix(vec3(0.7, 0.85, 1.2), vec3(1.1, 0.95, 0.75), 0.5 + 0.5 * sin(a * 2.0));
  vec3 col = streak * streakCol;

  // bright center vortex
  col += exp(-r * 4.5) * vec3(0.55, 0.78, 1.10) * (0.6 + 0.5 * boost);
  col += exp(-r * 16.0) * vec3(1.0, 0.95, 0.85) * 1.6;

  // deep blue space
  col += vec3(0.012, 0.018, 0.040);

  // subtle radial vignette
  col *= 1.0 - 0.18 * smoothstep(0.6, 1.4, length(uv));

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 11. MANIFOLD ---------- aurora flow with drifting math equation rows
const MANIFOLD = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  // base: aurora-style domain-warped flow
  vec2 toM = m - uv;
  float dM = length(toM);
  vec2 warp = toM * exp(-dM * 1.5) * 0.42;
  vec2 p = uv + warp;
  vec2 q = vec2(fbm(p + u_time * 0.05), fbm(p + vec2(5.2, 1.3) - u_time * 0.05));
  float f = fbm(p + 2.0 * q + u_time * 0.04);

  vec3 c1 = vec3(0.02, 0.03, 0.08);
  vec3 c2 = vec3(0.08, 0.32, 0.55);
  vec3 c3 = vec3(0.55, 0.18, 0.78);
  vec3 c4 = vec3(0.95, 0.85, 0.55);
  vec3 col = c1;
  col = mix(col, c2, smoothstep(0.30, 0.55, f));
  col = mix(col, c3, smoothstep(0.55, 0.72, f));
  col = mix(col, c4, smoothstep(0.78, 0.92, f) * 0.55);

  // ---- glyph rows: each row of math symbols drifts horizontally ----
  vec2 guv = uv + warp * 0.55;
  float rowH = 0.085;
  float rowI = floor((guv.y + 0.5) / rowH);
  float yInRow = fract((guv.y + 0.5) / rowH);

  float glyphMask = 0.0;
  if (yInRow > 0.10 && yInRow < 0.90) {
    float seed = hash21(vec2(rowI, 13.7));
    float dir = (seed > 0.5) ? 1.0 : -1.0;
    float speed = 0.04 + 0.09 * seed;
    float cellW = 0.052;
    float cellF = (guv.x + u_time * speed * dir + seed * 100.0) / cellW;
    float ci = floor(cellF);
    float cf = fract(cellF);
    float h = hash21(vec2(ci, rowI * 7.1 + 11.0));
    float groupH = hash21(vec2(floor(ci / 5.0), rowI * 3.1));
    if (groupH > 0.42 && h > 0.25) {
      float gIdx = hash21(vec2(ci * 1.31, rowI + 4.7));
      vec2 cellP = vec2(cf, (yInRow - 0.10) / 0.80);
      glyphMask = mathGlyph(cellP, gIdx);
    }
  }

  vec3 glyphCol = vec3(0.70, 0.95, 1.10);
  float mouseGlow = exp(-length(uv - m) * 2.4);
  float rowPulse = 0.55 + 0.35 * sin(u_time * 0.9 + rowI * 1.4);
  vec3 lit = glyphCol * (0.70 + 1.4 * mouseGlow) * rowPulse;
  col += glyphMask * lit * 0.85;
  col += pow(glyphMask, 2.5) * vec3(1.0, 0.95, 0.85) * 0.55;

  col += mouseGlow * vec3(0.30, 0.50, 0.75) * 0.22;

  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(ck.xy);
        float burst = exp(-length(uv - cp) * 2.3) * exp(-dt * 0.9);
        col += burst * glyphMask * vec3(1.0, 0.85, 0.55) * 3.0;
        float rr = dt * 0.55;
        float ring = exp(-pow((length(uv - cp) - rr) * 10.0, 2.0)) * exp(-dt * 1.0);
        col += ring * vec3(0.85, 0.95, 1.0) * 1.0;
      }
    }
  }

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 12. LAGRANGIAN ---------- nebula clouds with equations writing themselves
const LAGRANGIAN = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  vec2 toM = m - uv;
  vec2 p = uv + toM * exp(-length(toM) * 1.3) * 0.30;
  float n1 = fbm(p * 1.6 + u_time * 0.035);
  float n2 = fbm(p * 3.0 - u_time * 0.04 + n1);

  vec3 c1 = vec3(0.012, 0.010, 0.040);
  vec3 c2 = vec3(0.35, 0.06, 0.55);
  vec3 c3 = vec3(0.10, 0.40, 0.85);
  vec3 col = c1;
  col = mix(col, c2, smoothstep(0.32, 0.65, n1));
  col = mix(col, c3, smoothstep(0.55, 0.85, n2) * 0.55);

  // dim star dust
  vec2 sg = uv * 90.0;
  vec2 sgi = floor(sg);
  vec2 sgf = fract(sg);
  vec2 sh = hash22(sgi);
  float star = exp(-length(sgf - sh) * 50.0) * step(0.94, hash21(sgi + 0.7));
  col += star * vec3(1.0, 0.98, 0.92);

  // 5 simultaneous rows; each writes itself out then idles + restarts
  for (int row = 0; row < 5; row++) {
    float fr = float(row);
    float rowSeed = hash21(vec2(fr, 17.3));
    float rowY = -0.42 + fr * 0.21 + (rowSeed - 0.5) * 0.04;
    float rowH = 0.08;
    float yInRow = (uv.y - rowY) / rowH + 0.5;
    if (yInRow < 0.0 || yInRow > 1.0) continue;

    float cycle = 4.5 + 2.0 * rowSeed;
    float phase = mod(u_time + rowSeed * 13.0, cycle) / cycle;
    float progress = smoothstep(0.0, 0.55, phase) * smoothstep(1.0, 0.85, phase);
    float rowAlpha = smoothstep(0.0, 0.05, phase) * (1.0 - smoothstep(0.85, 1.0, phase));
    float written = progress;

    float cellW = 0.048;
    float cellF = (uv.x + 0.85) / cellW;
    float ci = floor(cellF);
    float cf = fract(cellF);
    float xNorm = (uv.x + 0.85) / 1.7;
    if (xNorm > written) continue;

    float h = hash21(vec2(ci, fr * 5.0 + 3.1));
    float groupH = hash21(vec2(floor(ci / 6.0), fr * 2.3));
    if (groupH < 0.30 || h < 0.20) continue;

    float gIdx = hash21(vec2(ci * 1.71, fr + 2.3));
    vec2 cellP = vec2(cf, yInRow);
    float gm = mathGlyph(cellP, gIdx);

    float wear = fbm(uv * 70.0 + fr);
    gm *= 0.75 + 0.45 * wear;

    float tipBoost = smoothstep(0.95, 1.0, xNorm / max(written, 0.001));
    vec3 ink = mix(vec3(0.92, 0.96, 1.00), vec3(1.0, 0.85, 0.55), tipBoost);
    col = mix(col, ink, clamp(gm * rowAlpha, 0.0, 1.0));
  }

  col += exp(-length(uv - m) * 3.0) * vec3(0.4, 0.5, 0.85) * 0.25;

  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 2.5) {
        vec2 cp = toAR(ck.xy);
        float splash = exp(-length(uv - cp) * 4.5) * exp(-dt * 1.3);
        col += splash * vec3(1.0, 0.90, 0.70) * 1.6;
        float rr = dt * 0.5;
        float ring = exp(-pow((length(uv - cp) - rr) * 11.0, 2.0)) * exp(-dt * 1.0);
        col += ring * vec3(0.95, 0.85, 0.65) * 0.9;
      }
    }
  }

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.010;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 13. RIEMANN ---------- complex function domain coloring
const RIEMANN = `
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  // map to complex plane; mouse is the moving origin (zero of f)
  vec2 z = uv * 2.4 - m * 2.4;
  float ang = u_time * 0.13;
  float ca = cos(ang), sa = sin(ang);
  z = mat2(ca, -sa, sa, ca) * z;

  // f(z) = z^3 - 1  (three zeros at 120 degrees)
  vec2 z2 = cmul(z, z);
  vec2 z3 = cmul(z2, z);
  vec2 f = z3 - vec2(1.0, 0.0);

  // clicks add temporary zeros
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 4.0) {
        vec2 cp = (toAR(ck.xy) - m) * 2.4;
        cp = mat2(ca, -sa, sa, ca) * cp;
        float strength = exp(-dt * 0.7);
        f = mix(f, cmul(f, z - cp), strength);
      }
    }
  }

  float mag = length(f);
  float arg = atan(f.y, f.x);

  float hue = arg / 6.2832 + 0.5 + u_time * 0.018;
  float light = 1.0 - 1.0 / (1.0 + mag * 0.45);
  vec3 col = hsv2rgb(vec3(hue, 0.78, mix(0.10, 0.80, light)));
  col = mix(col, col * vec3(0.65, 0.75, 0.95), 0.30);

  float magC = abs(fract(log2(mag + 0.4) * 2.5) - 0.5);
  col += smoothstep(0.05, 0.0, magC) * vec3(0.30, 0.50, 0.75) * 0.6;

  float phaseC = abs(fract(arg * 3.0 / 6.2832) - 0.5);
  col += smoothstep(0.04, 0.0, phaseC) * vec3(0.80, 0.55, 0.95) * 0.4;

  col += exp(-mag * 7.0) * vec3(1.0, 0.95, 0.70) * 0.85;

  // sparse floating formula glyphs
  vec2 lp = uv + vec2(sin(u_time * 0.1), cos(u_time * 0.13)) * 0.04;
  float labelRow = floor((lp.y + 0.5) / 0.12);
  float labelY = fract((lp.y + 0.5) / 0.12);
  if (labelY > 0.30 && labelY < 0.70) {
    float lcW = 0.06;
    float lcF = lp.x / lcW + labelRow * 17.0;
    float lci = floor(lcF);
    float lcf = fract(lcF);
    float lh = hash21(vec2(lci, labelRow));
    if (lh > 0.85) {
      float lg = mathGlyph(vec2(lcf, (labelY - 0.30) / 0.40), hash21(vec2(lci, labelRow + 1.1)));
      col += lg * vec3(0.95, 0.95, 1.0) * 0.35 * (0.5 + 0.5 * sin(u_time + lci));
    }
  }

  col += exp(-length(uv - m) * 32.0) * vec3(1.0, 1.0, 0.95) * 1.8;
  col += exp(-length(uv - m) * 6.0) * vec3(1.0, 0.9, 0.7) * 0.4;

  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 2.5) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.5;
        float ring = exp(-pow((length(uv - cp) - rr) * 11.0, 2.0)) * exp(-dt * 1.0);
        col += ring * vec3(0.95, 0.85, 1.0) * 1.0;
      }
    }
  }

  col *= 1.0 - 0.25 * length(uv);
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 14. CONSTELLATION ---------- moving nodes with edges between near ones
const CONSTELLATION = `
// 24 moving nodes. Each node orbits a base position with a small radius.
vec2 nodePos(int i, float t) {
  float fi = float(i);
  vec2 seed = vec2(hash21(vec2(fi, 1.7)), hash21(vec2(fi, 11.3)));
  // base position spread over a wide rectangle
  vec2 base = (seed - 0.5) * vec2(1.95, 1.30);
  float orbR = 0.08 + 0.10 * hash21(vec2(fi, 4.2));
  float spd = 0.18 + 0.42 * hash21(vec2(fi, 7.7));
  float ph = hash21(vec2(fi, 9.1)) * 6.2832;
  vec2 orbit = orbR * vec2(cos(t * spd + ph), sin(t * spd * 0.83 + ph * 1.31));
  return base + orbit;
}
float segmentDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  // base: deep navy with subtle aurora wash
  vec2 toM = m - uv;
  float dM = length(toM);
  vec2 warp = toM * exp(-dM * 1.6) * 0.20;
  vec2 p = uv + warp;
  float n1 = fbm(p * 1.5 + u_time * 0.03);
  float n2 = fbm(p * 2.8 - u_time * 0.04 + 0.7 * n1);
  vec3 deep   = vec3(0.010, 0.020, 0.055);
  vec3 mid    = vec3(0.04, 0.16, 0.36);
  vec3 accent = vec3(0.18, 0.52, 0.85);
  vec3 col = mix(deep, mid, smoothstep(0.30, 0.70, n1));
  col = mix(col, accent, smoothstep(0.55, 0.85, n2) * 0.40);

  // cursor pulls nodes slightly closer to it (visual gravity)
  float pullStrength = 0.18 + exp(-dM * 1.6) * 0.20;
  // click energy → flash + temporary repulsion outward
  float clickFlash = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 2.5) clickFlash += exp(-dt * 1.3);
    }
  }

  // collect node positions (precompute once per fragment — small N, GPU is fast)
  vec2 nodes[24];
  for (int i = 0; i < 24; i++) {
    vec2 np = nodePos(i, u_time);
    // gravity toward cursor
    vec2 d = m - np;
    np += d * pullStrength * 0.18;
    nodes[i] = np;
  }

  // draw edges: between every pair within threshold distance
  float edgeMask = 0.0;
  float edgeMax = 0.34; // max length for a visible edge
  for (int i = 0; i < 24; i++) {
    for (int j = 0; j < 24; j++) {
      if (j <= i) continue;
      vec2 a = nodes[i];
      vec2 b = nodes[j];
      float L = length(a - b);
      if (L > edgeMax) continue;
      float d = segmentDist(uv, a, b);
      // line thickness 0.0015, fade with length
      float lineW = 0.0015;
      float line = smoothstep(lineW * 4.0, lineW, d);
      float strength = (1.0 - L / edgeMax);
      strength = pow(strength, 1.8);
      edgeMask = max(edgeMask, line * strength);
    }
  }

  // draw nodes: bright glowing dots
  float nodeMask = 0.0;
  float nodeCore = 0.0;
  for (int i = 0; i < 24; i++) {
    float d = length(uv - nodes[i]);
    nodeMask = max(nodeMask, exp(-d * 75.0));
    nodeCore = max(nodeCore, smoothstep(0.010, 0.004, d));
  }

  // edge color: cool cyan; cursor warms it
  vec3 edgeCol = mix(vec3(0.45, 0.75, 1.05), vec3(0.85, 0.95, 1.10), exp(-dM * 1.8) * 0.6);
  col += edgeMask * edgeCol * (0.85 + clickFlash * 1.5);

  // node glow halo + bright core
  col += nodeMask * vec3(0.55, 0.85, 1.10) * (1.1 + clickFlash * 1.4);
  col += nodeCore * vec3(1.0, 0.98, 0.92) * 1.4;

  // cursor halo
  col += exp(-dM * 4.5) * vec3(0.30, 0.55, 0.90) * 0.45;
  col += exp(-dM * 18.0) * vec3(0.95, 0.98, 1.0) * 0.55;

  // click shockwave rings
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 2.4) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.6;
        float ring = exp(-pow((length(uv - cp) - rr) * 11.0, 2.0)) * exp(-dt * 1.0);
        col += ring * vec3(0.80, 0.95, 1.10) * 1.1;
      }
    }
  }

  // very subtle starfield far below the nodes
  vec2 sg = uv * 110.0;
  vec2 sgi = floor(sg);
  vec2 sgf = fract(sg);
  vec2 sh = hash22(sgi);
  float starDot = exp(-length(sgf - sh) * 60.0) * step(0.965, hash21(sgi + 0.5));
  col += starDot * vec3(0.55, 0.75, 0.95) * 0.55;

  // mild vignette
  col *= 1.0 - 0.18 * length(uv);

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.010;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 15. SILK ---------- slow monochrome navy ribbons
const SILK = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  // very gentle pull, smaller radius
  vec2 toM = m - uv;
  float dM = length(toM);
  vec2 warp = toM * exp(-dM * 2.2) * 0.18;

  // anisotropic noise stretched horizontally → ribbon feel
  vec2 p = (uv + warp) * vec2(1.1, 2.6);
  float n1 = fbm(p + u_time * 0.04);
  float n2 = fbm(p * 1.6 - u_time * 0.03 + n1 * 0.5);
  float t = smoothstep(0.30, 0.70, mix(n1, n2, 0.55));

  // monochromatic deep navy → cool slate
  vec3 a = vec3(0.020, 0.030, 0.062);
  vec3 b = vec3(0.060, 0.085, 0.140);
  vec3 c = vec3(0.180, 0.215, 0.290);
  vec3 d = vec3(0.520, 0.585, 0.700);
  vec3 col = mix(a, b, t);
  col = mix(col, c, smoothstep(0.55, 0.80, t));
  col = mix(col, d, smoothstep(0.86, 0.96, t) * 0.55);

  // subtle horizontal sheen line that drifts
  float sheen = exp(-pow((uv.y - 0.05 * sin(u_time * 0.15)) * 8.0, 2.0));
  col += sheen * vec3(0.10, 0.13, 0.18) * 0.35;

  // gentle cursor pool — desaturated, near content color
  col += exp(-dM * 5.5) * vec3(0.16, 0.22, 0.32) * 0.50;

  // soft click: a slow expanding band of brightness, no sharp rings
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 4.0) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.35;
        float band = exp(-pow((length(uv - cp) - rr) * 3.5, 2.0)) * exp(-dt * 0.55);
        col += band * vec3(0.45, 0.55, 0.75) * 0.35;
      }
    }
  }

  // very fine grain
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.008;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 16. VAPOR ---------- soft vertical mist drifting upward
const VAPOR = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  // mist rises slowly; horizontal drift modulated by noise
  vec2 p = uv;
  p.y -= u_time * 0.045;
  p.x += 0.06 * sin(uv.y * 2.2 + u_time * 0.10);

  // cursor heat lifts a small column
  float heat = exp(-length(uv - m) * 2.4);
  p.y -= heat * 0.10;

  float n1 = fbm(p * vec2(1.8, 1.1));
  float n2 = fbm(p * vec2(3.6, 2.0) + n1 * 0.7);
  float t = smoothstep(0.32, 0.78, n1 * 0.6 + n2 * 0.55);

  // muted dawn palette: deep teal → dusty rose
  vec3 a = vec3(0.020, 0.035, 0.060);
  vec3 b = vec3(0.060, 0.150, 0.180);
  vec3 c = vec3(0.220, 0.240, 0.300);
  vec3 d = vec3(0.460, 0.380, 0.430);
  vec3 e = vec3(0.880, 0.760, 0.700);
  vec3 col = mix(a, b, t);
  col = mix(col, c, smoothstep(0.45, 0.70, t));
  col = mix(col, d, smoothstep(0.70, 0.85, t));
  col = mix(col, e, smoothstep(0.88, 0.97, t) * 0.6);

  // vertical light shafts (subtle god rays)
  float shaft = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x0 = -0.6 + fi * 0.6 + 0.18 * sin(u_time * 0.08 + fi * 2.3);
    float s = exp(-pow((uv.x - x0) * 5.5, 2.0));
    shaft += s * (0.5 + 0.5 * sin(u_time * 0.3 + fi * 1.7));
  }
  col += shaft * vec3(0.22, 0.20, 0.26) * 0.20;

  col += heat * vec3(0.30, 0.22, 0.28) * 0.42;

  // click: warm bloom that rises with the mist
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(ck.xy);
        cp.y += dt * 0.12; // rises
        float bloom = exp(-length(uv - cp) * 3.6) * exp(-dt * 0.85);
        col += bloom * vec3(0.85, 0.55, 0.50) * 0.40;
      }
    }
  }

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.009;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 17. TIDE ---------- horizontal banded waves, deep ocean
const TIDE = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  // wave system: multiple sinusoidal bands stacked, then warped by fbm
  float waveY = uv.y * 4.0 + 0.20 * sin(uv.x * 1.7 + u_time * 0.20)
                          + 0.13 * sin(uv.x * 0.8 - u_time * 0.13);

  // each wave row gets its own deep gradient
  float band = fract(waveY * 0.5);
  float row  = floor(waveY * 0.5);

  // cursor displaces the nearest wave subtly
  float displ = exp(-pow((uv.x - m.x) * 2.8, 2.0)) * 0.10 * smoothstep(0.5, 0.0, abs(uv.y - m.y));
  band = fract(band + displ);

  // base water palette
  vec3 deep    = vec3(0.005, 0.025, 0.055);
  vec3 mid     = vec3(0.020, 0.090, 0.140);
  vec3 surface = vec3(0.080, 0.220, 0.270);
  vec3 highlit = vec3(0.380, 0.520, 0.560);

  float wave = pow(1.0 - abs(band - 0.5) * 2.0, 1.6);
  vec3 col = mix(deep, mid, wave);
  col = mix(col, surface, smoothstep(0.70, 0.95, wave));
  // hairline foam at crest
  col += smoothstep(0.96, 0.99, wave) * highlit * 0.85;

  // fbm fine ripple
  float ripple = fbm(uv * vec2(8.0, 14.0) + u_time * 0.25);
  col += (ripple - 0.5) * vec3(0.04, 0.07, 0.09);

  // row-to-row depth gradient (lower rows darker)
  col *= 0.65 + 0.45 * smoothstep(-2.0, 2.0, uv.y * 4.0);

  // cursor halo, oceanic teal
  col += exp(-length(uv - m) * 4.5) * vec3(0.18, 0.30, 0.36) * 0.55;

  // click: drop a stone — concentric ripples confined to wave plane
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(ck.xy);
        float r = length(uv - cp);
        float ripples = sin(r * 38.0 - dt * 7.0) * exp(-r * 4.0) * exp(-dt * 1.1);
        col += ripples * vec3(0.30, 0.50, 0.60) * 0.40;
      }
    }
  }

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.008;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 18. PARCHMENT ---------- warm earth-tone flow, low contrast
const PARCHMENT = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  vec2 toM = m - uv;
  vec2 warp = toM * exp(-length(toM) * 1.8) * 0.22;

  vec2 p = uv + warp;
  // coarse paper-like noise on top of slow flow
  float flow = fbm(p * 1.5 + u_time * 0.025);
  float grain = fbm(uv * 12.0);
  float fiber = fbm(uv * vec2(35.0, 4.0)); // long horizontal fibers

  float t = smoothstep(0.30, 0.75, flow * 0.85 + grain * 0.15);

  // warm earth tones, low chroma
  vec3 ink    = vec3(0.040, 0.030, 0.025);
  vec3 sepia  = vec3(0.110, 0.085, 0.065);
  vec3 paper  = vec3(0.300, 0.240, 0.200);
  vec3 cream  = vec3(0.620, 0.520, 0.420);
  vec3 amber  = vec3(0.880, 0.700, 0.450);

  vec3 col = mix(ink, sepia, t);
  col = mix(col, paper, smoothstep(0.45, 0.70, t));
  col = mix(col, cream, smoothstep(0.72, 0.86, t));
  col = mix(col, amber, smoothstep(0.90, 0.98, t) * 0.65);

  // fiber striations
  col *= 0.92 + 0.16 * fiber;

  // cursor warmth (candle on parchment)
  float warm = exp(-length(uv - m) * 3.0);
  col += warm * vec3(0.55, 0.35, 0.18) * 0.35;

  // click: ink drop that spreads
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 4.0) {
        vec2 cp = toAR(ck.xy);
        float radius = 0.04 + dt * 0.10;
        float ink_mask = smoothstep(radius, radius * 0.6, length(uv - cp))
                        * (1.0 - smoothstep(2.5, 4.0, dt));
        // irregular edge
        ink_mask *= 0.80 + 0.40 * fbm(uv * 14.0 + ck.xy);
        col = mix(col, ink * vec3(0.7, 0.55, 0.45), ink_mask * 0.85);
      }
    }
  }

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.010;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 19. GRAPHITE ---------- near-monochrome charcoal flow with sketch lines
const GRAPHITE = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  vec2 toM = m - uv;
  vec2 warp = toM * exp(-length(toM) * 1.5) * 0.30;

  vec2 p = uv + warp;
  float n1 = fbm(p * 1.4 + u_time * 0.030);
  float n2 = fbm(p * 2.6 - u_time * 0.024 + n1 * 0.6);
  float t = mix(n1, n2, 0.55);

  // pure neutrals → cool platinum highlight
  vec3 c1 = vec3(0.018, 0.022, 0.028);
  vec3 c2 = vec3(0.060, 0.068, 0.080);
  vec3 c3 = vec3(0.180, 0.195, 0.220);
  vec3 c4 = vec3(0.500, 0.530, 0.580);
  vec3 c5 = vec3(0.820, 0.860, 0.920);

  vec3 col = mix(c1, c2, smoothstep(0.25, 0.55, t));
  col = mix(col, c3, smoothstep(0.55, 0.75, t));
  col = mix(col, c4, smoothstep(0.78, 0.90, t));
  col = mix(col, c5, smoothstep(0.93, 0.99, t) * 0.5);

  // diagonal hatching that follows the flow (gradient direction)
  float h1 = fbm(p * 1.4 + vec2(0.01, 0.0) + u_time * 0.030);
  float h2 = fbm(p * 1.4 + vec2(0.0, 0.01) + u_time * 0.030);
  vec2 grad = vec2(h1 - n1, h2 - n1) / 0.01;
  float ang = atan(grad.y, grad.x);
  // hatch lines perpendicular to flow gradient
  float hatchPos = uv.x * cos(ang + 1.5707) + uv.y * sin(ang + 1.5707);
  float hatch = 0.5 + 0.5 * sin(hatchPos * 220.0);
  hatch = pow(hatch, 4.0);
  // only show hatches in mid-tones, not in deepest shadow or brightest highlight
  float hatchMask = smoothstep(0.30, 0.50, t) * (1.0 - smoothstep(0.80, 0.95, t));
  col += hatch * hatchMask * vec3(0.10, 0.11, 0.13);

  // paper grain
  col *= 0.94 + 0.10 * fbm(uv * 28.0);

  // cursor: cool platinum gleam
  float gleam = exp(-length(uv - m) * 6.0);
  col += gleam * vec3(0.35, 0.40, 0.50) * 0.45;

  // click: a small smudge that brightens then settles
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(ck.xy);
        // elongate the smudge slightly along the flow direction
        vec2 d = uv - cp;
        d *= mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
        d.x *= 0.6;
        float smudge = exp(-length(d) * 5.5) * exp(-dt * 1.1);
        col += smudge * vec3(0.55, 0.60, 0.70) * 0.55;
      }
    }
  }

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 20. VELLUM ---------- pale cream cousin of Parchment with fine crackle
const VELLUM = `
// hexagonal-ish craquelure pattern (cells with bright thin lines between)
float crackle(vec2 p, float scale) {
  p *= scale;
  vec2 i = floor(p);
  vec2 f = fract(p);
  float minD = 1.0, minD2 = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 nb = vec2(float(x), float(y));
      vec2 h = hash22(i + nb);
      vec2 site = nb + 0.5 + 0.42 * (h - 0.5) * 2.0;
      float d = length(site - f);
      if (d < minD) { minD2 = minD; minD = d; }
      else if (d < minD2) { minD2 = d; }
    }
  }
  return minD2 - minD;
}
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  vec2 toM = m - uv;
  vec2 warp = toM * exp(-length(toM) * 2.0) * 0.16;
  vec2 p = uv + warp;

  float flow = fbm(p * 1.4 + u_time * 0.020);
  float fiber = fbm(uv * vec2(40.0, 5.0));

  float t = smoothstep(0.30, 0.78, flow);
  // very light cream palette
  vec3 c1 = vec3(0.060, 0.045, 0.035);
  vec3 c2 = vec3(0.180, 0.140, 0.110);
  vec3 c3 = vec3(0.460, 0.380, 0.300);
  vec3 c4 = vec3(0.820, 0.720, 0.580);
  vec3 c5 = vec3(0.960, 0.880, 0.770);

  vec3 col = mix(c1, c2, t);
  col = mix(col, c3, smoothstep(0.40, 0.65, t));
  col = mix(col, c4, smoothstep(0.65, 0.85, t));
  col = mix(col, c5, smoothstep(0.88, 0.97, t) * 0.85);

  // gentle long fibers
  col *= 0.94 + 0.12 * fiber;

  // craquelure: very subtle bright thin lines (paint cracks)
  float crk = crackle(uv, 14.0);
  float crkLine = smoothstep(0.05, 0.0, crk);
  col += crkLine * vec3(0.18, 0.15, 0.10) * 0.65;
  // secondary finer crackle
  float crk2 = crackle(uv + vec2(3.7, 1.3), 28.0);
  col += smoothstep(0.03, 0.0, crk2) * vec3(0.10, 0.08, 0.05) * 0.4;

  // very soft glow under cursor — like backlit vellum
  float warm = exp(-length(uv - m) * 3.5);
  col += warm * vec3(0.35, 0.28, 0.18) * 0.32;

  // click: fade a small foxing spot
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 5.0) {
        vec2 cp = toAR(ck.xy);
        float radius = 0.06;
        float irregular = 0.6 + 0.6 * fbm(uv * 9.0 + ck.xy);
        float mask = smoothstep(radius * irregular, radius * 0.4 * irregular, length(uv - cp));
        col = mix(col, vec3(0.30, 0.18, 0.10), mask * 0.45);
      }
    }
  }

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.008;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 21. FOXING ---------- aged parchment with persistent rust spots
const FOXING = `
// large-scale spots: pick random centers per fragment and accumulate
float spots(vec2 uv, float t) {
  float total = 0.0;
  float cellSize = 0.18;
  vec2 gi = floor(uv / cellSize);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 nb = vec2(float(x), float(y));
      vec2 cell = gi + nb;
      vec2 h = hash22(cell);
      // only some cells have a spot
      if (hash21(cell + 1.7) < 0.45) continue;
      vec2 center = (cell + h) * cellSize;
      float r = (0.020 + 0.040 * hash21(cell + 5.3));
      // irregular boundary via noise modulation
      float irr = 0.7 + 0.7 * fbm((uv - center) * 12.0);
      float d = length(uv - center) / (r * irr);
      total += exp(-d * d * 3.0);
    }
  }
  return total;
}
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  vec2 toM = m - uv;
  vec2 warp = toM * exp(-length(toM) * 1.8) * 0.18;
  vec2 p = uv + warp;

  float flow = fbm(p * 1.5 + u_time * 0.022);
  float fiber = fbm(uv * vec2(28.0, 4.0));
  float t = smoothstep(0.28, 0.80, flow);

  // darker parchment base
  vec3 c1 = vec3(0.035, 0.025, 0.020);
  vec3 c2 = vec3(0.130, 0.090, 0.065);
  vec3 c3 = vec3(0.340, 0.250, 0.180);
  vec3 c4 = vec3(0.680, 0.520, 0.360);
  vec3 c5 = vec3(0.880, 0.730, 0.510);
  vec3 col = mix(c1, c2, t);
  col = mix(col, c3, smoothstep(0.45, 0.70, t));
  col = mix(col, c4, smoothstep(0.72, 0.88, t));
  col = mix(col, c5, smoothstep(0.92, 0.99, t) * 0.55);

  col *= 0.92 + 0.18 * fiber;

  // rust spots layer
  float s = spots(uv, u_time);
  // click adds more spots near cursor
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 5.0) {
        vec2 cp = toAR(ck.xy);
        // accumulate localized spots within an expanding radius
        for (int k = 0; k < 5; k++) {
          float fk = float(k);
          vec2 off = vec2(cos(fk * 1.31 + ck.x), sin(fk * 1.7 + ck.y)) * (0.04 + dt * 0.04);
          float r = 0.022;
          float irr = 0.7 + 0.7 * fbm((uv - cp - off) * 12.0);
          float d = length(uv - cp - off) / (r * irr);
          float age = clamp(dt / 1.5, 0.0, 1.0);
          s += exp(-d * d * 3.0) * age;
        }
      }
    }
  }

  // rust color: warm orange-brown
  vec3 rust = vec3(0.48, 0.22, 0.08);
  float spotMask = clamp(s, 0.0, 1.5);
  col = mix(col, rust * 0.6, smoothstep(0.0, 0.5, spotMask) * 0.55);
  // dark center of each spot
  col = mix(col, rust * 0.25, smoothstep(0.4, 1.0, spotMask) * 0.5);

  // soft cursor warmth
  col += exp(-length(uv - m) * 4.0) * vec3(0.32, 0.18, 0.08) * 0.30;

  // vignette
  col *= 1.0 - 0.20 * length(uv);

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.010;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 22. GILDED ---------- gold leaf with metallic streaks along flow
const GILDED = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  vec2 toM = m - uv;
  vec2 warp = toM * exp(-length(toM) * 1.5) * 0.28;
  vec2 p = uv + warp;

  // flow value + gradient (for streak direction)
  float n  = fbm(p * 1.5 + u_time * 0.035);
  float nx = fbm(p * 1.5 + vec2(0.01, 0.0) + u_time * 0.035);
  float ny = fbm(p * 1.5 + vec2(0.0, 0.01) + u_time * 0.035);
  vec2 grad = vec2(nx - n, ny - n) / 0.01;
  float ang = atan(grad.y, grad.x);

  // base palette: deep brown → bright gold → near-white highlight
  vec3 c1 = vec3(0.040, 0.025, 0.010);
  vec3 c2 = vec3(0.180, 0.110, 0.040);
  vec3 c3 = vec3(0.520, 0.380, 0.140);
  vec3 c4 = vec3(0.920, 0.780, 0.380);
  vec3 c5 = vec3(1.000, 0.960, 0.780);

  float t = smoothstep(0.20, 0.85, n);
  vec3 col = mix(c1, c2, t);
  col = mix(col, c3, smoothstep(0.35, 0.65, t));
  col = mix(col, c4, smoothstep(0.65, 0.85, t));
  col = mix(col, c5, smoothstep(0.92, 0.99, t));

  // metallic streaks: bright lines perpendicular to flow gradient
  float streakPos = uv.x * cos(ang + 1.5707) + uv.y * sin(ang + 1.5707);
  float streak = sin(streakPos * 90.0 + u_time * 0.6);
  streak = pow(0.5 + 0.5 * streak, 8.0);
  // only on bright regions
  streak *= smoothstep(0.50, 0.85, t);
  col += streak * vec3(0.95, 0.80, 0.45) * 0.65;

  // hairline cracks in the gold leaf (high contrast bright lines)
  float crk = abs(fract(fbm(uv * 6.0) * 11.0) - 0.5);
  float crackMask = smoothstep(0.02, 0.0, crk) * smoothstep(0.45, 0.75, t);
  col += crackMask * vec3(1.0, 0.95, 0.75) * 0.35;
  // dark fissure underneath
  col -= crackMask * vec3(0.20, 0.12, 0.05) * 0.4;

  // grain (very subtle)
  col *= 0.96 + 0.08 * fbm(uv * 30.0);

  // hot reflection at cursor
  float spec = exp(-length(uv - m) * 8.0);
  col += spec * vec3(1.0, 0.92, 0.65) * 1.2;
  col += exp(-length(uv - m) * 3.5) * vec3(0.45, 0.30, 0.10) * 0.35;

  // click: bright gold splash with sparks
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(ck.xy);
        float splash = exp(-length(uv - cp) * 5.0) * exp(-dt * 1.4);
        col += splash * vec3(1.0, 0.85, 0.45) * 2.0;
        // sparks: small bright dots scattered around
        for (int k = 0; k < 6; k++) {
          float fk = float(k);
          vec2 off = vec2(cos(fk * 1.31 + ck.x * 0.1), sin(fk * 1.7 + ck.y * 0.1));
          off *= 0.04 + dt * 0.18;
          float spark = exp(-length(uv - cp - off) * 60.0) * exp(-dt * 2.5);
          col += spark * vec3(1.0, 0.95, 0.70) * 1.5;
        }
      }
    }
  }

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.010;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------- 23. HONEY ---------- viscous liquid gold, clicks drip downward
const HONEY = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  // viscous slow horizontal flow
  vec2 toM = m - uv;
  vec2 warp = toM * exp(-length(toM) * 1.4) * 0.22;
  vec2 p = uv + warp;
  // stretch noise horizontally for that thick liquid look
  vec2 nspace = p * vec2(1.0, 1.6);

  float n1 = fbm(nspace + u_time * 0.025);
  float n2 = fbm(nspace * 2.0 - u_time * 0.020 + n1);
  float t = smoothstep(0.25, 0.85, mix(n1, n2, 0.5));

  // honey palette: deep amber → mid honey → bright pale gold
  vec3 c1 = vec3(0.050, 0.025, 0.005);
  vec3 c2 = vec3(0.180, 0.085, 0.020);
  vec3 c3 = vec3(0.520, 0.290, 0.080);
  vec3 c4 = vec3(0.880, 0.640, 0.220);
  vec3 c5 = vec3(1.000, 0.880, 0.540);

  vec3 col = mix(c1, c2, t);
  col = mix(col, c3, smoothstep(0.35, 0.60, t));
  col = mix(col, c4, smoothstep(0.62, 0.85, t));
  col = mix(col, c5, smoothstep(0.90, 0.98, t) * 0.85);

  // viscous bubbles: occasional small bright spots
  vec2 bg = uv * vec2(8.0, 12.0) + vec2(u_time * 0.05, 0.0);
  vec2 bgi = floor(bg);
  vec2 bgf = fract(bg);
  vec2 bh = hash22(bgi);
  float bubble = exp(-length(bgf - bh) * 30.0) * step(0.78, hash21(bgi + 0.5));
  col += bubble * vec3(1.0, 0.85, 0.55) * 0.45;

  // long horizontal sheen line that drifts vertically
  float sheenY = 0.10 * sin(u_time * 0.20);
  float sheen = exp(-pow((uv.y - sheenY) * 8.0, 2.0));
  col += sheen * vec3(0.30, 0.20, 0.06) * 0.45;

  // cursor warmth (heat melts the honey locally)
  float heat = exp(-length(uv - m) * 3.5);
  col += heat * vec3(0.40, 0.22, 0.04) * 0.50;
  col += exp(-length(uv - m) * 14.0) * vec3(1.0, 0.85, 0.45) * 0.6;

  // click: honey droplet that drips downward
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 4.0) {
        vec2 cp = toAR(ck.xy);
        // the drop center sinks over time (gravity)
        float dropY = dt * 0.10;
        vec2 dpos = vec2(cp.x, cp.y - dropY);
        // elongated drop: x narrow, y stretched
        vec2 d = uv - dpos;
        d.y *= 0.55;
        float drop = exp(-dot(d, d) * 38.0);
        // narrow trail above the drop, back to the click point
        float trailY = clamp((uv.y - dpos.y) / max(dropY, 0.001), 0.0, 1.0);
        if (uv.y > dpos.y && uv.y < cp.y) {
          float tx = abs(uv.x - cp.x);
          float trail = exp(-tx * tx * 800.0) * (1.0 - trailY);
          drop += trail * 0.7;
        }
        drop *= exp(-dt * 0.5);
        col = mix(col, vec3(1.0, 0.86, 0.52), drop * 0.85);
      }
    }
  }

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.010;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 24. MATRIX — falling green code rain. Click pulses bright wave.
// ═══════════════════════════════════════════════════════════════════════════
const MATRIX = `
float digit(vec2 p, float seed) {
  // procedural digit: just a hashed mask in cell
  p = fract(p);
  float h = hash21(floor(p * 5.0) + seed);
  return step(0.55, h);
}
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);
  // grid: columns falling
  vec2 g = uv * vec2(50.0, 30.0);
  vec2 gi = floor(g);
  vec2 gf = fract(g);
  // column-local time + offset
  float colSeed = hash21(vec2(gi.x, 11.0));
  float speed = 0.6 + colSeed * 1.6;
  float yOff = u_time * speed * 1.4 + colSeed * 8.0;
  float row = gi.y + yOff;
  // cursor disturbance — bend columns away from cursor
  float curseDist = length(uv - m);
  float bend = exp(-curseDist * 3.0) * 0.6;
  row += bend * sin(u_time * 2.0 + gi.x);

  float lit = hash21(vec2(gi.x, floor(row)));
  float head = smoothstep(0.93, 1.0, lit);          // rare bright head
  float body = step(0.4, lit) * (0.30 + 0.50 * fract(lit * 13.0));
  float bright = max(head * 1.3, body);

  // digit mask
  float d = digit(gf * 2.0, floor(row) + gi.x);
  float v = d * bright;

  // fade from top
  v *= smoothstep(-0.55, 0.20, -uv.y);

  vec3 baseCol = vec3(0.02, 0.30, 0.12);
  vec3 hotCol  = vec3(0.55, 1.0, 0.65);
  vec3 col = mix(vec3(0.0), baseCol, smoothstep(0.2, 0.8, v));
  col = mix(col, hotCol, head);
  // cursor halo
  col += exp(-curseDist * 4.5) * vec3(0.10, 0.45, 0.20) * 0.6;
  // click pulses
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 2.5) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.65;
        float ring = exp(-pow((length(uv - cp) - rr) * 8.0, 2.0)) * exp(-dt * 0.6);
        col += ring * vec3(0.6, 1.0, 0.7) * 1.5;
      }
    }
  }
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 25. CRT — vintage CRT screen with scanlines, barrel curvature, RGB shift.
// ═══════════════════════════════════════════════════════════════════════════
const CRT = `
vec3 sampleScene(vec2 p) {
  // a slow color field that fills the screen
  float f1 = fbm(p * 1.8 + u_time * 0.10);
  float f2 = fbm(p * 2.6 - u_time * 0.08);
  vec3 a = vec3(0.08, 0.04, 0.20);
  vec3 b = vec3(0.85, 0.30, 0.70);
  vec3 c = vec3(0.10, 0.85, 0.95);
  vec3 col = mix(a, b, smoothstep(0.35, 0.70, f1));
  col = mix(col, c, smoothstep(0.55, 0.85, f2) * 0.6);
  return col;
}
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  // barrel distortion
  vec2 cc = uv;
  float d2 = dot(cc, cc);
  vec2 bent = cc * (1.0 + d2 * 0.18);

  // cursor wobble
  bent += (m - bent) * 0.03 * exp(-length(bent - m) * 2.0);

  // RGB shift
  float shift = 0.008;
  vec3 col;
  col.r = sampleScene(bent + vec2( shift, 0.0)).r;
  col.g = sampleScene(bent).g;
  col.b = sampleScene(bent + vec2(-shift, 0.0)).b;

  // scanlines
  float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 2.4);
  col *= mix(0.75, 1.0, scan);

  // phosphor grid
  float gridx = 0.5 + 0.5 * sin(gl_FragCoord.x * 9.0);
  col *= mix(0.92, 1.0, gridx);

  // vignette
  col *= 1.0 - smoothstep(0.6, 1.4, length(uv) * 1.05);

  // noise
  col += (hash21(gl_FragCoord.xy + u_time * 40.0) - 0.5) * 0.045;

  // click flashes white briefly
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 0.6) {
        float flash = exp(-dt * 8.0);
        col += flash * 0.6;
      }
    }
  }
  // boot scan line
  float roll = fract(u_time * 0.07);
  col += smoothstep(0.02, 0.0, abs(fract(uv.y * 0.4 - roll) - 0.5)) * 0.05;

  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 26. VORTEX — hypnotic concentric spiral. Cursor offsets center, click bursts.
// ═══════════════════════════════════════════════════════════════════════════
const VORTEX = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  // shift origin slowly toward cursor
  vec2 center = m * 0.40;
  vec2 p = uv - center;

  float r = length(p);
  float a = atan(p.y, p.x);

  // spiral: bands depend on (a + k*log(r)) — log-polar
  float k = 7.0;
  float bands = sin(a * 4.0 + k * log(r + 0.05) - u_time * 1.4);

  // smooth bands and add gentle noise
  float n = fbm(vec2(a * 1.2, r * 4.0) + u_time * 0.15);
  float t = 0.5 + 0.5 * bands * (0.7 + 0.3 * n);

  vec3 c1 = vec3(0.02, 0.01, 0.10);
  vec3 c2 = vec3(0.80, 0.15, 0.55);
  vec3 c3 = vec3(0.20, 0.85, 1.00);
  vec3 c4 = vec3(0.95, 0.95, 0.55);

  vec3 col = mix(c1, c2, smoothstep(0.20, 0.55, t));
  col = mix(col, c3, smoothstep(0.55, 0.80, t));
  col = mix(col, c4, smoothstep(0.80, 0.95, t) * 0.7);

  // radial darkening
  col *= 1.0 - smoothstep(0.0, 1.2, r) * 0.35;

  // center glow
  col += exp(-r * 8.0) * vec3(1.0, 0.9, 0.7) * 0.6;

  // clicks: radial pulses outward
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(ck.xy) - center;
        float rr = dt * 0.65;
        float ring = exp(-pow((length(p - cp) - rr) * 8.0, 2.0)) * exp(-dt * 0.8);
        col += ring * vec3(1.0, 0.85, 0.95) * 1.6;
      }
    }
  }
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.010;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 27. CIRCUIT — animated PCB traces with light pulses traveling along them.
// ═══════════════════════════════════════════════════════════════════════════
const CIRCUIT = `
float trace(vec2 p, float seed) {
  // grid-based axis-aligned traces, with branches at hashed points
  vec2 g = p * 8.0;
  vec2 gi = floor(g);
  vec2 gf = fract(g);
  float h = hash21(gi + seed);
  float w = 0.06;
  // mostly horizontal or vertical depending on hash
  if (h < 0.5) {
    return smoothstep(w, w * 0.4, abs(gf.y - 0.5));
  } else {
    return smoothstep(w, w * 0.4, abs(gf.x - 0.5));
  }
}
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  float t1 = trace(uv, 0.0);
  float t2 = trace(uv * 1.3 + vec2(0.7, 0.2), 1.0) * 0.7;
  float lines = max(t1, t2);

  // pads at intersection points (hash dots)
  vec2 g = uv * 8.0;
  vec2 gi = floor(g);
  vec2 gf = fract(g);
  float hp = hash21(gi);
  float pad = step(0.85, hp) * smoothstep(0.18, 0.10, length(gf - 0.5));

  // pulses moving along
  float pulse = 0.5 + 0.5 * sin(u_time * 1.6 + uv.x * 6.0 + uv.y * 3.0);
  pulse = pow(pulse, 6.0);

  vec3 base = vec3(0.02, 0.05, 0.04);
  vec3 traceCol = vec3(0.10, 0.55, 0.40);
  vec3 hotCol = vec3(0.65, 1.0, 0.85);

  vec3 col = base;
  col += lines * mix(traceCol, hotCol, pulse) * 0.85;
  col += pad * vec3(0.95, 1.0, 0.85);

  // cursor light: brightens nearby traces
  float cd = length(uv - m);
  col += exp(-cd * 5.0) * vec3(0.50, 1.0, 0.85) * 0.5 * lines;

  // click sends a wave from click point
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.5;
        float ring = exp(-pow((length(uv - cp) - rr) * 9.0, 2.0)) * exp(-dt * 1.0);
        col += ring * hotCol * 1.3 * lines;
      }
    }
  }
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 28. OCEAN — moving waves with caustics, sun glare overhead.
// ═══════════════════════════════════════════════════════════════════════════
const OCEAN = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  // perspective: stretch y so distant waves are smaller
  vec2 p = vec2(uv.x, uv.y * 1.6);
  float depthMix = smoothstep(-0.5, 0.5, uv.y);

  // multi-octave waves
  float wave = 0.0;
  float amp = 0.55;
  vec2 q = p * 2.0;
  for (int i = 0; i < 4; i++) {
    wave += amp * sin(q.x * 1.3 + q.y * 0.7 + u_time * (0.5 + float(i)*0.3));
    wave += amp * 0.7 * fbm(q + u_time * 0.18);
    q *= 1.8;
    amp *= 0.55;
  }
  float h = wave * 0.5;

  // caustic shimmer
  float caustic = pow(0.5 + 0.5 * sin(p.x * 6.0 + h * 4.0 + u_time * 2.0), 8.0);

  vec3 deepCol = vec3(0.02, 0.05, 0.18);
  vec3 midCol  = vec3(0.05, 0.30, 0.55);
  vec3 crestCol= vec3(0.65, 0.85, 0.95);
  vec3 sunCol  = vec3(1.0, 0.88, 0.55);

  vec3 col = mix(deepCol, midCol, smoothstep(-0.6, 0.4, h));
  col = mix(col, crestCol, smoothstep(0.30, 0.55, h));
  col += caustic * vec3(0.4, 0.7, 0.85) * 0.5 * (1.0 - depthMix);

  // sun glare from above (uv.y near top)
  float sun = exp(-length(uv - vec2(m.x * 0.5, 0.55)) * 4.0);
  col += sun * sunCol * 0.85;

  // cursor leaves a wake
  float ck = length(uv - m);
  col += exp(-ck * 6.0) * vec3(0.55, 0.85, 1.0) * 0.45;

  // click drops a ripple
  for (int i = 0; i < 8; i++) {
    vec4 cl = u_clicks[i];
    if (cl.w > 0.5) {
      float dt = u_time - cl.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(cl.xy);
        float rr = dt * 0.45;
        float ring = exp(-pow((length(uv - cp) - rr) * 10.0, 2.0)) * exp(-dt * 0.85);
        col += ring * vec3(0.85, 1.0, 1.0) * 1.0;
      }
    }
  }
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 29. CURL FIELD — particles streaming along a curl-noise vector field.
// ═══════════════════════════════════════════════════════════════════════════
const CURL_FIELD = `
vec2 curl(vec2 p) {
  float e = 0.05;
  float n1 = fbm(vec2(p.x, p.y + e));
  float n2 = fbm(vec2(p.x, p.y - e));
  float n3 = fbm(vec2(p.x + e, p.y));
  float n4 = fbm(vec2(p.x - e, p.y));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m = toAR(u_mouseSmooth);

  // sample vector field at this point
  vec2 v = curl(uv * 2.0 + u_time * 0.10);
  float speed = length(v);

  // streamline density: integrate noise back along the field direction
  vec2 dir = normalize(v + 1e-4);
  float streak = 0.0;
  vec2 p = uv;
  for (int i = 0; i < 14; i++) {
    p -= dir * 0.018;
    streak += fbm(p * 5.0 + u_time * 0.20) * 0.10;
  }

  vec3 c1 = vec3(0.02, 0.01, 0.06);
  vec3 c2 = vec3(0.10, 0.50, 0.95);
  vec3 c3 = vec3(0.95, 0.30, 0.65);
  vec3 c4 = vec3(1.0, 0.95, 0.80);

  vec3 col = c1;
  col = mix(col, c2, smoothstep(0.30, 0.55, streak));
  col = mix(col, c3, smoothstep(0.55, 0.75, streak) * 0.8);
  col = mix(col, c4, smoothstep(0.75, 0.90, streak) * 0.4);

  // cursor: pulls streams toward itself
  float md = length(uv - m);
  col += exp(-md * 5.5) * vec3(1.0, 0.95, 0.80) * 0.45;

  // clicks: burst of new particles
  for (int i = 0; i < 8; i++) {
    vec4 cl = u_clicks[i];
    if (cl.w > 0.5) {
      float dt = u_time - cl.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(cl.xy);
        float rr = dt * 0.50;
        float ring = exp(-pow((length(uv - cp) - rr) * 8.0, 2.0)) * exp(-dt * 0.85);
        col += ring * c4 * 1.2;
      }
    }
  }
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.010;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 30. LIGHTNING ⚡  Procedural bolt with branches, periodic strikes toward cursor.
// ═══════════════════════════════════════════════════════════════════════════
const LIGHTNING = `
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
// Distance from point to a procedurally-generated bolt anchored at (top -> target).
// Bolt has 'segs' segments with horizontal jitter from hash21(i + seed).
float boltDist(vec2 p, vec2 target, float seed) {
  float d = 1e6;
  vec2 prev = vec2(target.x * 0.4, 1.05);
  const int SEGS = 10;
  for (int i = 1; i <= SEGS; i++) {
    float tt = float(i) / float(SEGS);
    vec2 cur = mix(vec2(target.x * 0.4, 1.05), target, tt);
    float jit = (hash21(vec2(float(i), seed)) - 0.5) * 0.55 * (1.0 - tt * 0.6);
    cur.x += jit;
    d = min(d, sdSeg(p, prev, cur));
    // small branch from this node ~25% probability
    if (hash21(vec2(float(i) + 17.0, seed)) > 0.62) {
      vec2 branchEnd = cur + vec2(
        (hash21(vec2(float(i) + 31.0, seed)) - 0.5) * 0.35,
        -hash21(vec2(float(i) + 47.0, seed)) * 0.25
      );
      d = min(d, sdSeg(p, cur, branchEnd) * 1.5); // branches thinner
    }
    prev = cur;
  }
  return d;
}
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  // Strike timing: a new bolt every ~1.6 seconds, life ~0.35s
  float t = u_time * 0.6;
  float ti = floor(t);
  float life = fract(t);
  float seed = ti * 13.7;
  // Aim at cursor, but with random offset that varies per strike
  vec2 target = m + vec2(
    (hash21(vec2(seed, 11.0)) - 0.5) * 0.4,
    (hash21(vec2(seed, 22.0)) - 0.5) * 0.4
  );
  // Bolt visible only briefly
  float boltAmp = exp(-life * 8.0);
  float d = boltDist(uv, target, seed);

  // Core (bright white) + glow (electric blue)
  float core = exp(-d * 220.0) * boltAmp;
  float glow = exp(-d * 24.0) * boltAmp * 0.8;
  float wide = exp(-d * 6.0)  * boltAmp * 0.25;

  vec3 baseCol = vec3(0.01, 0.012, 0.04);
  // Sky tint that flashes during strike
  vec3 flash = mix(baseCol, vec3(0.04, 0.06, 0.18), boltAmp * 0.8);
  vec3 col = flash;

  col += wide * vec3(0.20, 0.40, 1.0);
  col += glow * vec3(0.55, 0.80, 1.0);
  col += core * vec3(1.0, 1.0, 1.0);

  // Persistent secondary bolt linked to cursor (always-on subtle)
  float d2 = boltDist(uv, m, ti * 7.1 + 5.0);
  col += exp(-d2 * 60.0) * 0.30 * vec3(0.45, 0.70, 1.0);

  // Click triggers extra bolt straight to click point
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 0.6) {
        vec2 cp = toAR(ck.xy);
        float bd = boltDist(uv, cp, ck.z * 3.0);
        float la = exp(-dt * 5.0);
        col += exp(-bd * 200.0) * la * vec3(1.0);
        col += exp(-bd * 20.0)  * la * vec3(0.6, 0.85, 1.0);
      }
    }
  }
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.010;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 31. PLASMA GLOBE — radial electric arcs from a central orb, follow cursor.
// ═══════════════════════════════════════════════════════════════════════════
const PLASMA_GLOBE = `
// Same sdSeg helper inlined (each shader is independent — keep self-contained).
float pg_sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
// One zig-zag arc from the orb to a target point.
float pg_arc(vec2 p, vec2 target, float seed) {
  float d = 1e6;
  vec2 prev = vec2(0.0);
  const int N = 7;
  for (int i = 1; i <= N; i++) {
    float tt = float(i) / float(N);
    vec2 mid = mix(vec2(0.0), target, tt);
    vec2 perp = vec2(-(target.y), target.x); // perpendicular
    float jit = (hash21(vec2(float(i), seed + u_time)) - 0.5) * 0.18 * sin(tt * 3.14);
    mid += perp * jit;
    d = min(d, pg_sdSeg(p, prev, mid));
    prev = mid;
  }
  return d;
}
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  // The orb sits a bit toward the cursor
  vec2 orbPos = m * 0.3;
  vec2 p = uv - orbPos;
  float r = length(p);

  vec3 bg = vec3(0.04, 0.01, 0.08);
  vec3 col = bg;

  // Orb glow
  col += exp(-r * 3.5) * vec3(0.55, 0.20, 0.85) * 0.6;
  // Orb core
  col += exp(-r * 22.0) * vec3(1.0, 0.85, 1.0);

  // 6 radial arcs to "wall" points at unit circle
  for (int i = 0; i < 6; i++) {
    float a = float(i) / 6.0 * 6.283 + u_time * 0.35;
    // wander each tip slightly with time
    a += sin(u_time * 1.1 + float(i)) * 0.18;
    vec2 tip = vec2(cos(a), sin(a)) * (0.8 + 0.15 * sin(u_time * 2.0 + float(i) * 1.7));
    // each arc has its own seed and slight time wobble (flicker)
    float life = 0.5 + 0.5 * sin(u_time * 3.0 + float(i) * 2.1);
    float d = pg_arc(p, tip, float(i) * 11.0 + floor(u_time * 4.0));
    float arc = exp(-d * 90.0);
    col += arc * mix(vec3(0.35, 0.20, 0.95), vec3(0.95, 0.55, 1.0), life);
    col += exp(-d * 14.0) * 0.20 * vec3(0.4, 0.2, 1.0);
  }

  // Cursor draws an additional bright arc (the glass tube responding to touch)
  {
    vec2 cursorRel = m - orbPos;
    float d = pg_arc(p, cursorRel, 99.0);
    col += exp(-d * 180.0) * vec3(1.0, 0.95, 1.0);
    col += exp(-d * 30.0)  * vec3(0.7, 0.45, 1.0) * 0.5;
  }

  // Click adds a transient super-bright arc
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 0.8) {
        vec2 cp = toAR(ck.xy) - orbPos;
        float d = pg_arc(p, cp, ck.z * 17.0);
        float la = exp(-dt * 4.0);
        col += exp(-d * 200.0) * la * vec3(1.0);
        col += exp(-d * 22.0)  * la * vec3(0.85, 0.5, 1.0) * 0.6;
      }
    }
  }
  // Subtle vignette
  col *= 1.0 - smoothstep(0.8, 1.4, length(uv)) * 0.4;
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.010;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 32. CAUSTICS — pool of water lit from above, shifting bright lines.
// ═══════════════════════════════════════════════════════════════════════════
const CAUSTICS = `
// Two layers of Worley-style noise produce caustic-like bright lines where
// they overlap. Inspired by Inigo Quilez's caustic technique.
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  // Cursor warps the water surface
  vec2 toM = m - uv;
  vec2 p = uv + toM * exp(-length(toM) * 1.8) * 0.25;

  // Two warped noise fields evolving at different rates
  float t = u_time * 0.55;
  vec2 q1 = vec2(fbm(p * 3.0 + t),
                 fbm(p * 3.0 + vec2(5.2, 1.3) - t));
  vec2 q2 = vec2(fbm(p * 4.5 + 1.5 * q1 + t * 0.7),
                 fbm(p * 4.5 + 1.5 * q1 + vec2(8.3, 2.8) - t * 0.7));
  float n = fbm(p * 6.0 + 2.0 * q2);

  // Caustic peaks: contrast-stretched, gives bright filament-like highlights
  float caustic = 1.0 - smoothstep(0.42, 0.62, n);
  caustic = pow(caustic, 4.0);

  // Depth gradient — bottom is dark, top brighter
  float depth = smoothstep(-1.0, 1.0, uv.y);

  vec3 deepCol = vec3(0.01, 0.05, 0.12);
  vec3 midCol  = vec3(0.05, 0.30, 0.50);
  vec3 hot     = vec3(0.80, 0.95, 1.00);

  vec3 col = mix(deepCol, midCol, depth);
  col += caustic * hot * 1.10;

  // Subtle secondary caustic ring at smaller scale
  float n2 = fbm(p * 10.0 + 1.5 * q2 - t);
  float c2 = 1.0 - smoothstep(0.46, 0.55, n2);
  col += pow(c2, 3.0) * vec3(0.35, 0.55, 0.65) * 0.40;

  // Soft sun shaft from above
  float shaft = exp(-pow(uv.x - m.x * 0.4, 2.0) * 4.0) * smoothstep(-0.5, 0.8, uv.y);
  col += shaft * vec3(0.55, 0.75, 0.85) * 0.18;

  // Cursor disturbs caustics
  col += exp(-length(uv - m) * 5.0) * vec3(0.85, 0.95, 1.0) * 0.30;

  // Click drops a ripple that bends caustics outward
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.5) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.5;
        float ring = exp(-pow((length(uv - cp) - rr) * 10.0, 2.0)) * exp(-dt * 0.7);
        col += ring * vec3(0.85, 1.0, 1.0) * 1.2;
      }
    }
  }
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.010;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 33. TESLA — violent arcs radiating from a Tesla coil, follow cursor.
// ═══════════════════════════════════════════════════════════════════════════
const TESLA = `
float ts_sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
float ts_bolt(vec2 p, vec2 start, vec2 end, float seed) {
  float d = 1e6;
  vec2 prev = start;
  const int N = 8;
  for (int i = 1; i <= N; i++) {
    float tt = float(i) / float(N);
    vec2 base = mix(start, end, tt);
    vec2 dir = normalize(end - start + 1e-4);
    vec2 perp = vec2(-dir.y, dir.x);
    float amp = 0.20 * sin(tt * 3.14);
    float jit = (hash21(vec2(float(i), seed)) - 0.5) * amp;
    base += perp * jit;
    d = min(d, ts_sdSeg(p, prev, base));
    prev = base;
  }
  return d;
}
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  // Coil at the bottom center; arcs reach toward cursor and around
  vec2 coil = vec2(0.0, -0.55);
  vec2 p = uv;

  vec3 bg = vec3(0.03, 0.01, 0.04);
  vec3 col = bg;

  // Coil glow
  float cr = length(p - coil);
  col += exp(-cr * 4.0) * vec3(0.85, 0.65, 1.0) * 0.55;
  col += exp(-cr * 30.0) * vec3(1.0);

  // 5 arcs reaching out (one toward cursor, others random)
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float strikeT = u_time * 0.7 + fi * 1.31;
    float si = floor(strikeT);
    float life = fract(strikeT);
    float amp = exp(-life * 5.0);
    float seed = si * 11.0 + fi * 3.7;

    vec2 target;
    if (i == 0) {
      target = m;                                  // first arc always seeks cursor
    } else {
      float ang = hash21(vec2(seed, 1.0)) * 6.283;
      float rad = 0.5 + hash21(vec2(seed, 2.0)) * 0.6;
      target = coil + vec2(cos(ang), sin(ang)) * rad;
    }
    float d = ts_bolt(p, coil, target, seed);
    col += exp(-d * 240.0) * amp * vec3(1.0);
    col += exp(-d * 28.0)  * amp * vec3(0.85, 0.55, 1.0) * 0.7;
    col += exp(-d * 6.0)   * amp * vec3(0.40, 0.20, 0.85) * 0.25;
  }

  // Click sends a violent direct arc to click point
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 0.7) {
        vec2 cp = toAR(ck.xy);
        float d = ts_bolt(p, coil, cp, ck.z * 19.0);
        float la = exp(-dt * 4.0);
        col += exp(-d * 280.0) * la * vec3(1.0);
        col += exp(-d * 36.0)  * la * vec3(0.95, 0.80, 1.0) * 0.8;
      }
    }
  }
  // Vignette
  col *= 1.0 - smoothstep(0.8, 1.5, length(uv)) * 0.5;
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.010;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// 34. QUANTUM — particle field with interference patterns + entanglement lines.
// ═══════════════════════════════════════════════════════════════════════════
const QUANTUM = `
void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  // Two interfering wave sources (cursor and a mobile source)
  vec2 src1 = m;
  vec2 src2 = vec2(sin(u_time * 0.4) * 0.6, cos(u_time * 0.35) * 0.5);

  float d1 = length(uv - src1);
  float d2 = length(uv - src2);

  // Interference pattern
  float w1 = sin(d1 * 30.0 - u_time * 3.0);
  float w2 = sin(d2 * 30.0 - u_time * 2.4);
  float interf = (w1 + w2) * 0.5;
  float amp = 0.5 + 0.5 * interf;

  vec3 bg = vec3(0.02, 0.01, 0.10);
  vec3 c1 = vec3(0.10, 0.40, 1.00);
  vec3 c2 = vec3(1.00, 0.30, 0.85);
  vec3 hot = vec3(0.95, 0.95, 1.0);

  vec3 col = bg;
  col = mix(col, c1, smoothstep(0.20, 0.55, amp));
  col = mix(col, c2, smoothstep(0.65, 0.90, amp) * 0.7);

  // Particle grid (quantum field as quantized samples)
  vec2 g = uv * 28.0;
  vec2 gi = floor(g);
  vec2 gf = fract(g);
  vec2 center = vec2(0.5);
  float pd = length(gf - center);
  float prob = 0.5 + 0.5 * sin(hash21(gi) * 6.283 + u_time * (1.0 + hash21(gi + 7.0) * 2.0));
  prob = pow(prob, 6.0);
  // particle visible where field amplitude is high
  float particle = exp(-pd * 18.0) * prob * amp * 1.4;
  col += particle * hot;

  // Entanglement lines between sources
  vec2 ab = src2 - src1;
  vec2 ap = uv - src1;
  float along = clamp(dot(ap, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  float perp = abs(dot(ap - ab * along, vec2(-normalize(ab).y, normalize(ab).x)));
  float ent = exp(-perp * 80.0) * (0.7 + 0.3 * sin(along * 30.0 - u_time * 4.0));
  col += ent * vec3(0.85, 0.65, 1.0) * 0.45;

  // Source halos
  col += exp(-d1 * 6.0) * vec3(0.55, 0.85, 1.0) * 0.35;
  col += exp(-d2 * 6.0) * vec3(1.00, 0.45, 0.85) * 0.30;

  // Click: instantaneous wavefront collapse — bright ring + bg desat briefly
  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.6;
        float ring = exp(-pow((length(uv - cp) - rr) * 11.0, 2.0)) * exp(-dt * 0.8);
        col += ring * hot * 1.4;
      }
    }
  }
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

const WALLPAPERS = [
  { id: 'mercury',     name: 'Mercury',     meta: 'Liquid chrome — pools toward your cursor',          frag: MERCURY,
    swatch: 'radial-gradient(120% 120% at 30% 30%, #c8d4ff 0%, #5e6f9c 40%, #0a0d1a 100%)' },
  { id: 'aurora',      name: 'Aurora',      meta: 'Flowing field — bends around your cursor',          frag: AURORA,
    swatch: 'linear-gradient(135deg, #06121f 0%, #0a7c8c 35%, #a91dc6 70%, #f3df8a 100%)' },
  { id: 'lattice',     name: 'Lattice',     meta: 'Voronoi crystals — your cursor owns a cell',        frag: LATTICE,
    swatch: 'conic-gradient(from 210deg at 50% 50%, #f08d3d, #d83e75, #3473e8, #34c79f, #f08d3d)' },
  { id: 'plasma',      name: 'Plasma',      meta: 'Iridescent fluid — cursor is a heat source',        frag: PLASMA,
    swatch: 'radial-gradient(80% 80% at 60% 40%, #ffd07a 0%, #d54ea8 40%, #5b30b6 75%, #0a0420 100%)' },
  { id: 'prism',       name: 'Prism',       meta: 'Glass shard — refracts what you point at',          frag: PRISM,
    swatch: 'linear-gradient(120deg, #0c1730 0%, #5b1a8a 45%, #2d6fd6 100%)' },
  { id: 'nebula',      name: 'Nebula',      meta: 'Cosmic clouds — cursor stirs the dust',             frag: NEBULA,
    swatch: 'radial-gradient(120% 120% at 30% 30%, #ff5a8a 0%, #7a1ec0 38%, #1a1d6e 70%, #03030c 100%)' },
  { id: 'galaxy',      name: 'Galaxy',      meta: 'Spiral disk — cursor is the galactic core',         frag: GALAXY,
    swatch: 'radial-gradient(60% 60% at 50% 50%, #ffdca6 0%, #ee5fa8 30%, #4936c8 70%, #02030c 100%)' },
  { id: 'singularity', name: 'Singularity', meta: 'Black hole — lenses the stars; click adds mass',    frag: SINGULARITY,
    swatch: 'radial-gradient(60% 60% at 50% 50%, #000 0%, #000 16%, #ffb04a 22%, #c34a18 38%, #0a0612 80%)' },
  { id: 'wormhole',    name: 'Wormhole',    meta: 'Tunnel through space — click to jump',              frag: WORMHOLE,
    swatch: 'radial-gradient(80% 80% at 50% 50%, #ffd9a1 0%, #c84cf7 25%, #1fb4ff 55%, #060620 100%)' },
  { id: 'hyperspace',  name: 'Hyperspace',  meta: 'Star streaks — click to warp faster',               frag: HYPERSPACE,
    swatch: 'radial-gradient(80% 80% at 50% 50%, #ffffff 0%, #8ec5ff 25%, #2c3aa8 55%, #02041a 100%)' },
  { id: 'manifold',    name: 'Manifold',    meta: 'Equation glyphs drift across an aurora flow',       frag: MANIFOLD,
    swatch: 'linear-gradient(135deg, #060b1c 0%, #1d3a7a 35%, #8b2bb4 65%, #f0c977 100%)' },
  { id: 'lagrangian',  name: 'Lagrangian',  meta: 'Equations write themselves across a nebula',        frag: LAGRANGIAN,
    swatch: 'radial-gradient(100% 100% at 30% 40%, #f0e7c8 0%, #642aa6 35%, #163fa6 70%, #04061c 100%)' },
  { id: 'riemann',     name: 'Riemann',     meta: 'Complex function — cursor is a moving zero',        frag: RIEMANN,
    swatch: 'conic-gradient(from 0deg at 50% 50%, #ff7a59, #ffd166, #06d6a0, #118ab2, #b249e6, #ff7a59)' },
  { id: 'constellation', name: 'Constellation', meta: 'Connected nodes — drift toward your cursor',     frag: CONSTELLATION,
    swatch: 'radial-gradient(120% 120% at 50% 40%, #2a6fd6 0%, #143a82 35%, #060e26 75%, #02040d 100%)' },
  { id: 'silk',        name: 'Silk',        meta: 'Slow navy ribbons — restrained and quiet',         frag: SILK,
    swatch: 'linear-gradient(180deg, #050912 0%, #0e1530 35%, #2c364c 70%, #768294 100%)' },
  { id: 'vapor',       name: 'Vapor',       meta: 'Dawn mist rising with subtle light shafts',         frag: VAPOR,
    swatch: 'linear-gradient(180deg, #05080f 0%, #0e2329 35%, #3a3946 65%, #c8a99c 100%)' },
  { id: 'tide',        name: 'Tide',        meta: 'Deep ocean bands — click drops a stone',           frag: TIDE,
    swatch: 'linear-gradient(180deg, #02060e 0%, #051622 30%, #0e3540 60%, #4d7a86 100%)' },
  { id: 'parchment',   name: 'Parchment',   meta: 'Warm earth flow — click stains with ink',          frag: PARCHMENT,
    swatch: 'radial-gradient(120% 120% at 30% 40%, #e0b27a 0%, #80543a 30%, #2b1d12 65%, #0c0805 100%)' },
  { id: 'graphite',    name: 'Graphite',    meta: 'Charcoal flow with hatching that follows it',       frag: GRAPHITE,
    swatch: 'linear-gradient(135deg, #050608 0%, #1f2228 35%, #4d5460 70%, #c8cdd6 100%)' },
  { id: 'vellum',      name: 'Vellum',      meta: 'Pale cream with fine craquelure',                   frag: VELLUM,
    swatch: 'radial-gradient(120% 120% at 30% 40%, #f5e3c0 0%, #b09078 35%, #4a3a2c 70%, #060410 100%)' },
  { id: 'foxing',      name: 'Foxing',      meta: 'Aged parchment with rust spots — click stains',     frag: FOXING,
    swatch: 'radial-gradient(120% 120% at 40% 50%, #e0b27a 0%, #80543a 30%, #381c0e 65%, #0a0604 100%)' },
  { id: 'gilded',      name: 'Gilded',      meta: 'Gold leaf with metallic streaks along the flow',    frag: GILDED,
    swatch: 'linear-gradient(120deg, #1a0e02 0%, #5c3f15 30%, #d4a73e 60%, #ffefb6 100%)' },
  { id: 'honey',       name: 'Honey',       meta: 'Liquid amber — click drips a drop downward',        frag: HONEY,
    swatch: 'radial-gradient(120% 120% at 50% 30%, #fce28a 0%, #c47a23 35%, #4d2106 70%, #0d0501 100%)' },
  { id: 'matrix',      name: 'Matrix',      meta: 'Code rain falling — cursor bends columns',          frag: MATRIX,
    swatch: 'linear-gradient(180deg, #020806 0%, #03301a 35%, #07a04a 75%, #b5ffcc 100%)' },
  { id: 'crt',         name: 'CRT',         meta: 'Vintage tube — scanlines, RGB shift, glow',         frag: CRT,
    swatch: 'radial-gradient(120% 120% at 50% 50%, #ff5fd0 0%, #623ce0 40%, #0a0420 80%, #02020c 100%)' },
  { id: 'vortex',      name: 'Vortex',      meta: 'Hypnotic spiral — cursor offsets the eye',          frag: VORTEX,
    swatch: 'conic-gradient(from 0deg at 50% 50%, #ffe88a, #ff3d99, #00d9ff, #ffe88a)' },
  { id: 'circuit',     name: 'Circuit',     meta: 'PCB traces with light pulses — click sends a wave', frag: CIRCUIT,
    swatch: 'linear-gradient(135deg, #02060a 0%, #0a3a2a 35%, #1fb888 65%, #c8ffe8 100%)' },
  { id: 'ocean',       name: 'Ocean',       meta: 'Live waves with caustics + sun glare',              frag: OCEAN,
    swatch: 'linear-gradient(180deg, #02050f 0%, #084c7a 40%, #aedceb 75%, #ffd07a 100%)' },
  { id: 'curlfield',   name: 'Curl Field',  meta: 'Particle streams following a vector field',         frag: CURL_FIELD,
    swatch: 'linear-gradient(120deg, #04040e 0%, #1a4dc8 40%, #d2358a 75%, #fff0bc 100%)' },
  { id: 'lightning',   name: 'Lightning',   meta: 'Procedural lightning bolt — strikes toward cursor', frag: LIGHTNING,
    swatch: 'radial-gradient(60% 60% at 50% 30%, #ffffff 0%, #6ab5ff 25%, #1a2eaa 60%, #02041a 100%)' },
  { id: 'plasmaglobe', name: 'Plasma Globe',meta: 'Radial electric arcs — click adds extra bolt',      frag: PLASMA_GLOBE,
    swatch: 'radial-gradient(60% 60% at 50% 50%, #fff2ff 0%, #b260ff 25%, #5320a8 55%, #0a0418 100%)' },
  { id: 'caustics',    name: 'Caustics',    meta: 'Underwater pool light — shifting bright lines',     frag: CAUSTICS,
    swatch: 'linear-gradient(180deg, #01040d 0%, #1a6090 35%, #aef0ff 70%, #ffffff 100%)' },
  { id: 'tesla',       name: 'Tesla',       meta: 'Tesla coil arcs radiating — chase cursor',          frag: TESLA,
    swatch: 'radial-gradient(60% 80% at 50% 80%, #ffffff 0%, #c870ff 25%, #4e1a9c 60%, #04020a 100%)' },
  { id: 'quantum',     name: 'Quantum',     meta: 'Interference field + entanglement lines',           frag: QUANTUM,
    swatch: 'radial-gradient(120% 120% at 30% 50%, #6aa5ff 0%, #c43e9c 40%, #1c2e9a 70%, #02020c 100%)' },
];

window.WALLPAPERS = WALLPAPERS;
window.SHADER_COMMON = COMMON;
