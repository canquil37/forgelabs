// ForgeLabs — tunable shader variants + parameter schemas.
//
// For shaders WITHOUT a schema, ForgeLabs renders the stock fragment source
// from shaders.js with only the global Mood/Lens/Tempo controls.
//
// For shaders WITH a schema (parchment, aurora, nebula) we provide a parallel
// fragment-source string that exposes the tweakable values as uniforms, plus
// a SCHEMA describing the UI controls.  The runtime swaps the original frag
// for the tunable version when it detects a schema for that shader id.
//
// Adding a new schema later = (1) write a tunable variant of the shader that
// takes uniforms, (2) add a SCHEMA entry, (3) add DEFAULTS for those uniforms.
// No other code changes required.

// ─────────────────────────────────────────────────────────────────────────────
// PARCHMENT — full editor schema (35 knobs). Lifted from reference editor.
// ─────────────────────────────────────────────────────────────────────────────
const PARCHMENT_TUNABLE = `
uniform vec3 U_C_INK, U_C_SEPIA, U_C_PAPER, U_C_CREAM, U_C_AMBER;
uniform float U_STOP_SEPIA, U_STOP_PAPER, U_STOP_CREAM, U_STOP_AMBER;
uniform float U_FLOW_SCALE, U_FLOW_SPEED, U_WARP_PULL;
uniform float U_FIBER_W, U_FIBER_X, U_FIBER_Y, U_GRAIN;
uniform float U_CUR_GLOW, U_CUR_R, U_CUR_CORE;
uniform vec3  U_CUR_TINT;
uniform vec3  U_INK_COLOR;
uniform float U_INK_R0, U_INK_R1, U_INK_DUR, U_INK_IRR, U_INK_OPAC;
uniform float U_SMOKE_AMT, U_SMOKE_SPEED, U_SMOKE_TURB, U_SMOKE_STRETCH, U_SMOKE_DEF;
uniform float U_DRIFT_ANG, U_WAVE_AMP, U_WAVE_FREQ;
uniform float U_BRIGHT, U_CONTRAST, U_SAT, U_VIG;

void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  vec2 toM = m - uv;
  vec2 warp = toM * exp(-length(toM) * 1.8) * U_WARP_PULL;
  vec2 p = uv + warp;

  float t = u_time * U_SMOKE_SPEED;
  vec2 pSmoke = p;
  pSmoke.y *= mix(1.0, U_SMOKE_STRETCH, U_SMOKE_AMT);

  float driftRad = radians(U_DRIFT_ANG);
  vec2 driftDir = -vec2(sin(driftRad), cos(driftRad));
  pSmoke += driftDir * t * 0.6 * U_SMOKE_AMT;

  vec2 swirl = vec2(
    fbm(pSmoke * 1.6 + vec2(t * 0.3, 0.0)),
    fbm(pSmoke * 1.6 + vec2(5.0, t * 0.25))
  ) - 0.5;
  pSmoke += swirl * (U_SMOKE_TURB * 0.35 * U_SMOKE_AMT);

  pSmoke.y += sin(pSmoke.x * U_WAVE_FREQ + u_time * 0.45) * U_WAVE_AMP * 0.18 * U_SMOKE_AMT;
  pSmoke.x += sin(pSmoke.y * U_WAVE_FREQ * 0.7 - u_time * 0.30) * U_WAVE_AMP * 0.12 * U_SMOKE_AMT;

  float flowStatic = fbm(p * U_FLOW_SCALE + u_time * U_FLOW_SPEED);
  float flowSmoke  = fbm(pSmoke * U_FLOW_SCALE);
  flowSmoke = clamp(0.5 + (flowSmoke - 0.5) * U_SMOKE_DEF, 0.0, 1.0);
  float flow = mix(flowStatic, flowSmoke, U_SMOKE_AMT);

  float fiberRaw = fbm(uv * vec2(U_FIBER_X, U_FIBER_Y));
  float fiber = mix(fiberRaw, 0.5, U_SMOKE_AMT);
  float tRamp = smoothstep(0.30, 0.78, flow);

  vec3 col = mix(U_C_INK, U_C_SEPIA, tRamp);
  col = mix(col, U_C_PAPER, smoothstep(U_STOP_SEPIA, U_STOP_PAPER, tRamp));
  col = mix(col, U_C_CREAM, smoothstep(U_STOP_PAPER, U_STOP_CREAM, tRamp));
  col = mix(col, U_C_AMBER, smoothstep(U_STOP_CREAM, U_STOP_AMBER, tRamp) * 0.65);

  col *= 1.0 - U_FIBER_W * 0.5 + U_FIBER_W * fiber;

  float dM = length(uv - m);
  col += exp(-dM * U_CUR_R) * U_CUR_TINT * U_CUR_GLOW;
  col += exp(-dM * (U_CUR_R * 4.5)) * U_CUR_TINT * U_CUR_CORE;

  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < U_INK_DUR + 1.0) {
        vec2 cp = toAR(ck.xy);
        float spread = mix(U_INK_R0, U_INK_R1, smoothstep(0.0, U_INK_DUR, dt));
        float fade = 1.0 - smoothstep(U_INK_DUR * 0.6, U_INK_DUR, dt);
        float boundary = 1.0 - U_INK_IRR + U_INK_IRR * fbm(uv * 14.0 + ck.xy);
        float mask = smoothstep(spread * boundary, spread * 0.55 * boundary, length(uv - cp));
        col = mix(col, U_INK_COLOR, mask * fade * U_INK_OPAC);
      }
    }
  }

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(lum), col, U_SAT);
  col = (col - 0.5) * U_CONTRAST + 0.5;
  col *= U_BRIGHT;
  col *= 1.0 - U_VIG * dot(uv, uv);

  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * U_GRAIN;

  gl_FragColor = vec4(col, 1.0);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// AURORA — palette + motion + cursor halo
// ─────────────────────────────────────────────────────────────────────────────
const AURORA_TUNABLE = `
uniform vec3  U_C1, U_C2, U_C3, U_C4;
uniform float U_FLOW_SPEED, U_WARP_PULL, U_CURSOR_HALO, U_BAND_SHIFT;
uniform vec3  U_HALO_TINT, U_CORE_TINT;
uniform float U_CLICK_INTENSITY;

void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  vec2 toM = m - uv;
  float dM = length(toM);
  vec2 warp = toM * exp(-dM * 1.4) * U_WARP_PULL;

  vec2 p = uv + warp;
  vec2 q = vec2(fbm(p + u_time * (U_FLOW_SPEED * 0.75)),
                fbm(p + vec2(5.2, 1.3) + u_time * U_FLOW_SPEED));
  vec2 r = vec2(fbm(p + 1.8 * q + vec2(1.7, 9.2) + u_time * (U_FLOW_SPEED * 1.125)),
                fbm(p + 1.8 * q + vec2(8.3, 2.8) + u_time * (U_FLOW_SPEED * 1.375)));
  float f = fbm(p + 2.6 * r);
  float t = f + U_BAND_SHIFT * sin(uv.x * 3.5 + u_time * 0.25);

  vec3 col = U_C1;
  col = mix(col, U_C2, smoothstep(0.30, 0.50, t));
  col = mix(col, U_C3, smoothstep(0.50, 0.70, t));
  col = mix(col, U_C4, smoothstep(0.78, 0.88, t));

  col += exp(-dM * 3.8)  * U_HALO_TINT * U_CURSOR_HALO;
  col += exp(-dM * 14.0) * U_CORE_TINT * (U_CURSOR_HALO * 1.15);

  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.55;
        float ring = exp(-pow((length(uv - cp) - rr) * 10.0, 2.0)) * exp(-dt * 0.9);
        col += ring * vec3(0.75, 0.95, 1.0) * U_CLICK_INTENSITY;
      }
    }
  }
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// NEBULA — palette + cloud motion + stars + click bloom
// ─────────────────────────────────────────────────────────────────────────────
const NEBULA_TUNABLE = `
uniform vec3  U_C1, U_C2, U_C3, U_C4;
uniform float U_CLOUD_SPEED, U_WARP_PULL, U_STAR_DENSITY, U_STAR_TWINKLE;
uniform float U_CURSOR_WARMTH, U_CLICK_BLOOM;
uniform vec3  U_CURSOR_TINT, U_BLOOM_TINT;

float fl_starLayer(vec2 uv, float scale, float seed, float twinkleMix) {
  vec2 g = uv * scale + seed;
  vec2 gi = floor(g);
  vec2 gf = fract(g);
  vec2 h = hash22(gi);
  float d = length((gf - h) * 2.0 - 1.0) * 0.5 + length(gf - h);
  float twinkle = mix(1.0, 0.6 + 0.4 * sin(u_time * 2.0 + hash21(gi) * 6.28), twinkleMix);
  return exp(-d * 60.0) * step(0.93, hash21(gi + 11.0)) * twinkle;
}

void main() {
  vec2 uv = toAR(gl_FragCoord.xy);
  vec2 m  = toAR(u_mouseSmooth);

  vec2 toM = m - uv;
  vec2 p = uv + toM * exp(-length(toM) * 1.3) * U_WARP_PULL;

  float n1 = fbm(p * 1.8 + u_time * U_CLOUD_SPEED);
  float n2 = fbm(p * 3.2 - u_time * (U_CLOUD_SPEED * 1.25) + n1);
  float n3 = fbm(p * 0.9 + 1.4 * n1);

  vec3 col = U_C1;
  col = mix(col, U_C2, smoothstep(0.30, 0.62, n1));
  col = mix(col, U_C3, smoothstep(0.55, 0.78, n2) * 0.75);
  col = mix(col, U_C4, smoothstep(0.55, 0.85, n3) * 0.55);

  float stars = 0.0;
  stars += fl_starLayer(uv, 60.0,  0.0, U_STAR_TWINKLE);
  stars += fl_starLayer(uv, 110.0, 23.0, U_STAR_TWINKLE) * 0.7;
  stars += fl_starLayer(uv, 180.0, 51.0, U_STAR_TWINKLE) * 0.5;
  col += stars * vec3(1.0, 0.98, 0.95) * U_STAR_DENSITY;

  col += exp(-length(uv - m) * 3.4) * U_CURSOR_TINT * U_CURSOR_WARMTH;

  for (int i = 0; i < 8; i++) {
    vec4 ck = u_clicks[i];
    if (ck.w > 0.5) {
      float dt = u_time - ck.z;
      if (dt > 0.0 && dt < 3.0) {
        vec2 cp = toAR(ck.xy);
        float rr = dt * 0.55;
        float ring = exp(-pow((length(uv - cp) - rr) * 9.0, 2.0)) * exp(-dt * 0.9);
        float bloom = exp(-length(uv - cp) * 3.5) * exp(-dt * 1.5);
        col += ring * vec3(0.9, 0.8, 1.0) * 1.5 * U_CLICK_BLOOM;
        col += bloom * U_BLOOM_TINT * 1.2 * U_CLICK_BLOOM;
      }
    }
  }
  col += (hash21(gl_FragCoord.xy + u_time) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Schemas — define UI controls for tunable shaders
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMAS = {
  parchment: {
    frag: PARCHMENT_TUNABLE,
    defaults: {
      cInk:'#0a0807', cSepia:'#1d1610', cPaper:'#4d3d33', cCream:'#9e856b', cAmber:'#e0b372',
      stopSepia:0.30, stopPaper:0.45, stopCream:0.72, stopAmber:0.92,
      flowScale:1.5, flowSpeed:0.025, warpPull:0.22,
      fiberWeight:0.16, fiberX:35.0, fiberY:4.0, grain:0.010,
      cursorGlow:0.35, cursorTint:'#8c5930', cursorRadius:3.0, cursorCore:0.0,
      inkColor:'#1a0f08', inkR0:0.04, inkR1:0.10, inkDuration:4.0, inkIrregularity:0.40, inkOpacity:0.85,
      smokeAmt:0.0, smokeSpeed:0.5, smokeTurb:0.5, smokeRiseStretch:0.55, smokeDef:1.0,
      driftAngle:0.0, waveAmp:0.0, waveFreq:2.5,
      brightness:1.0, contrast:1.0, saturation:1.0, vignette:0.18,
    },
    uniforms: {
      U_C_INK:['color','cInk'], U_C_SEPIA:['color','cSepia'], U_C_PAPER:['color','cPaper'],
      U_C_CREAM:['color','cCream'], U_C_AMBER:['color','cAmber'],
      U_STOP_SEPIA:['float','stopSepia'], U_STOP_PAPER:['float','stopPaper'],
      U_STOP_CREAM:['float','stopCream'], U_STOP_AMBER:['float','stopAmber'],
      U_FLOW_SCALE:['float','flowScale'], U_FLOW_SPEED:['float','flowSpeed'], U_WARP_PULL:['float','warpPull'],
      U_FIBER_W:['float','fiberWeight'], U_FIBER_X:['float','fiberX'], U_FIBER_Y:['float','fiberY'], U_GRAIN:['float','grain'],
      U_CUR_GLOW:['float','cursorGlow'], U_CUR_TINT:['color','cursorTint'],
      U_CUR_R:['float','cursorRadius'], U_CUR_CORE:['float','cursorCore'],
      U_INK_COLOR:['color','inkColor'], U_INK_R0:['float','inkR0'], U_INK_R1:['float','inkR1'],
      U_INK_DUR:['float','inkDuration'], U_INK_IRR:['float','inkIrregularity'], U_INK_OPAC:['float','inkOpacity'],
      U_SMOKE_AMT:['float','smokeAmt'], U_SMOKE_SPEED:['float','smokeSpeed'], U_SMOKE_TURB:['float','smokeTurb'],
      U_SMOKE_STRETCH:['float','smokeRiseStretch'], U_SMOKE_DEF:['float','smokeDef'],
      U_DRIFT_ANG:['float','driftAngle'], U_WAVE_AMP:['float','waveAmp'], U_WAVE_FREQ:['float','waveFreq'],
      U_BRIGHT:['float','brightness'], U_CONTRAST:['float','contrast'], U_SAT:['float','saturation'], U_VIG:['float','vignette'],
    },
    presets: {
      'Classic':       { cInk:'#0a0807', cSepia:'#1d1610', cPaper:'#4d3d33', cCream:'#9e856b', cAmber:'#e0b372' },
      'Leather':       { cInk:'#0d0a05', cSepia:'#221908', cPaper:'#48391f', cCream:'#8a6f3f', cAmber:'#d4a64a' },
      'Red wax':       { cInk:'#0a0506', cSepia:'#1d0a0e', cPaper:'#3d1822', cCream:'#9a3a3a', cAmber:'#d4a070' },
      'Cool stone':    { cInk:'#080a0d', cSepia:'#161a22', cPaper:'#2e353f', cCream:'#6f7a85', cAmber:'#aab5c2' },
      'Gold leaf':     { cInk:'#1a0e02', cSepia:'#3d2308', cPaper:'#6f4818', cCream:'#c2913a', cAmber:'#fce28a' },
      'Olive':         { cInk:'#070806', cSepia:'#1a1d10', cPaper:'#3a4220', cCream:'#7e8a4d', cAmber:'#c5c87a' },
      'Mocha':         { cInk:'#080503', cSepia:'#1a0d08', cPaper:'#4a2e1d', cCream:'#9b7350', cAmber:'#e6c084' },
      'Twilight':      { cInk:'#040206', cSepia:'#0e0916', cPaper:'#2a1d3a', cCream:'#6b507a', cAmber:'#d49a7a' },
    },
    sections: [
      { title: 'Palette', controls: [
        { type:'color',  key:'cInk',   label:'Ink' },
        { type:'color',  key:'cSepia', label:'Sepia' },
        { type:'color',  key:'cPaper', label:'Paper' },
        { type:'color',  key:'cCream', label:'Cream' },
        { type:'color',  key:'cAmber', label:'Amber' },
      ]},
      { title: 'Gradient stops', controls: [
        { type:'slider', key:'stopSepia', label:'Sepia stop',  min:0, max:1, step:0.01 },
        { type:'slider', key:'stopPaper', label:'Paper stop',  min:0, max:1, step:0.01 },
        { type:'slider', key:'stopCream', label:'Cream stop',  min:0, max:1, step:0.01 },
        { type:'slider', key:'stopAmber', label:'Amber stop',  min:0, max:1, step:0.01 },
      ]},
      { title: 'Motion', controls: [
        { type:'slider', key:'flowScale', label:'Flow scale',  min:0.3, max:5, step:0.05 },
        { type:'slider', key:'flowSpeed', label:'Flow speed',  min:0,   max:0.3, step:0.005 },
        { type:'slider', key:'warpPull',  label:'Warp pull',   min:0,   max:1.5, step:0.02 },
      ]},
      { title: 'Paper texture', controls: [
        { type:'slider', key:'fiberWeight', label:'Fiber weight', min:0, max:1, step:0.01 },
        { type:'slider', key:'fiberX',      label:'Fiber X',      min:1, max:60, step:0.5 },
        { type:'slider', key:'fiberY',      label:'Fiber Y',      min:1, max:60, step:0.5 },
        { type:'slider', key:'grain',       label:'Grain',        min:0, max:0.05, step:0.001 },
      ]},
      { title: 'Cursor halo', controls: [
        { type:'color',  key:'cursorTint',   label:'Tint' },
        { type:'slider', key:'cursorGlow',   label:'Glow',   min:0, max:2, step:0.02 },
        { type:'slider', key:'cursorRadius', label:'Radius (inv)', min:0.5, max:10, step:0.1 },
        { type:'slider', key:'cursorCore',   label:'Core',   min:0, max:1, step:0.02 },
      ]},
      { title: 'Ink (click)', controls: [
        { type:'color',  key:'inkColor',        label:'Color' },
        { type:'slider', key:'inkR0',           label:'Start radius', min:0, max:0.3, step:0.005 },
        { type:'slider', key:'inkR1',           label:'End radius',   min:0.02, max:0.6, step:0.005 },
        { type:'slider', key:'inkDuration',     label:'Duration',     min:0.5, max:10, step:0.1 },
        { type:'slider', key:'inkIrregularity', label:'Irregularity', min:0, max:1, step:0.02 },
        { type:'slider', key:'inkOpacity',      label:'Opacity',      min:0, max:1, step:0.02 },
      ]},
      { title: 'Smoke / drift', controls: [
        { type:'slider', key:'smokeAmt',    label:'Smoke amount', min:0, max:1, step:0.01 },
        { type:'slider', key:'smokeSpeed',  label:'Speed',        min:0, max:3, step:0.02 },
        { type:'slider', key:'smokeTurb',   label:'Turbulence',   min:0, max:2, step:0.02 },
        { type:'slider', key:'smokeRiseStretch', label:'Stretch', min:0.2, max:2.5, step:0.02 },
        { type:'slider', key:'smokeDef',    label:'Definition',   min:0.2, max:3.5, step:0.02 },
        { type:'slider', key:'driftAngle',  label:'Drift angle°', min:-180, max:180, step:1 },
        { type:'slider', key:'waveAmp',     label:'Wave amp',     min:0, max:1.5, step:0.02 },
        { type:'slider', key:'waveFreq',    label:'Wave freq',    min:0.5, max:8, step:0.1 },
      ]},
      { title: 'Look (post)', controls: [
        { type:'slider', key:'brightness', label:'Brightness', min:0.4, max:1.6, step:0.01 },
        { type:'slider', key:'contrast',   label:'Contrast',   min:0.5, max:1.8, step:0.01 },
        { type:'slider', key:'saturation', label:'Saturation', min:0, max:2, step:0.01 },
        { type:'slider', key:'vignette',   label:'Vignette',   min:0, max:1.2, step:0.02 },
      ]},
    ],
  },

  aurora: {
    frag: AURORA_TUNABLE,
    defaults: {
      c1:'#040712', c2:'#008c9e', c3:'#a61dc8', c4:'#fae08c',
      flowSpeed:0.08, warpPull:0.55, cursorHalo:0.35, bandShift:0.28,
      haloTint:'#7a4dcc', coreTint:'#fff2e6',
      clickIntensity:1.4,
    },
    uniforms: {
      U_C1:['color','c1'], U_C2:['color','c2'], U_C3:['color','c3'], U_C4:['color','c4'],
      U_FLOW_SPEED:['float','flowSpeed'], U_WARP_PULL:['float','warpPull'],
      U_CURSOR_HALO:['float','cursorHalo'], U_BAND_SHIFT:['float','bandShift'],
      U_HALO_TINT:['color','haloTint'], U_CORE_TINT:['color','coreTint'],
      U_CLICK_INTENSITY:['float','clickIntensity'],
    },
    presets: {
      'Classic':      { c1:'#040712', c2:'#008c9e', c3:'#a61dc8', c4:'#fae08c' },
      'Cold North':   { c1:'#030814', c2:'#0fe3c2', c3:'#3b6dff', c4:'#bdf2ff' },
      'Ember':        { c1:'#0a0204', c2:'#a13212', c3:'#e89b3a', c4:'#ffe9a8' },
      'Acid bloom':   { c1:'#040414', c2:'#1fff8a', c3:'#ff2bd6', c4:'#f0ff95' },
      'Bruise':       { c1:'#06030f', c2:'#3a1582', c3:'#c1265d', c4:'#ffd49b' },
    },
    sections: [
      { title: 'Palette', controls: [
        { type:'color',  key:'c1', label:'Deep' },
        { type:'color',  key:'c2', label:'Teal' },
        { type:'color',  key:'c3', label:'Magenta' },
        { type:'color',  key:'c4', label:'Gold' },
      ]},
      { title: 'Motion', controls: [
        { type:'slider', key:'flowSpeed', label:'Flow speed', min:0,   max:0.4, step:0.005 },
        { type:'slider', key:'warpPull',  label:'Warp pull',  min:0,   max:1.5, step:0.02 },
        { type:'slider', key:'bandShift', label:'Band shift', min:0,   max:1.2, step:0.02 },
      ]},
      { title: 'Cursor halo', controls: [
        { type:'color',  key:'haloTint',   label:'Halo tint' },
        { type:'color',  key:'coreTint',   label:'Core tint' },
        { type:'slider', key:'cursorHalo', label:'Intensity', min:0, max:1.5, step:0.02 },
      ]},
      { title: 'Click', controls: [
        { type:'slider', key:'clickIntensity', label:'Pulse intensity', min:0, max:3, step:0.05 },
      ]},
    ],
  },

  nebula: {
    frag: NEBULA_TUNABLE,
    defaults: {
      c1:'#050314', c2:'#8c1a9e', c3:'#f2664c', c4:'#2da6ff',
      cloudSpeed:0.04, warpPull:0.45,
      starDensity:1.0, starTwinkle:1.0,
      cursorWarmth:0.30, cursorTint:'#8c66bf',
      clickBloom:1.0, bloomTint:'#b366f2',
    },
    uniforms: {
      U_C1:['color','c1'], U_C2:['color','c2'], U_C3:['color','c3'], U_C4:['color','c4'],
      U_CLOUD_SPEED:['float','cloudSpeed'], U_WARP_PULL:['float','warpPull'],
      U_STAR_DENSITY:['float','starDensity'], U_STAR_TWINKLE:['float','starTwinkle'],
      U_CURSOR_WARMTH:['float','cursorWarmth'], U_CURSOR_TINT:['color','cursorTint'],
      U_CLICK_BLOOM:['float','clickBloom'], U_BLOOM_TINT:['color','bloomTint'],
    },
    presets: {
      'Classic':     { c1:'#050314', c2:'#8c1a9e', c3:'#f2664c', c4:'#2da6ff' },
      'Deep field':  { c1:'#01020a', c2:'#1a2a82', c3:'#5a85d9', c4:'#a8c5ff' },
      'Carina':      { c1:'#0a0414', c2:'#6a1c8c', c3:'#ff8a3a', c4:'#7af0ff' },
      'Helix':       { c1:'#04020a', c2:'#0d5e7a', c3:'#26c2c2', c4:'#e8f5ff' },
      'Crab':        { c1:'#070205', c2:'#a12848', c3:'#e8a23a', c4:'#5fb8ff' },
    },
    sections: [
      { title: 'Palette', controls: [
        { type:'color', key:'c1', label:'Void' },
        { type:'color', key:'c2', label:'Mid' },
        { type:'color', key:'c3', label:'Warm' },
        { type:'color', key:'c4', label:'Cool' },
      ]},
      { title: 'Clouds', controls: [
        { type:'slider', key:'cloudSpeed', label:'Speed',    min:0, max:0.2, step:0.002 },
        { type:'slider', key:'warpPull',   label:'Warp pull',min:0, max:1.5, step:0.02 },
      ]},
      { title: 'Stars', controls: [
        { type:'slider', key:'starDensity', label:'Density',  min:0, max:3, step:0.05 },
        { type:'slider', key:'starTwinkle', label:'Twinkle',  min:0, max:1, step:0.02 },
      ]},
      { title: 'Cursor', controls: [
        { type:'color',  key:'cursorTint',   label:'Tint' },
        { type:'slider', key:'cursorWarmth', label:'Warmth', min:0, max:1.5, step:0.02 },
      ]},
      { title: 'Click bloom', controls: [
        { type:'color',  key:'bloomTint',  label:'Tint' },
        { type:'slider', key:'clickBloom', label:'Intensity', min:0, max:3, step:0.05 },
      ]},
    ],
  },
};

// Family groupings for filter chips
const FAMILY = {
  mercury:'Originals', aurora:'Originals', lattice:'Originals', plasma:'Originals', prism:'Originals',
  nebula:'Space', galaxy:'Space', singularity:'Space', wormhole:'Space', hyperspace:'Space',
  manifold:'Math', lagrangian:'Math', riemann:'Math', constellation:'Math',
  silk:'Subtle', vapor:'Subtle', tide:'Subtle', graphite:'Subtle',
  parchment:'Parchment', vellum:'Parchment', foxing:'Parchment', gilded:'Parchment', honey:'Parchment',
};

const FAMILIES = ['All', 'Originals', 'Space', 'Math', 'Subtle', 'Parchment', 'Aurora-family'];
// Aurora-family is a meta-filter: parchment/vellum/foxing/gilded/honey + aurora itself
const AURORA_FAMILY_IDS = new Set(['aurora', 'parchment', 'vellum', 'foxing', 'gilded', 'honey']);

window.FORGELABS_TUNABLE = { SCHEMAS, FAMILY, FAMILIES, AURORA_FAMILY_IDS };
