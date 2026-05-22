// ForgeLabs — tunable shader variants + parameter schemas.
//
// For shaders WITHOUT a schema, ForgeLabs renders the stock fragment source
// from shaders.js with only the global Mood/Lens/Tempo controls.
//
// For shaders WITH a schema, we provide a parallel fragment-source string
// that exposes the tweakable values as uniforms, plus a SCHEMA describing
// the UI controls.  The runtime swaps the original frag for the tunable
// version when it detects a schema for that shader id.
//
// Adding a new schema later = (1) write a tunable variant of the shader that
// takes uniforms, (2) add a SCHEMA entry, (3) add DEFAULTS for those uniforms.
// No other code changes required.

// ─────────────────────────────────────────────────────────────────────────────
// PARCHMENT — full editor schema (35 knobs).
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
  vec2 swirl = vec2(fbm(pSmoke * 1.6 + vec2(t * 0.3, 0.0)), fbm(pSmoke * 1.6 + vec2(5.0, t * 0.25))) - 0.5;
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
// Compact tunable variants for the 22 other built-in shaders + 6 new ones.
// Each follows a common interface:  4 colors + flow speed + warp + cursor + click.
// Shaders with special behavior add 1-2 extra knobs.
// ─────────────────────────────────────────────────────────────────────────────

const AURORA_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_C4,U_HALO_TINT,U_CORE_TINT;
uniform float U_FLOW_SPEED,U_WARP_PULL,U_CURSOR_HALO,U_BAND_SHIFT,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; float dM=length(toM); vec2 warp=toM*exp(-dM*1.4)*U_WARP_PULL;
  vec2 p=uv+warp;
  vec2 q=vec2(fbm(p+u_time*(U_FLOW_SPEED*0.75)), fbm(p+vec2(5.2,1.3)+u_time*U_FLOW_SPEED));
  vec2 r=vec2(fbm(p+1.8*q+vec2(1.7,9.2)+u_time*(U_FLOW_SPEED*1.125)), fbm(p+1.8*q+vec2(8.3,2.8)+u_time*(U_FLOW_SPEED*1.375)));
  float f=fbm(p+2.6*r); float t=f+U_BAND_SHIFT*sin(uv.x*3.5+u_time*0.25);
  vec3 col=U_C1;
  col=mix(col,U_C2,smoothstep(0.30,0.50,t));
  col=mix(col,U_C3,smoothstep(0.50,0.70,t));
  col=mix(col,U_C4,smoothstep(0.78,0.88,t));
  col+=exp(-dM*3.8)*U_HALO_TINT*U_CURSOR_HALO;
  col+=exp(-dM*14.0)*U_CORE_TINT*(U_CURSOR_HALO*1.15);
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.55; float ring=exp(-pow((length(uv-cp)-rr)*10.0,2.0))*exp(-dt*0.9); col+=ring*vec3(0.75,0.95,1.0)*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.012;
  gl_FragColor=vec4(col,1.0);
}
`;

const NEBULA_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_C4,U_CURSOR_TINT,U_BLOOM_TINT;
uniform float U_CLOUD_SPEED,U_WARP_PULL,U_STAR_DENSITY,U_STAR_TWINKLE,U_CURSOR_WARMTH,U_CLICK_BLOOM;
float fl_starLayer(vec2 uv,float scale,float seed,float twinkleMix){
  vec2 g=uv*scale+seed; vec2 gi=floor(g); vec2 gf=fract(g);
  vec2 h=hash22(gi); float d=length((gf-h)*2.0-1.0)*0.5+length(gf-h);
  float tw=mix(1.0,0.6+0.4*sin(u_time*2.0+hash21(gi)*6.28),twinkleMix);
  return exp(-d*60.0)*step(0.93,hash21(gi+11.0))*tw;
}
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.3)*U_WARP_PULL;
  float n1=fbm(p*1.8+u_time*U_CLOUD_SPEED);
  float n2=fbm(p*3.2-u_time*(U_CLOUD_SPEED*1.25)+n1);
  float n3=fbm(p*0.9+1.4*n1);
  vec3 col=U_C1;
  col=mix(col,U_C2,smoothstep(0.30,0.62,n1));
  col=mix(col,U_C3,smoothstep(0.55,0.78,n2)*0.75);
  col=mix(col,U_C4,smoothstep(0.55,0.85,n3)*0.55);
  float stars=fl_starLayer(uv,60.0,0.0,U_STAR_TWINKLE)
            +fl_starLayer(uv,110.0,23.0,U_STAR_TWINKLE)*0.7
            +fl_starLayer(uv,180.0,51.0,U_STAR_TWINKLE)*0.5;
  col+=stars*vec3(1.0,0.98,0.95)*U_STAR_DENSITY;
  col+=exp(-length(uv-m)*3.4)*U_CURSOR_TINT*U_CURSOR_WARMTH;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.55; float ring=exp(-pow((length(uv-cp)-rr)*9.0,2.0))*exp(-dt*0.9); float bloom=exp(-length(uv-cp)*3.5)*exp(-dt*1.5); col+=ring*vec3(0.9,0.8,1.0)*1.5*U_CLICK_BLOOM; col+=bloom*U_BLOOM_TINT*1.2*U_CLICK_BLOOM;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.012;
  gl_FragColor=vec4(col,1.0);
}
`;

const MERCURY_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_HIGHLIGHT;
uniform float U_FLOW_SPEED,U_WARP_PULL,U_METALNESS,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 warp=toM*exp(-length(toM)*1.8)*U_WARP_PULL;
  vec2 p=uv+warp;
  float n=fbm(p*2.5+u_time*U_FLOW_SPEED);
  n+=fbm(p*5.0-u_time*(U_FLOW_SPEED*0.5))*0.4;
  float fres=pow(1.0-clamp(n,0.0,1.0),3.0);
  vec3 col=mix(U_C1,U_C2,smoothstep(0.30,0.55,n));
  col=mix(col,U_C3,smoothstep(0.50,0.75,n));
  col+=fres*U_HIGHLIGHT*U_METALNESS;
  col+=exp(-length(uv-m)*4.5)*U_HIGHLIGHT*0.7;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<2.5){vec2 cp=toAR(ck.xy); float rr=dt*0.5; float ring=exp(-pow((length(uv-cp)-rr)*10.0,2.0))*exp(-dt*0.9); col+=ring*U_HIGHLIGHT*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const LATTICE_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_C4;
uniform float U_SCALE,U_FLOW_SPEED,U_WARP_PULL,U_EDGE_W,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.4)*U_WARP_PULL;
  vec2 g=p*U_SCALE; vec2 gi=floor(g); vec2 gf=fract(g);
  float minD=1e6; vec2 minOff=vec2(0.0);
  for(int j=-1;j<=1;j++){ for(int i=-1;i<=1;i++){
    vec2 o=vec2(float(i),float(j));
    vec2 c=o+0.5+0.42*sin(u_time*U_FLOW_SPEED+6.28*hash22(gi+o));
    float d=length(gf-c);
    if(d<minD){ minD=d; minOff=o+hash22(gi+o); }
  }}
  float cell=hash21(gi+minOff);
  float edge=smoothstep(U_EDGE_W,0.0,minD-0.18);
  vec3 col=mix(U_C1,U_C2,cell);
  col=mix(col,U_C3,smoothstep(0.50,0.85,cell));
  col=mix(col,U_C4,edge);
  col+=exp(-length(uv-m)*4.0)*vec3(1.0,0.9,0.7)*0.4;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<2.5){vec2 cp=toAR(ck.xy); float rr=dt*0.55; float ring=exp(-pow((length(uv-cp)-rr)*10.0,2.0))*exp(-dt*0.9); col+=ring*U_C4*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const PLASMA_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_C4,U_HOT;
uniform float U_FLOW_SPEED,U_WARP_PULL,U_HEAT,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.7)*U_WARP_PULL;
  float n=sin(p.x*3.0+u_time*U_FLOW_SPEED*4.0)+sin(p.y*3.5-u_time*U_FLOW_SPEED*3.5)
        +sin((p.x+p.y)*4.0+u_time*U_FLOW_SPEED*5.0);
  n=n/3.0; float v=0.5+0.5*n; v=clamp(v,0.0,1.0);
  vec3 col=mix(U_C1,U_C2,smoothstep(0.20,0.45,v));
  col=mix(col,U_C3,smoothstep(0.45,0.70,v));
  col=mix(col,U_C4,smoothstep(0.70,0.92,v));
  float heat=exp(-length(uv-m)*2.5);
  col+=heat*U_HOT*U_HEAT;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.55; float ring=exp(-pow((length(uv-cp)-rr)*9.0,2.0))*exp(-dt*0.85); col+=ring*U_HOT*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const PRISM_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3;
uniform float U_FLOW_SPEED,U_WARP_PULL,U_DISPERSION,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.5)*U_WARP_PULL;
  float n=fbm(p*1.5+u_time*U_FLOW_SPEED);
  float disp=U_DISPERSION*0.04;
  float r=fbm(p*1.5+vec2( disp,0.0)+u_time*U_FLOW_SPEED);
  float g=fbm(p*1.5+u_time*U_FLOW_SPEED);
  float b=fbm(p*1.5+vec2(-disp,0.0)+u_time*U_FLOW_SPEED);
  vec3 col=U_C1*r+U_C2*g+U_C3*b;
  col*=0.55;
  col+=exp(-length(uv-m)*3.5)*vec3(1.0,0.95,1.0)*0.45;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.55; float ring=exp(-pow((length(uv-cp)-rr)*9.0,2.0))*exp(-dt*0.85); col+=ring*vec3(0.9,0.95,1.0)*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const GALAXY_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_CORE_COL,U_STAR_COL;
uniform float U_SPIN_SPEED,U_WARP_PULL,U_ARM_TIGHT,U_CORE_GLOW,U_STAR_DENSITY,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 p=uv-m*0.45;
  float r=length(p); float a=atan(p.y,p.x);
  float arms=sin(a*2.0+U_ARM_TIGHT*log(r+0.05)*8.0-u_time*U_SPIN_SPEED);
  float t=0.5+0.5*arms; t*=smoothstep(0.0,0.7,1.0-r);
  vec3 col=mix(U_C1,U_C2,smoothstep(0.20,0.50,t));
  col=mix(col,U_C3,smoothstep(0.50,0.80,t)*0.8);
  col+=exp(-r*5.0)*U_CORE_COL*U_CORE_GLOW;
  // stars
  vec2 sg=floor(uv*120.0); float sh=hash21(sg);
  float star=step(0.985,sh)*U_STAR_DENSITY;
  col+=star*U_STAR_COL;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.55; float ring=exp(-pow((length(uv-cp)-rr)*9.0,2.0))*exp(-dt*0.9); col+=ring*U_STAR_COL*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const SINGULARITY_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_DISK_HOT;
uniform float U_MASS,U_DISK_THICK,U_DISK_SPEED,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 p=uv-m*0.30;
  float r=length(p); float a=atan(p.y,p.x);
  // event horizon
  float horizon=smoothstep(U_MASS*0.18,U_MASS*0.13,r);
  // bend background via 1/r lensing
  vec2 bent=p*(1.0+U_MASS*0.4/(r*r+0.04));
  float bg=fbm(bent*2.0+u_time*0.05);
  // accretion disk
  float diskBand=exp(-pow((r-U_MASS*0.30)/U_DISK_THICK,2.0));
  float diskAnim=0.5+0.5*sin(a*4.0+u_time*U_DISK_SPEED);
  vec3 disk=mix(U_C2,U_DISK_HOT,diskAnim)*diskBand;
  vec3 col=mix(U_C1,U_C3,bg);
  col=mix(col,disk,clamp(diskBand,0.0,1.0));
  col*=1.0-horizon;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.45; float ring=exp(-pow((length(uv-cp)-rr)*10.0,2.0))*exp(-dt*0.9); col+=ring*U_DISK_HOT*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const WORMHOLE_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_RIM;
uniform float U_PULL_SPEED,U_TWIST,U_WARP_PULL,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 p=uv-m*U_WARP_PULL;
  float r=length(p); float a=atan(p.y,p.x);
  float lp=log(r+0.05);
  float v=fbm(vec2(a*U_TWIST+lp*4.0,lp*8.0-u_time*U_PULL_SPEED*2.0));
  vec3 col=mix(U_C1,U_C2,smoothstep(0.30,0.55,v));
  col=mix(col,U_C3,smoothstep(0.55,0.80,v));
  col+=exp(-r*4.0)*U_RIM*0.9;
  col*=1.0-smoothstep(1.0,1.4,r);
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.55; float ring=exp(-pow((length(uv-cp)-rr)*9.0,2.0))*exp(-dt*0.85); col+=ring*U_RIM*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const HYPERSPACE_TUNABLE = `
uniform vec3 U_C1,U_C2,U_STREAK;
uniform float U_SPEED,U_DENSITY,U_WARP_PULL,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 p=uv-m*U_WARP_PULL;
  float r=length(p); float a=atan(p.y,p.x);
  vec2 g=vec2(a*U_DENSITY,log(r+0.03)*8.0-u_time*U_SPEED*4.0);
  float streak=fbm(g);
  streak=pow(streak,3.0);
  vec3 col=mix(U_C1,U_C2,smoothstep(0.20,0.55,streak));
  col=mix(col,U_STREAK,smoothstep(0.65,0.85,streak));
  col*=smoothstep(0.0,0.4,r);
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<2.5){vec2 cp=toAR(ck.xy); float rr=dt*0.6; float ring=exp(-pow((length(uv-cp)-rr)*9.0,2.0))*exp(-dt*0.85); col+=ring*U_STREAK*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const MANIFOLD_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_GLYPH_COL;
uniform float U_FLOW_SPEED,U_WARP_PULL,U_GLYPH_DENSITY,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.4)*U_WARP_PULL;
  float f=fbm(p*1.5+u_time*U_FLOW_SPEED);
  vec3 col=mix(U_C1,U_C2,smoothstep(0.30,0.55,f));
  col=mix(col,U_C3,smoothstep(0.55,0.80,f));
  // glyph layer
  vec2 g=uv*U_GLYPH_DENSITY+u_time*0.1; vec2 gi=floor(g); vec2 gf=fract(g);
  float idx=hash21(gi);
  float gv=mathGlyph(gf,idx)*step(0.7,hash21(gi+5.0));
  col+=gv*U_GLYPH_COL*0.85;
  col+=exp(-length(uv-m)*3.8)*U_GLYPH_COL*0.4;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.55; float ring=exp(-pow((length(uv-cp)-rr)*9.0,2.0))*exp(-dt*0.85); col+=ring*U_GLYPH_COL*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.012;
  gl_FragColor=vec4(col,1.0);
}
`;

const LAGRANGIAN_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_GLYPH_COL;
uniform float U_FLOW_SPEED,U_WARP_PULL,U_LINE_SPEED,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.2)*U_WARP_PULL;
  float n=fbm(p*1.5+u_time*U_FLOW_SPEED);
  vec3 col=mix(U_C1,U_C2,smoothstep(0.30,0.60,n));
  col=mix(col,U_C3,smoothstep(0.55,0.85,n)*0.6);
  // line-by-line glyph reveal
  float line=fract(uv.y*8.0);
  float reveal=fract(uv.x*0.6+u_time*U_LINE_SPEED);
  vec2 g=vec2(uv.x*30.0,floor(uv.y*8.0));
  float idx=hash21(floor(g));
  vec2 cellP=vec2(fract(g.x),line);
  float gv=mathGlyph(cellP,idx)*step(0.6,hash21(floor(g)+1.0));
  gv*=smoothstep(0.0,0.05,reveal-fract(uv.x*0.6));
  col+=gv*U_GLYPH_COL*0.7;
  col+=exp(-length(uv-m)*3.5)*U_GLYPH_COL*0.4;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.55; float ring=exp(-pow((length(uv-cp)-rr)*9.0,2.0))*exp(-dt*0.85); col+=ring*U_GLYPH_COL*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.012;
  gl_FragColor=vec4(col,1.0);
}
`;

const RIEMANN_TUNABLE = `
uniform float U_ZOOM,U_FLOW_SPEED,U_SAT,U_WARP_PULL,U_CLICK_INTENSITY;
uniform vec3 U_HALO;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 z=(uv-m*U_WARP_PULL)*U_ZOOM;
  // f(z) = z^3 + (offset rotating)
  float t=u_time*U_FLOW_SPEED;
  vec2 zero=vec2(sin(t),cos(t))*0.5;
  vec2 z2=vec2(z.x*z.x-z.y*z.y, 2.0*z.x*z.y);
  vec2 z3=vec2(z.x*z2.x-z.y*z2.y, z.x*z2.y+z.y*z2.x);
  vec2 fz=z3-vec2(zero.x*z2.x-zero.y*z2.y, zero.x*z2.y+zero.y*z2.x);
  float mag=length(fz);
  float arg=atan(fz.y,fz.x);
  // hue from arg, value from log-magnitude
  float h=arg/6.283+0.5;
  float v=1.0/(1.0+log(1.0+mag*0.5));
  // simple hue to rgb
  vec3 col=vec3(0.5+0.5*cos(6.283*(h+vec3(0.0,0.33,0.67))));
  col=mix(vec3(dot(col,vec3(0.33))),col,U_SAT);
  col*=v;
  col+=exp(-length(uv-m)*3.5)*U_HALO*0.5;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.55; float ring=exp(-pow((length(uv-cp)-rr)*9.0,2.0))*exp(-dt*0.85); col+=ring*U_HALO*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const CONSTELLATION_TUNABLE = `
uniform vec3 U_BG,U_STAR_COL,U_LINK_COL;
uniform float U_DENSITY,U_FLOW_SPEED,U_GRAVITY,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec3 col=U_BG;
  vec2 g=uv*U_DENSITY; vec2 gi=floor(g); vec2 gf=fract(g);
  // 3x3 neighborhood
  float starGlow=0.0;
  for(int j=-1;j<=1;j++){ for(int i=-1;i<=1;i++){
    vec2 o=vec2(float(i),float(j));
    vec2 h=hash22(gi+o);
    vec2 c=o+h+0.10*sin(u_time*U_FLOW_SPEED+6.28*h);
    // attract toward cursor
    vec2 mc=m*U_DENSITY-(gi+o); vec2 dir=mc-c; c+=normalize(dir+1e-4)*U_GRAVITY*0.3;
    float d=length(gf-c);
    starGlow+=exp(-d*22.0);
  }}
  col+=starGlow*U_STAR_COL;
  // simple link to nearest mouse direction
  vec2 mv=normalize(m-uv+1e-4);
  float align=clamp(dot(mv,vec2(1.0,0.0)),0.0,1.0);
  col+=U_LINK_COL*align*0.05;
  col+=exp(-length(uv-m)*4.5)*U_STAR_COL*0.5;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<2.0){vec2 cp=toAR(ck.xy); float rr=dt*0.45; float ring=exp(-pow((length(uv-cp)-rr)*10.0,2.0))*exp(-dt*1.0); col+=ring*U_LINK_COL*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.008;
  gl_FragColor=vec4(col,1.0);
}
`;

const SILK_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3;
uniform float U_FLOW_SPEED,U_WARP_PULL,U_RIBBON_FREQ,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.6)*U_WARP_PULL;
  float bands=sin(p.y*U_RIBBON_FREQ+fbm(p*1.5+u_time*U_FLOW_SPEED)*3.0);
  float t=0.5+0.5*bands;
  vec3 col=mix(U_C1,U_C2,smoothstep(0.25,0.55,t));
  col=mix(col,U_C3,smoothstep(0.55,0.85,t)*0.7);
  col+=exp(-length(uv-m)*4.0)*U_C3*0.3;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<2.5){vec2 cp=toAR(ck.xy); float rr=dt*0.5; float ring=exp(-pow((length(uv-cp)-rr)*10.0,2.0))*exp(-dt*1.0); col+=ring*U_C3*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const VAPOR_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_SHAFT;
uniform float U_FLOW_SPEED,U_WARP_PULL,U_SHAFT_INTENSITY,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.6)*U_WARP_PULL;
  float mist=fbm(p*2.0+u_time*U_FLOW_SPEED);
  float vertical=smoothstep(-0.4,0.7,uv.y);
  vec3 col=mix(U_C1,U_C2,smoothstep(0.25,0.65,mist*vertical));
  col=mix(col,U_C3,smoothstep(0.60,0.90,vertical)*0.55);
  // light shaft
  float shaft=pow(max(sin(uv.x*4.0+u_time*0.3)*0.5+0.5,0.0),12.0)*vertical;
  col+=shaft*U_SHAFT*U_SHAFT_INTENSITY;
  col+=exp(-length(uv-m)*4.0)*U_SHAFT*0.3;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<2.5){vec2 cp=toAR(ck.xy); float rr=dt*0.5; float ring=exp(-pow((length(uv-cp)-rr)*10.0,2.0))*exp(-dt*1.0); col+=ring*U_SHAFT*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const TIDE_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3;
uniform float U_FLOW_SPEED,U_BAND_FREQ,U_WARP_PULL,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.5)*U_WARP_PULL;
  float wave=sin(p.y*U_BAND_FREQ+u_time*U_FLOW_SPEED+fbm(p*1.5+u_time*U_FLOW_SPEED*0.4)*2.0);
  float t=0.5+0.5*wave;
  vec3 col=mix(U_C1,U_C2,smoothstep(0.20,0.55,t));
  col=mix(col,U_C3,smoothstep(0.65,0.95,t));
  col+=exp(-length(uv-m)*3.5)*U_C3*0.3;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.5){vec2 cp=toAR(ck.xy); float rr=dt*0.45; float ring=exp(-pow((length(uv-cp)-rr)*9.0,2.0))*exp(-dt*0.7); col+=ring*U_C3*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const GRAPHITE_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3;
uniform float U_FLOW_SPEED,U_WARP_PULL,U_HATCH_FREQ,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.5)*U_WARP_PULL;
  float n=fbm(p*2.0+u_time*U_FLOW_SPEED);
  // hatch lines aligned with gradient
  float gx=fbm(p*2.0+vec2(0.01,0.0))-fbm(p*2.0-vec2(0.01,0.0));
  float gy=fbm(p*2.0+vec2(0.0,0.01))-fbm(p*2.0-vec2(0.0,0.01));
  float ang=atan(gy,gx);
  vec2 rot=vec2(cos(ang),sin(ang));
  float hatch=sin(dot(uv,rot)*U_HATCH_FREQ);
  hatch=0.5+0.5*hatch;
  vec3 col=mix(U_C1,U_C2,smoothstep(0.30,0.60,n));
  col=mix(col,U_C3,smoothstep(0.65,0.90,n)*0.7);
  col*=mix(0.85,1.05,hatch);
  col+=exp(-length(uv-m)*4.0)*U_C3*0.25;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<2.5){vec2 cp=toAR(ck.xy); float rr=dt*0.5; float ring=exp(-pow((length(uv-cp)-rr)*10.0,2.0))*exp(-dt*1.0); col+=ring*U_C3*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.012;
  gl_FragColor=vec4(col,1.0);
}
`;

const VELLUM_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_C4;
uniform float U_FLOW_SPEED,U_CRACKLE,U_WARP_PULL,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.8)*U_WARP_PULL;
  float flow=fbm(p*1.5+u_time*U_FLOW_SPEED);
  // craquelure
  vec2 cg=floor(uv*40.0); vec2 cgf=fract(uv*40.0);
  float ed=min(min(cgf.x,1.0-cgf.x),min(cgf.y,1.0-cgf.y));
  float crack=smoothstep(0.05,0.0,ed)*step(0.5,hash21(cg))*U_CRACKLE;
  vec3 col=mix(U_C1,U_C2,smoothstep(0.30,0.55,flow));
  col=mix(col,U_C3,smoothstep(0.55,0.78,flow));
  col=mix(col,U_C4,smoothstep(0.78,0.92,flow)*0.55);
  col*=1.0-crack*0.45;
  col+=exp(-length(uv-m)*3.5)*U_C4*0.30;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.40; float ring=exp(-pow((length(uv-cp)-rr)*9.0,2.0))*exp(-dt*0.85); col+=ring*U_C4*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const FOXING_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_RUST;
uniform float U_FLOW_SPEED,U_RUST_AMT,U_WARP_PULL,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.7)*U_WARP_PULL;
  float flow=fbm(p*1.5+u_time*U_FLOW_SPEED);
  vec3 col=mix(U_C1,U_C2,smoothstep(0.30,0.65,flow));
  col=mix(col,U_C3,smoothstep(0.65,0.90,flow)*0.7);
  // rust spots
  float spots=smoothstep(0.62,0.85,fbm(uv*6.0));
  col=mix(col,U_RUST,spots*U_RUST_AMT);
  col+=exp(-length(uv-m)*3.5)*U_RUST*0.30;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.40; float ring=exp(-pow((length(uv-cp)-rr)*9.0,2.0))*exp(-dt*0.85); col+=ring*U_RUST*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const GILDED_TUNABLE = `
uniform vec3 U_C1,U_C2,U_GOLD,U_HIGHLIGHT;
uniform float U_FLOW_SPEED,U_STREAK_FREQ,U_WARP_PULL,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.7)*U_WARP_PULL;
  float flow=fbm(p*1.5+u_time*U_FLOW_SPEED);
  float streak=sin(p.y*U_STREAK_FREQ+flow*4.0+u_time*U_FLOW_SPEED*8.0);
  streak=pow(0.5+0.5*streak,5.0);
  vec3 col=mix(U_C1,U_C2,smoothstep(0.30,0.65,flow));
  col=mix(col,U_GOLD,smoothstep(0.55,0.80,flow));
  col+=streak*U_HIGHLIGHT*0.6;
  col+=exp(-length(uv-m)*4.0)*U_HIGHLIGHT*0.35;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.45; float ring=exp(-pow((length(uv-cp)-rr)*9.0,2.0))*exp(-dt*0.85); col+=ring*U_HIGHLIGHT*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const HONEY_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_DRIP;
uniform float U_FLOW_SPEED,U_VISCOSITY,U_WARP_PULL,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.5)*U_WARP_PULL;
  // anisotropic stretched in y for downward flow
  p.y*=U_VISCOSITY;
  float flow=fbm(p*1.5+u_time*U_FLOW_SPEED);
  vec3 col=mix(U_C1,U_C2,smoothstep(0.30,0.60,flow));
  col=mix(col,U_C3,smoothstep(0.55,0.85,flow));
  col+=exp(-length(uv-m)*3.5)*U_DRIP*0.30;
  // drip from click
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<4.0){vec2 cp=toAR(ck.xy); cp.y-=dt*0.18; // drip down
        float r=length(vec2(uv.x-cp.x,(uv.y-cp.y)*1.5)); float mask=smoothstep(0.04+dt*0.02,0.0,r)*(1.0-smoothstep(2.5,4.0,dt));
        col=mix(col,U_DRIP,mask*U_CLICK_INTENSITY*0.7);}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// New shaders (full schemas)
// ─────────────────────────────────────────────────────────────────────────────

const MATRIX_TUNABLE = `
uniform vec3 U_BASE,U_HOT;
uniform float U_COL_DENSITY,U_FALL_SPEED,U_HEAD_DENSITY,U_BEND_INTENSITY,U_CLICK_INTENSITY;
float fl_digit(vec2 p,float seed){p=fract(p); float h=hash21(floor(p*5.0)+seed); return step(0.55,h);}
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 g=uv*vec2(U_COL_DENSITY,30.0); vec2 gi=floor(g); vec2 gf=fract(g);
  float cs=hash21(vec2(gi.x,11.0));
  float speed=0.6+cs*1.6;
  float yOff=u_time*speed*U_FALL_SPEED+cs*8.0;
  float row=gi.y+yOff;
  float cd=length(uv-m);
  row+=exp(-cd*3.0)*U_BEND_INTENSITY*sin(u_time*2.0+gi.x);
  float lit=hash21(vec2(gi.x,floor(row)));
  float head=smoothstep(0.95-U_HEAD_DENSITY*0.10,1.0,lit);
  float body=step(0.4,lit)*(0.30+0.50*fract(lit*13.0));
  float bright=max(head*1.3,body);
  float d=fl_digit(gf*2.0,floor(row)+gi.x);
  float v=d*bright;
  v*=smoothstep(-0.55,0.20,-uv.y);
  vec3 col=mix(vec3(0.0),U_BASE,smoothstep(0.2,0.8,v));
  col=mix(col,U_HOT,head);
  col+=exp(-cd*4.5)*U_BASE*0.7;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<2.5){vec2 cp=toAR(ck.xy); float rr=dt*0.65; float ring=exp(-pow((length(uv-cp)-rr)*8.0,2.0))*exp(-dt*0.6); col+=ring*U_HOT*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.012;
  gl_FragColor=vec4(col,1.0);
}
`;

const CRT_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3;
uniform float U_FLOW_SPEED,U_BARREL,U_SCAN_INTENSITY,U_RGB_SHIFT,U_NOISE,U_ROLL_SPEED;
vec3 fl_sceneCRT(vec2 p,vec3 a,vec3 b,vec3 c){
  float f1=fbm(p*1.8+u_time*U_FLOW_SPEED);
  float f2=fbm(p*2.6-u_time*(U_FLOW_SPEED*0.8));
  vec3 col=mix(a,b,smoothstep(0.35,0.70,f1));
  col=mix(col,c,smoothstep(0.55,0.85,f2)*0.6);
  return col;
}
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 cc=uv; float d2=dot(cc,cc);
  vec2 bent=cc*(1.0+d2*U_BARREL);
  bent+=(m-bent)*0.03*exp(-length(bent-m)*2.0);
  vec3 col;
  col.r=fl_sceneCRT(bent+vec2( U_RGB_SHIFT*0.01,0.0),U_C1,U_C2,U_C3).r;
  col.g=fl_sceneCRT(bent,U_C1,U_C2,U_C3).g;
  col.b=fl_sceneCRT(bent+vec2(-U_RGB_SHIFT*0.01,0.0),U_C1,U_C2,U_C3).b;
  float scan=0.5+0.5*sin(gl_FragCoord.y*2.4);
  col*=mix(1.0-U_SCAN_INTENSITY,1.0,scan);
  float gx=0.5+0.5*sin(gl_FragCoord.x*9.0); col*=mix(0.92,1.0,gx);
  col*=1.0-smoothstep(0.6,1.4,length(uv)*1.05);
  col+=(hash21(gl_FragCoord.xy+u_time*40.0)-0.5)*U_NOISE;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<0.6){float flash=exp(-dt*8.0); col+=flash*0.6;}}}
  float roll=fract(u_time*U_ROLL_SPEED);
  col+=smoothstep(0.02,0.0,abs(fract(uv.y*0.4-roll)-0.5))*0.05;
  gl_FragColor=vec4(col,1.0);
}
`;

const VORTEX_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_C4,U_CENTER_GLOW;
uniform float U_SPIN_SPEED,U_LOG_K,U_WARP_PULL,U_BANDS,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 center=m*U_WARP_PULL;
  vec2 p=uv-center;
  float r=length(p); float a=atan(p.y,p.x);
  float bands=sin(a*U_BANDS+U_LOG_K*log(r+0.05)-u_time*U_SPIN_SPEED);
  float n=fbm(vec2(a*1.2,r*4.0)+u_time*0.15);
  float t=0.5+0.5*bands*(0.7+0.3*n);
  vec3 col=mix(U_C1,U_C2,smoothstep(0.20,0.55,t));
  col=mix(col,U_C3,smoothstep(0.55,0.80,t));
  col=mix(col,U_C4,smoothstep(0.80,0.95,t)*0.7);
  col*=1.0-smoothstep(0.0,1.2,r)*0.35;
  col+=exp(-r*8.0)*U_CENTER_GLOW*0.7;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy)-center; float rr=dt*0.65; float ring=exp(-pow((length(p-cp)-rr)*8.0,2.0))*exp(-dt*0.8); col+=ring*U_CENTER_GLOW*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const CIRCUIT_TUNABLE = `
uniform vec3 U_BASE,U_TRACE,U_HOT;
uniform float U_GRID,U_PULSE_SPEED,U_PAD_DENSITY,U_CURSOR_INFLU,U_CLICK_INTENSITY;
float fl_trace(vec2 p,float seed,float gridSize){
  vec2 g=p*gridSize; vec2 gi=floor(g); vec2 gf=fract(g);
  float h=hash21(gi+seed); float w=0.06;
  return h<0.5
    ? smoothstep(w,w*0.4,abs(gf.y-0.5))
    : smoothstep(w,w*0.4,abs(gf.x-0.5));
}
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  float t1=fl_trace(uv,0.0,U_GRID);
  float t2=fl_trace(uv*1.3+vec2(0.7,0.2),1.0,U_GRID)*0.7;
  float lines=max(t1,t2);
  vec2 g=uv*U_GRID; vec2 gi=floor(g); vec2 gf=fract(g);
  float pad=step(1.0-U_PAD_DENSITY*0.20,hash21(gi))*smoothstep(0.18,0.10,length(gf-0.5));
  float pulse=0.5+0.5*sin(u_time*U_PULSE_SPEED+uv.x*6.0+uv.y*3.0);
  pulse=pow(pulse,6.0);
  vec3 col=U_BASE;
  col+=lines*mix(U_TRACE,U_HOT,pulse)*0.85;
  col+=pad*U_HOT;
  float cd=length(uv-m);
  col+=exp(-cd*5.0)*U_HOT*U_CURSOR_INFLU*lines;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.5; float ring=exp(-pow((length(uv-cp)-rr)*9.0,2.0))*exp(-dt*1.0); col+=ring*U_HOT*U_CLICK_INTENSITY*lines;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.012;
  gl_FragColor=vec4(col,1.0);
}
`;

const OCEAN_TUNABLE = `
uniform vec3 U_DEEP,U_MID,U_CREST,U_SUN;
uniform float U_FLOW_SPEED,U_WAVE_AMP,U_SUN_INTENSITY,U_CURSOR_WAKE,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 p=vec2(uv.x,uv.y*1.6); float depthMix=smoothstep(-0.5,0.5,uv.y);
  float wave=0.0; float amp=0.55*U_WAVE_AMP; vec2 q=p*2.0;
  for(int i=0;i<4;i++){
    wave+=amp*sin(q.x*1.3+q.y*0.7+u_time*(U_FLOW_SPEED+float(i)*0.3));
    wave+=amp*0.7*fbm(q+u_time*U_FLOW_SPEED*0.6);
    q*=1.8; amp*=0.55;
  }
  float h=wave*0.5;
  float caustic=pow(0.5+0.5*sin(p.x*6.0+h*4.0+u_time*2.0),8.0);
  vec3 col=mix(U_DEEP,U_MID,smoothstep(-0.6,0.4,h));
  col=mix(col,U_CREST,smoothstep(0.30,0.55,h));
  col+=caustic*vec3(0.4,0.7,0.85)*0.5*(1.0-depthMix);
  float sun=exp(-length(uv-vec2(m.x*0.5,0.55))*4.0);
  col+=sun*U_SUN*U_SUN_INTENSITY;
  float ck=length(uv-m);
  col+=exp(-ck*6.0)*vec3(0.55,0.85,1.0)*U_CURSOR_WAKE;
  for(int i=0;i<8;i++){vec4 cl=u_clicks[i]; if(cl.w>0.5){float dt=u_time-cl.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(cl.xy); float rr=dt*0.45; float ring=exp(-pow((length(uv-cp)-rr)*10.0,2.0))*exp(-dt*0.85); col+=ring*U_CREST*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.012;
  gl_FragColor=vec4(col,1.0);
}
`;

const LIGHTNING_TUNABLE = `
uniform vec3 U_BG,U_GLOW,U_CORE,U_FLASH;
uniform float U_STRIKE_RATE,U_FOLLOW_RATE,U_BRANCH_AMOUNT,U_INTENSITY,U_CLICK_INTENSITY;
float lt_sdSeg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a; float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.0,1.0); return length(pa-ba*h);}
float lt_bolt(vec2 p,vec2 target,float seed,float branchAmount){
  float d=1e6; vec2 prev=vec2(target.x*0.4,1.05);
  const int SEGS=10;
  for(int i=1;i<=SEGS;i++){
    float tt=float(i)/float(SEGS);
    vec2 cur=mix(vec2(target.x*0.4,1.05),target,tt);
    float jit=(hash21(vec2(float(i),seed))-0.5)*0.55*(1.0-tt*0.6);
    cur.x+=jit;
    d=min(d,lt_sdSeg(p,prev,cur));
    if(hash21(vec2(float(i)+17.0,seed))>1.0-branchAmount){
      vec2 be=cur+vec2((hash21(vec2(float(i)+31.0,seed))-0.5)*0.35,-hash21(vec2(float(i)+47.0,seed))*0.25);
      d=min(d,lt_sdSeg(p,cur,be)*1.5);
    }
    prev=cur;
  }
  return d;
}
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  float t=u_time*U_STRIKE_RATE; float ti=floor(t); float life=fract(t);
  float seed=ti*13.7;
  vec2 target=m+vec2((hash21(vec2(seed,11.0))-0.5)*0.4,(hash21(vec2(seed,22.0))-0.5)*0.4);
  float boltAmp=exp(-life*8.0)*U_INTENSITY;
  float d=lt_bolt(uv,target,seed,U_BRANCH_AMOUNT);
  vec3 col=mix(U_BG,U_FLASH,boltAmp*0.8);
  col+=exp(-d*6.0)*U_GLOW*boltAmp*0.25;
  col+=exp(-d*24.0)*U_GLOW*boltAmp*0.8;
  col+=exp(-d*220.0)*U_CORE*boltAmp;
  float d2=lt_bolt(uv,m,ti*7.1+5.0,U_BRANCH_AMOUNT*0.5);
  col+=exp(-d2*60.0)*U_FOLLOW_RATE*U_GLOW;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<0.6){vec2 cp=toAR(ck.xy); float bd=lt_bolt(uv,cp,ck.z*3.0,U_BRANCH_AMOUNT); float la=exp(-dt*5.0); col+=exp(-bd*200.0)*la*U_CORE*U_CLICK_INTENSITY; col+=exp(-bd*20.0)*la*U_GLOW*U_CLICK_INTENSITY*0.6;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const PLASMAGLOBE_TUNABLE = `
uniform vec3 U_BG,U_ARC_LOW,U_ARC_HIGH,U_ORB;
uniform float U_ARC_COUNT,U_FLICKER_SPEED,U_WARP_PULL,U_INTENSITY,U_CLICK_INTENSITY;
float pgt_sdSeg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a; float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.0,1.0); return length(pa-ba*h);}
float pgt_arc(vec2 p,vec2 target,float seed){
  float d=1e6; vec2 prev=vec2(0.0); const int N=7;
  for(int i=1;i<=N;i++){
    float tt=float(i)/float(N);
    vec2 mid=mix(vec2(0.0),target,tt);
    vec2 perp=vec2(-(target.y),target.x);
    float jit=(hash21(vec2(float(i),seed+u_time))-0.5)*0.18*sin(tt*3.14);
    mid+=perp*jit;
    d=min(d,pgt_sdSeg(p,prev,mid)); prev=mid;
  }
  return d;
}
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 orbPos=m*U_WARP_PULL; vec2 p=uv-orbPos; float r=length(p);
  vec3 col=U_BG;
  col+=exp(-r*3.5)*U_ARC_LOW*0.6;
  col+=exp(-r*22.0)*U_ORB;
  int arcs=int(U_ARC_COUNT);
  for(int i=0;i<12;i++){
    if(i>=arcs) break;
    float fi=float(i);
    float a=fi/U_ARC_COUNT*6.283+u_time*0.35;
    a+=sin(u_time*U_FLICKER_SPEED+fi)*0.18;
    vec2 tip=vec2(cos(a),sin(a))*(0.8+0.15*sin(u_time*2.0+fi*1.7));
    float life=0.5+0.5*sin(u_time*3.0+fi*2.1);
    float d=pgt_arc(p,tip,fi*11.0+floor(u_time*4.0));
    col+=exp(-d*90.0)*mix(U_ARC_LOW,U_ARC_HIGH,life)*U_INTENSITY;
    col+=exp(-d*14.0)*0.20*U_ARC_LOW;
  }
  vec2 cursorRel=m-orbPos;
  float dc=pgt_arc(p,cursorRel,99.0);
  col+=exp(-dc*180.0)*U_ORB;
  col+=exp(-dc*30.0)*U_ARC_HIGH*0.5;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<0.8){vec2 cp=toAR(ck.xy)-orbPos; float d=pgt_arc(p,cp,ck.z*17.0); float la=exp(-dt*4.0); col+=exp(-d*200.0)*la*U_ORB*U_CLICK_INTENSITY; col+=exp(-d*22.0)*la*U_ARC_HIGH*U_CLICK_INTENSITY*0.6;}}}
  col*=1.0-smoothstep(0.8,1.4,length(uv))*0.4;
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const CAUSTICS_TUNABLE = `
uniform vec3 U_DEEP,U_MID,U_HOT,U_SHAFT;
uniform float U_FLOW_SPEED,U_SCALE,U_WARP_PULL,U_SHAFT_INTENSITY,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 toM=m-uv; vec2 p=uv+toM*exp(-length(toM)*1.8)*U_WARP_PULL;
  float t=u_time*U_FLOW_SPEED;
  vec2 q1=vec2(fbm(p*U_SCALE+t),fbm(p*U_SCALE+vec2(5.2,1.3)-t));
  vec2 q2=vec2(fbm(p*U_SCALE*1.5+1.5*q1+t*0.7),fbm(p*U_SCALE*1.5+1.5*q1+vec2(8.3,2.8)-t*0.7));
  float n=fbm(p*U_SCALE*2.0+2.0*q2);
  float caustic=1.0-smoothstep(0.42,0.62,n);
  caustic=pow(caustic,4.0);
  float depth=smoothstep(-1.0,1.0,uv.y);
  vec3 col=mix(U_DEEP,U_MID,depth);
  col+=caustic*U_HOT*1.10;
  float n2=fbm(p*U_SCALE*3.3+1.5*q2-t);
  float c2=1.0-smoothstep(0.46,0.55,n2);
  col+=pow(c2,3.0)*U_MID*0.40;
  float shaft=exp(-pow(uv.x-m.x*0.4,2.0)*4.0)*smoothstep(-0.5,0.8,uv.y);
  col+=shaft*U_SHAFT*U_SHAFT_INTENSITY;
  col+=exp(-length(uv-m)*5.0)*U_HOT*0.30;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.5){vec2 cp=toAR(ck.xy); float rr=dt*0.5; float ring=exp(-pow((length(uv-cp)-rr)*10.0,2.0))*exp(-dt*0.7); col+=ring*U_HOT*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const TESLA_TUNABLE = `
uniform vec3 U_BG,U_GLOW,U_CORE;
uniform float U_ARC_COUNT,U_REACH,U_VIOLENCE,U_INTENSITY,U_CLICK_INTENSITY;
float ts2_sdSeg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a; float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.0,1.0); return length(pa-ba*h);}
float ts2_bolt(vec2 p,vec2 s,vec2 e,float seed,float vio){
  float d=1e6; vec2 prev=s; const int N=8;
  for(int i=1;i<=N;i++){
    float tt=float(i)/float(N); vec2 base=mix(s,e,tt);
    vec2 dir=normalize(e-s+1e-4); vec2 perp=vec2(-dir.y,dir.x);
    float amp=0.20*sin(tt*3.14)*vio;
    float jit=(hash21(vec2(float(i),seed))-0.5)*amp;
    base+=perp*jit;
    d=min(d,ts2_sdSeg(p,prev,base)); prev=base;
  }
  return d;
}
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 coil=vec2(0.0,-0.55); vec2 p=uv;
  vec3 col=U_BG;
  float cr=length(p-coil);
  col+=exp(-cr*4.0)*U_GLOW*0.55;
  col+=exp(-cr*30.0)*U_CORE;
  int arcs=int(U_ARC_COUNT);
  for(int i=0;i<8;i++){
    if(i>=arcs) break;
    float fi=float(i);
    float strikeT=u_time*0.7+fi*1.31;
    float si=floor(strikeT); float life=fract(strikeT);
    float amp=exp(-life*5.0)*U_INTENSITY;
    float seed=si*11.0+fi*3.7;
    vec2 target;
    if(i==0){ target=m; }
    else {
      float ang=hash21(vec2(seed,1.0))*6.283;
      float rad=U_REACH*(0.7+hash21(vec2(seed,2.0))*0.7);
      target=coil+vec2(cos(ang),sin(ang))*rad;
    }
    float d=ts2_bolt(p,coil,target,seed,U_VIOLENCE);
    col+=exp(-d*240.0)*amp*U_CORE;
    col+=exp(-d*28.0)*amp*U_GLOW*0.7;
    col+=exp(-d*6.0)*amp*U_GLOW*0.25;
  }
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<0.7){vec2 cp=toAR(ck.xy); float d=ts2_bolt(p,coil,cp,ck.z*19.0,U_VIOLENCE); float la=exp(-dt*4.0); col+=exp(-d*280.0)*la*U_CORE*U_CLICK_INTENSITY; col+=exp(-d*36.0)*la*U_GLOW*U_CLICK_INTENSITY*0.8;}}}
  col*=1.0-smoothstep(0.8,1.5,length(uv))*0.5;
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

const QUANTUM_TUNABLE = `
uniform vec3 U_BG,U_C1,U_C2,U_HOT;
uniform float U_WAVE_FREQ,U_WAVE_SPEED,U_PARTICLE_DENSITY,U_ENT_INTENSITY,U_CLICK_INTENSITY;
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 src1=m; vec2 src2=vec2(sin(u_time*0.4)*0.6,cos(u_time*0.35)*0.5);
  float d1=length(uv-src1); float d2=length(uv-src2);
  float w1=sin(d1*U_WAVE_FREQ-u_time*U_WAVE_SPEED);
  float w2=sin(d2*U_WAVE_FREQ-u_time*U_WAVE_SPEED*0.8);
  float interf=(w1+w2)*0.5;
  float amp=0.5+0.5*interf;
  vec3 col=U_BG;
  col=mix(col,U_C1,smoothstep(0.20,0.55,amp));
  col=mix(col,U_C2,smoothstep(0.65,0.90,amp)*0.7);
  vec2 g=uv*U_PARTICLE_DENSITY; vec2 gi=floor(g); vec2 gf=fract(g);
  float pd=length(gf-vec2(0.5));
  float prob=0.5+0.5*sin(hash21(gi)*6.283+u_time*(1.0+hash21(gi+7.0)*2.0));
  prob=pow(prob,6.0);
  float particle=exp(-pd*18.0)*prob*amp*1.4;
  col+=particle*U_HOT;
  vec2 ab=src2-src1; vec2 ap=uv-src1;
  float along=clamp(dot(ap,ab)/max(dot(ab,ab),1e-6),0.0,1.0);
  vec2 abN=normalize(ab+1e-4);
  float perp=abs(dot(ap-ab*along,vec2(-abN.y,abN.x)));
  float ent=exp(-perp*80.0)*(0.7+0.3*sin(along*30.0-u_time*4.0));
  col+=ent*U_C2*U_ENT_INTENSITY;
  col+=exp(-d1*6.0)*U_C1*0.35;
  col+=exp(-d2*6.0)*U_C2*0.30;
  for(int i=0;i<8;i++){vec4 ck=u_clicks[i]; if(ck.w>0.5){float dt=u_time-ck.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(ck.xy); float rr=dt*0.6; float ring=exp(-pow((length(uv-cp)-rr)*11.0,2.0))*exp(-dt*0.8); col+=ring*U_HOT*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.012;
  gl_FragColor=vec4(col,1.0);
}
`;

const CURLFIELD_TUNABLE = `
uniform vec3 U_C1,U_C2,U_C3,U_C4;
uniform float U_FIELD_SCALE,U_FLOW_SPEED,U_STREAK_STEPS,U_CURSOR_PULL,U_CLICK_INTENSITY;
vec2 fl_curl(vec2 p){float e=0.05;
  float n1=fbm(vec2(p.x,p.y+e)); float n2=fbm(vec2(p.x,p.y-e));
  float n3=fbm(vec2(p.x+e,p.y)); float n4=fbm(vec2(p.x-e,p.y));
  return vec2(n1-n2,n4-n3)/(2.0*e);
}
void main(){
  vec2 uv=toAR(gl_FragCoord.xy); vec2 m=toAR(u_mouseSmooth);
  vec2 v=fl_curl(uv*U_FIELD_SCALE+u_time*U_FLOW_SPEED);
  vec2 dir=normalize(v+1e-4);
  float streak=0.0; vec2 p=uv;
  for(int i=0;i<14;i++){
    p-=dir*0.018;
    streak+=fbm(p*5.0+u_time*U_FLOW_SPEED*2.0)*0.10*(U_STREAK_STEPS/14.0);
  }
  vec3 col=U_C1;
  col=mix(col,U_C2,smoothstep(0.30,0.55,streak));
  col=mix(col,U_C3,smoothstep(0.55,0.75,streak)*0.8);
  col=mix(col,U_C4,smoothstep(0.75,0.90,streak)*0.4);
  float md=length(uv-m);
  col+=exp(-md*5.5)*U_C4*U_CURSOR_PULL;
  for(int i=0;i<8;i++){vec4 cl=u_clicks[i]; if(cl.w>0.5){float dt=u_time-cl.z; if(dt>0.0&&dt<3.0){vec2 cp=toAR(cl.xy); float rr=dt*0.50; float ring=exp(-pow((length(uv-cp)-rr)*8.0,2.0))*exp(-dt*0.85); col+=ring*U_C4*U_CLICK_INTENSITY;}}}
  col+=(hash21(gl_FragCoord.xy+u_time)-0.5)*0.010;
  gl_FragColor=vec4(col,1.0);
}
`;

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMAS — for each shader id, defines defaults + uniform map + UI sections.
// ═══════════════════════════════════════════════════════════════════════════

// Helper to keep schemas short: a common "simple" schema generator.
function S_simple(frag, defaults, uniforms, sections, presets) {
  return { frag, defaults, uniforms, sections, presets: presets || {} };
}

const SCHEMAS = {
  // ── PARCHMENT (full schema) ─────────────────────────────────────────────
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
        { type:'color',  key:'cInk',   label:'Ink' }, { type:'color',  key:'cSepia', label:'Sepia' },
        { type:'color',  key:'cPaper', label:'Paper' }, { type:'color',  key:'cCream', label:'Cream' },
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
        { type:'slider', key:'fiberX', label:'Fiber X', min:1, max:60, step:0.5 },
        { type:'slider', key:'fiberY', label:'Fiber Y', min:1, max:60, step:0.5 },
        { type:'slider', key:'grain',  label:'Grain',   min:0, max:0.05, step:0.001 },
      ]},
      { title: 'Cursor halo', controls: [
        { type:'color',  key:'cursorTint',   label:'Tint' },
        { type:'slider', key:'cursorGlow',   label:'Glow',   min:0, max:2, step:0.02 },
        { type:'slider', key:'cursorRadius', label:'Radius (inv)', min:0.5, max:10, step:0.1 },
        { type:'slider', key:'cursorCore',   label:'Core',   min:0, max:1, step:0.02 },
      ]},
      { title: 'Ink (click)', controls: [
        { type:'color',  key:'inkColor', label:'Color' },
        { type:'slider', key:'inkR0', label:'Start radius', min:0, max:0.3, step:0.005 },
        { type:'slider', key:'inkR1', label:'End radius',   min:0.02, max:0.6, step:0.005 },
        { type:'slider', key:'inkDuration', label:'Duration', min:0.5, max:10, step:0.1 },
        { type:'slider', key:'inkIrregularity', label:'Irregularity', min:0, max:1, step:0.02 },
        { type:'slider', key:'inkOpacity', label:'Opacity', min:0, max:1, step:0.02 },
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

  // ── AURORA ──────────────────────────────────────────────────────────────
  aurora: S_simple(AURORA_TUNABLE,
    { c1:'#040712', c2:'#008c9e', c3:'#a61dc8', c4:'#fae08c',
      flowSpeed:0.08, warpPull:0.55, cursorHalo:0.35, bandShift:0.28,
      haloTint:'#7a4dcc', coreTint:'#fff2e6', clickIntensity:1.4 },
    { U_C1:['color','c1'], U_C2:['color','c2'], U_C3:['color','c3'], U_C4:['color','c4'],
      U_FLOW_SPEED:['float','flowSpeed'], U_WARP_PULL:['float','warpPull'],
      U_CURSOR_HALO:['float','cursorHalo'], U_BAND_SHIFT:['float','bandShift'],
      U_HALO_TINT:['color','haloTint'], U_CORE_TINT:['color','coreTint'],
      U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[
        {type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Teal'},
        {type:'color',key:'c3',label:'Magenta'},{type:'color',key:'c4',label:'Gold'}]},
      { title:'Motion', controls:[
        {type:'slider',key:'flowSpeed',label:'Flow speed',min:0,max:0.4,step:0.005},
        {type:'slider',key:'warpPull',label:'Warp pull',min:0,max:1.5,step:0.02},
        {type:'slider',key:'bandShift',label:'Band shift',min:0,max:1.2,step:0.02}]},
      { title:'Cursor halo', controls:[
        {type:'color',key:'haloTint',label:'Halo tint'},{type:'color',key:'coreTint',label:'Core tint'},
        {type:'slider',key:'cursorHalo',label:'Intensity',min:0,max:1.5,step:0.02}]},
      { title:'Click', controls:[
        {type:'slider',key:'clickIntensity',label:'Pulse intensity',min:0,max:3,step:0.05}]},
    ],
    {
      'Classic':    {c1:'#040712',c2:'#008c9e',c3:'#a61dc8',c4:'#fae08c'},
      'Cold North': {c1:'#030814',c2:'#0fe3c2',c3:'#3b6dff',c4:'#bdf2ff'},
      'Ember':      {c1:'#0a0204',c2:'#a13212',c3:'#e89b3a',c4:'#ffe9a8'},
      'Acid bloom': {c1:'#040414',c2:'#1fff8a',c3:'#ff2bd6',c4:'#f0ff95'},
      'Bruise':     {c1:'#06030f',c2:'#3a1582',c3:'#c1265d',c4:'#ffd49b'},
    }),

  // ── NEBULA ──────────────────────────────────────────────────────────────
  nebula: S_simple(NEBULA_TUNABLE,
    { c1:'#050314', c2:'#8c1a9e', c3:'#f2664c', c4:'#2da6ff',
      cloudSpeed:0.04, warpPull:0.45, starDensity:1.0, starTwinkle:1.0,
      cursorWarmth:0.30, cursorTint:'#8c66bf', clickBloom:1.0, bloomTint:'#b366f2' },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],U_C4:['color','c4'],
      U_CLOUD_SPEED:['float','cloudSpeed'],U_WARP_PULL:['float','warpPull'],
      U_STAR_DENSITY:['float','starDensity'],U_STAR_TWINKLE:['float','starTwinkle'],
      U_CURSOR_WARMTH:['float','cursorWarmth'],U_CURSOR_TINT:['color','cursorTint'],
      U_CLICK_BLOOM:['float','clickBloom'],U_BLOOM_TINT:['color','bloomTint'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Void'},{type:'color',key:'c2',label:'Mid'},{type:'color',key:'c3',label:'Warm'},{type:'color',key:'c4',label:'Cool'}]},
      { title:'Clouds', controls:[{type:'slider',key:'cloudSpeed',label:'Speed',min:0,max:0.2,step:0.002},{type:'slider',key:'warpPull',label:'Warp pull',min:0,max:1.5,step:0.02}]},
      { title:'Stars', controls:[{type:'slider',key:'starDensity',label:'Density',min:0,max:3,step:0.05},{type:'slider',key:'starTwinkle',label:'Twinkle',min:0,max:1,step:0.02}]},
      { title:'Cursor', controls:[{type:'color',key:'cursorTint',label:'Tint'},{type:'slider',key:'cursorWarmth',label:'Warmth',min:0,max:1.5,step:0.02}]},
      { title:'Click bloom', controls:[{type:'color',key:'bloomTint',label:'Tint'},{type:'slider',key:'clickBloom',label:'Intensity',min:0,max:3,step:0.05}]},
    ],
    {
      'Classic':    {c1:'#050314',c2:'#8c1a9e',c3:'#f2664c',c4:'#2da6ff'},
      'Deep field': {c1:'#01020a',c2:'#1a2a82',c3:'#5a85d9',c4:'#a8c5ff'},
      'Carina':     {c1:'#0a0414',c2:'#6a1c8c',c3:'#ff8a3a',c4:'#7af0ff'},
      'Helix':      {c1:'#04020a',c2:'#0d5e7a',c3:'#26c2c2',c4:'#e8f5ff'},
    }),

  // ── MERCURY ─────────────────────────────────────────────────────────────
  mercury: S_simple(MERCURY_TUNABLE,
    { c1:'#0a0d1a', c2:'#5e6f9c', c3:'#c8d4ff', highlight:'#ffffff',
      flowSpeed:0.10, warpPull:0.55, metalness:0.55, clickIntensity:1.2 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],U_HIGHLIGHT:['color','highlight'],
      U_FLOW_SPEED:['float','flowSpeed'],U_WARP_PULL:['float','warpPull'],
      U_METALNESS:['float','metalness'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Shadow'},{type:'color',key:'c2',label:'Mid'},{type:'color',key:'c3',label:'Light'},{type:'color',key:'highlight',label:'Specular'}]},
      { title:'Motion', controls:[{type:'slider',key:'flowSpeed',label:'Flow',min:0,max:0.5,step:0.005},{type:'slider',key:'warpPull',label:'Warp',min:0,max:2,step:0.02}]},
      { title:'Material', controls:[{type:'slider',key:'metalness',label:'Metalness',min:0,max:2,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ],
    {
      'Steel':  {c1:'#0a0d1a',c2:'#5e6f9c',c3:'#c8d4ff',highlight:'#ffffff'},
      'Copper': {c1:'#1a0a04',c2:'#8a4a20',c3:'#e8a050',highlight:'#fff0d8'},
      'Gold':   {c1:'#1a1004',c2:'#8a6e20',c3:'#f0d040',highlight:'#fff8d0'},
      'Onyx':   {c1:'#000000',c2:'#202020',c3:'#a0a0a0',highlight:'#ffffff'},
    }),

  // ── LATTICE ─────────────────────────────────────────────────────────────
  lattice: S_simple(LATTICE_TUNABLE,
    { c1:'#3473e8', c2:'#d83e75', c3:'#f08d3d', c4:'#34c79f',
      scale:6.0, flowSpeed:0.6, warpPull:0.45, edgeW:0.10, clickIntensity:1.3 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],U_C4:['color','c4'],
      U_SCALE:['float','scale'],U_FLOW_SPEED:['float','flowSpeed'],
      U_WARP_PULL:['float','warpPull'],U_EDGE_W:['float','edgeW'],
      U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Color 1'},{type:'color',key:'c2',label:'Color 2'},{type:'color',key:'c3',label:'Color 3'},{type:'color',key:'c4',label:'Edge'}]},
      { title:'Cells', controls:[{type:'slider',key:'scale',label:'Density',min:2,max:14,step:0.2},{type:'slider',key:'edgeW',label:'Edge width',min:0,max:0.3,step:0.005}]},
      { title:'Motion', controls:[{type:'slider',key:'flowSpeed',label:'Cell speed',min:0,max:3,step:0.05},{type:'slider',key:'warpPull',label:'Warp pull',min:0,max:1.5,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── PLASMA ──────────────────────────────────────────────────────────────
  plasma: S_simple(PLASMA_TUNABLE,
    { c1:'#0a0420', c2:'#5b30b6', c3:'#d54ea8', c4:'#ffd07a', hot:'#fff2c8',
      flowSpeed:0.25, warpPull:0.40, heat:0.85, clickIntensity:1.3 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],U_C4:['color','c4'],U_HOT:['color','hot'],
      U_FLOW_SPEED:['float','flowSpeed'],U_WARP_PULL:['float','warpPull'],
      U_HEAT:['float','heat'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Purple'},{type:'color',key:'c3',label:'Pink'},{type:'color',key:'c4',label:'Gold'},{type:'color',key:'hot',label:'Hot'}]},
      { title:'Motion', controls:[{type:'slider',key:'flowSpeed',label:'Speed',min:0,max:1,step:0.01},{type:'slider',key:'warpPull',label:'Warp',min:0,max:1.5,step:0.02}]},
      { title:'Heat', controls:[{type:'slider',key:'heat',label:'Cursor heat',min:0,max:2,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── PRISM ───────────────────────────────────────────────────────────────
  prism: S_simple(PRISM_TUNABLE,
    { c1:'#0c1730', c2:'#5b1a8a', c3:'#2d6fd6',
      flowSpeed:0.10, warpPull:0.40, dispersion:1.0, clickIntensity:1.2 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],
      U_FLOW_SPEED:['float','flowSpeed'],U_WARP_PULL:['float','warpPull'],
      U_DISPERSION:['float','dispersion'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Red ch'},{type:'color',key:'c2',label:'Green ch'},{type:'color',key:'c3',label:'Blue ch'}]},
      { title:'Optics', controls:[{type:'slider',key:'dispersion',label:'Dispersion',min:0,max:3,step:0.05}]},
      { title:'Motion', controls:[{type:'slider',key:'flowSpeed',label:'Speed',min:0,max:0.5,step:0.005},{type:'slider',key:'warpPull',label:'Warp',min:0,max:1.5,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── GALAXY ──────────────────────────────────────────────────────────────
  galaxy: S_simple(GALAXY_TUNABLE,
    { c1:'#02030c', c2:'#4936c8', c3:'#ee5fa8', coreCol:'#ffdca6', starCol:'#ffffff',
      spinSpeed:0.15, warpPull:0.30, armTight:0.55, coreGlow:0.75, starDensity:1.0, clickIntensity:1.2 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],
      U_CORE_COL:['color','coreCol'],U_STAR_COL:['color','starCol'],
      U_SPIN_SPEED:['float','spinSpeed'],U_WARP_PULL:['float','warpPull'],
      U_ARM_TIGHT:['float','armTight'],U_CORE_GLOW:['float','coreGlow'],
      U_STAR_DENSITY:['float','starDensity'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Void'},{type:'color',key:'c2',label:'Arm 1'},{type:'color',key:'c3',label:'Arm 2'},{type:'color',key:'coreCol',label:'Core'},{type:'color',key:'starCol',label:'Stars'}]},
      { title:'Structure', controls:[{type:'slider',key:'armTight',label:'Arm tightness',min:0,max:1.5,step:0.02},{type:'slider',key:'coreGlow',label:'Core glow',min:0,max:2,step:0.02},{type:'slider',key:'starDensity',label:'Stars',min:0,max:3,step:0.05}]},
      { title:'Motion', controls:[{type:'slider',key:'spinSpeed',label:'Spin',min:-1,max:1,step:0.02},{type:'slider',key:'warpPull',label:'Warp',min:0,max:1,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── SINGULARITY ─────────────────────────────────────────────────────────
  singularity: S_simple(SINGULARITY_TUNABLE,
    { c1:'#0a0612', c2:'#c34a18', c3:'#1a0a20', diskHot:'#ffb04a',
      mass:1.0, diskThick:0.12, diskSpeed:1.5, clickIntensity:1.4 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],U_DISK_HOT:['color','diskHot'],
      U_MASS:['float','mass'],U_DISK_THICK:['float','diskThick'],
      U_DISK_SPEED:['float','diskSpeed'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Space'},{type:'color',key:'c2',label:'Disk'},{type:'color',key:'c3',label:'Bend'},{type:'color',key:'diskHot',label:'Hot'}]},
      { title:'Black hole', controls:[{type:'slider',key:'mass',label:'Mass',min:0.3,max:2.5,step:0.05},{type:'slider',key:'diskThick',label:'Disk thickness',min:0.02,max:0.4,step:0.005}]},
      { title:'Motion', controls:[{type:'slider',key:'diskSpeed',label:'Disk spin',min:0,max:5,step:0.05}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── WORMHOLE ────────────────────────────────────────────────────────────
  wormhole: S_simple(WORMHOLE_TUNABLE,
    { c1:'#060620', c2:'#1fb4ff', c3:'#c84cf7', rim:'#ffd9a1',
      pullSpeed:0.6, twist:6.0, warpPull:0.35, clickIntensity:1.3 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],U_RIM:['color','rim'],
      U_PULL_SPEED:['float','pullSpeed'],U_TWIST:['float','twist'],
      U_WARP_PULL:['float','warpPull'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Far'},{type:'color',key:'c2',label:'Wall 1'},{type:'color',key:'c3',label:'Wall 2'},{type:'color',key:'rim',label:'Rim'}]},
      { title:'Tunnel', controls:[{type:'slider',key:'twist',label:'Twist',min:1,max:14,step:0.2},{type:'slider',key:'pullSpeed',label:'Pull speed',min:0,max:3,step:0.05},{type:'slider',key:'warpPull',label:'Cursor pull',min:0,max:1,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── HYPERSPACE ──────────────────────────────────────────────────────────
  hyperspace: S_simple(HYPERSPACE_TUNABLE,
    { c1:'#02041a', c2:'#2c3aa8', streak:'#ffffff',
      speed:1.0, density:8.0, warpPull:0.30, clickIntensity:1.5 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_STREAK:['color','streak'],
      U_SPEED:['float','speed'],U_DENSITY:['float','density'],
      U_WARP_PULL:['float','warpPull'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Mid'},{type:'color',key:'streak',label:'Streak'}]},
      { title:'Speed', controls:[{type:'slider',key:'speed',label:'Warp speed',min:0,max:4,step:0.05},{type:'slider',key:'density',label:'Streak density',min:2,max:20,step:0.5},{type:'slider',key:'warpPull',label:'Cursor pull',min:0,max:1,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── MANIFOLD ────────────────────────────────────────────────────────────
  manifold: S_simple(MANIFOLD_TUNABLE,
    { c1:'#060b1c', c2:'#1d3a7a', c3:'#8b2bb4', glyphCol:'#f0c977',
      flowSpeed:0.08, warpPull:0.50, glyphDensity:14.0, clickIntensity:1.2 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],U_GLYPH_COL:['color','glyphCol'],
      U_FLOW_SPEED:['float','flowSpeed'],U_WARP_PULL:['float','warpPull'],
      U_GLYPH_DENSITY:['float','glyphDensity'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Mid'},{type:'color',key:'c3',label:'Bright'},{type:'color',key:'glyphCol',label:'Glyphs'}]},
      { title:'Motion', controls:[{type:'slider',key:'flowSpeed',label:'Flow',min:0,max:0.3,step:0.005},{type:'slider',key:'warpPull',label:'Warp',min:0,max:1.5,step:0.02}]},
      { title:'Glyphs', controls:[{type:'slider',key:'glyphDensity',label:'Density',min:4,max:30,step:0.5}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── LAGRANGIAN ──────────────────────────────────────────────────────────
  lagrangian: S_simple(LAGRANGIAN_TUNABLE,
    { c1:'#04061c', c2:'#163fa6', c3:'#f0e7c8', glyphCol:'#642aa6',
      flowSpeed:0.06, warpPull:0.45, lineSpeed:0.30, clickIntensity:1.2 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],U_GLYPH_COL:['color','glyphCol'],
      U_FLOW_SPEED:['float','flowSpeed'],U_WARP_PULL:['float','warpPull'],
      U_LINE_SPEED:['float','lineSpeed'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Mid'},{type:'color',key:'c3',label:'Bright'},{type:'color',key:'glyphCol',label:'Glyphs'}]},
      { title:'Writing', controls:[{type:'slider',key:'lineSpeed',label:'Line speed',min:0,max:2,step:0.02}]},
      { title:'Motion', controls:[{type:'slider',key:'flowSpeed',label:'Flow',min:0,max:0.3,step:0.005},{type:'slider',key:'warpPull',label:'Warp',min:0,max:1.5,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── RIEMANN ─────────────────────────────────────────────────────────────
  riemann: S_simple(RIEMANN_TUNABLE,
    { zoom:1.8, flowSpeed:0.5, sat:1.0, warpPull:0.30, halo:'#ffffff', clickIntensity:1.2 },
    { U_ZOOM:['float','zoom'],U_FLOW_SPEED:['float','flowSpeed'],U_SAT:['float','sat'],
      U_WARP_PULL:['float','warpPull'],U_HALO:['color','halo'],
      U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'View', controls:[{type:'slider',key:'zoom',label:'Zoom',min:0.4,max:4,step:0.05},{type:'slider',key:'sat',label:'Saturation',min:0,max:2,step:0.02}]},
      { title:'Motion', controls:[{type:'slider',key:'flowSpeed',label:'Zero orbit',min:0,max:2,step:0.02},{type:'slider',key:'warpPull',label:'Cursor pull',min:0,max:1,step:0.02}]},
      { title:'Effects', controls:[{type:'color',key:'halo',label:'Halo'},{type:'slider',key:'clickIntensity',label:'Click',min:0,max:3,step:0.05}]},
    ]),

  // ── CONSTELLATION ───────────────────────────────────────────────────────
  constellation: S_simple(CONSTELLATION_TUNABLE,
    { bg:'#02040d', starCol:'#a8d0ff', linkCol:'#ffffff',
      density:10.0, flowSpeed:0.4, gravity:0.30, clickIntensity:1.3 },
    { U_BG:['color','bg'],U_STAR_COL:['color','starCol'],U_LINK_COL:['color','linkCol'],
      U_DENSITY:['float','density'],U_FLOW_SPEED:['float','flowSpeed'],
      U_GRAVITY:['float','gravity'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'bg',label:'Space'},{type:'color',key:'starCol',label:'Stars'},{type:'color',key:'linkCol',label:'Links'}]},
      { title:'Field', controls:[{type:'slider',key:'density',label:'Density',min:4,max:20,step:0.5},{type:'slider',key:'flowSpeed',label:'Drift',min:0,max:2,step:0.05},{type:'slider',key:'gravity',label:'Cursor gravity',min:0,max:1.5,step:0.05}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── SILK ────────────────────────────────────────────────────────────────
  silk: S_simple(SILK_TUNABLE,
    { c1:'#050912', c2:'#2c364c', c3:'#768294',
      flowSpeed:0.06, warpPull:0.30, ribbonFreq:6.0, clickIntensity:0.8 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],
      U_FLOW_SPEED:['float','flowSpeed'],U_WARP_PULL:['float','warpPull'],
      U_RIBBON_FREQ:['float','ribbonFreq'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Mid'},{type:'color',key:'c3',label:'Bright'}]},
      { title:'Ribbons', controls:[{type:'slider',key:'ribbonFreq',label:'Frequency',min:1,max:15,step:0.2},{type:'slider',key:'flowSpeed',label:'Flow speed',min:0,max:0.3,step:0.005},{type:'slider',key:'warpPull',label:'Warp pull',min:0,max:1,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── VAPOR ───────────────────────────────────────────────────────────────
  vapor: S_simple(VAPOR_TUNABLE,
    { c1:'#05080f', c2:'#3a3946', c3:'#c8a99c', shaft:'#fff2e0',
      flowSpeed:0.05, warpPull:0.25, shaftIntensity:0.65, clickIntensity:1.0 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],U_SHAFT:['color','shaft'],
      U_FLOW_SPEED:['float','flowSpeed'],U_WARP_PULL:['float','warpPull'],
      U_SHAFT_INTENSITY:['float','shaftIntensity'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Mid'},{type:'color',key:'c3',label:'Bright'},{type:'color',key:'shaft',label:'Shaft'}]},
      { title:'Light', controls:[{type:'slider',key:'shaftIntensity',label:'Shaft intensity',min:0,max:2,step:0.02}]},
      { title:'Motion', controls:[{type:'slider',key:'flowSpeed',label:'Flow',min:0,max:0.3,step:0.005},{type:'slider',key:'warpPull',label:'Warp',min:0,max:1,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── TIDE ────────────────────────────────────────────────────────────────
  tide: S_simple(TIDE_TUNABLE,
    { c1:'#02060e', c2:'#0e3540', c3:'#4d7a86',
      flowSpeed:0.30, bandFreq:8.0, warpPull:0.25, clickIntensity:1.0 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],
      U_FLOW_SPEED:['float','flowSpeed'],U_BAND_FREQ:['float','bandFreq'],
      U_WARP_PULL:['float','warpPull'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Mid'},{type:'color',key:'c3',label:'Crest'}]},
      { title:'Waves', controls:[{type:'slider',key:'bandFreq',label:'Band freq',min:2,max:20,step:0.2},{type:'slider',key:'flowSpeed',label:'Speed',min:0,max:2,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── GRAPHITE ────────────────────────────────────────────────────────────
  graphite: S_simple(GRAPHITE_TUNABLE,
    { c1:'#050608', c2:'#4d5460', c3:'#c8cdd6',
      flowSpeed:0.06, warpPull:0.30, hatchFreq:80.0, clickIntensity:0.9 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],
      U_FLOW_SPEED:['float','flowSpeed'],U_WARP_PULL:['float','warpPull'],
      U_HATCH_FREQ:['float','hatchFreq'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Mid'},{type:'color',key:'c3',label:'Bright'}]},
      { title:'Hatching', controls:[{type:'slider',key:'hatchFreq',label:'Hatch freq',min:20,max:200,step:2}]},
      { title:'Motion', controls:[{type:'slider',key:'flowSpeed',label:'Flow',min:0,max:0.3,step:0.005},{type:'slider',key:'warpPull',label:'Warp',min:0,max:1,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── VELLUM ──────────────────────────────────────────────────────────────
  vellum: S_simple(VELLUM_TUNABLE,
    { c1:'#060410', c2:'#4a3a2c', c3:'#b09078', c4:'#f5e3c0',
      flowSpeed:0.02, crackle:0.85, warpPull:0.20, clickIntensity:1.0 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],U_C4:['color','c4'],
      U_FLOW_SPEED:['float','flowSpeed'],U_CRACKLE:['float','crackle'],
      U_WARP_PULL:['float','warpPull'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Mid'},{type:'color',key:'c3',label:'Bright'},{type:'color',key:'c4',label:'Cream'}]},
      { title:'Texture', controls:[{type:'slider',key:'crackle',label:'Craquelure',min:0,max:1,step:0.02}]},
      { title:'Motion', controls:[{type:'slider',key:'flowSpeed',label:'Flow',min:0,max:0.2,step:0.005},{type:'slider',key:'warpPull',label:'Warp',min:0,max:1,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── FOXING ──────────────────────────────────────────────────────────────
  foxing: S_simple(FOXING_TUNABLE,
    { c1:'#0a0604', c2:'#381c0e', c3:'#80543a', rust:'#c47323',
      flowSpeed:0.03, rustAmt:0.65, warpPull:0.25, clickIntensity:1.0 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],U_RUST:['color','rust'],
      U_FLOW_SPEED:['float','flowSpeed'],U_RUST_AMT:['float','rustAmt'],
      U_WARP_PULL:['float','warpPull'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Mid'},{type:'color',key:'c3',label:'Bright'},{type:'color',key:'rust',label:'Rust'}]},
      { title:'Aging', controls:[{type:'slider',key:'rustAmt',label:'Rust amount',min:0,max:1.2,step:0.02}]},
      { title:'Motion', controls:[{type:'slider',key:'flowSpeed',label:'Flow',min:0,max:0.2,step:0.005},{type:'slider',key:'warpPull',label:'Warp',min:0,max:1,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── GILDED ──────────────────────────────────────────────────────────────
  gilded: S_simple(GILDED_TUNABLE,
    { c1:'#1a0e02', c2:'#5c3f15', gold:'#d4a73e', highlight:'#ffefb6',
      flowSpeed:0.04, streakFreq:8.0, warpPull:0.25, clickIntensity:1.1 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_GOLD:['color','gold'],U_HIGHLIGHT:['color','highlight'],
      U_FLOW_SPEED:['float','flowSpeed'],U_STREAK_FREQ:['float','streakFreq'],
      U_WARP_PULL:['float','warpPull'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Mid'},{type:'color',key:'gold',label:'Gold'},{type:'color',key:'highlight',label:'Highlight'}]},
      { title:'Streaks', controls:[{type:'slider',key:'streakFreq',label:'Frequency',min:2,max:20,step:0.2}]},
      { title:'Motion', controls:[{type:'slider',key:'flowSpeed',label:'Flow',min:0,max:0.3,step:0.005},{type:'slider',key:'warpPull',label:'Warp',min:0,max:1,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── HONEY ───────────────────────────────────────────────────────────────
  honey: S_simple(HONEY_TUNABLE,
    { c1:'#0d0501', c2:'#4d2106', c3:'#c47a23', drip:'#fce28a',
      flowSpeed:0.03, viscosity:1.5, warpPull:0.30, clickIntensity:1.2 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],U_DRIP:['color','drip'],
      U_FLOW_SPEED:['float','flowSpeed'],U_VISCOSITY:['float','viscosity'],
      U_WARP_PULL:['float','warpPull'],U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Mid'},{type:'color',key:'c3',label:'Amber'},{type:'color',key:'drip',label:'Drip'}]},
      { title:'Liquid', controls:[{type:'slider',key:'viscosity',label:'Viscosity',min:0.5,max:4,step:0.05},{type:'slider',key:'flowSpeed',label:'Flow',min:0,max:0.2,step:0.005}]},
      { title:'Drip', controls:[{type:'slider',key:'clickIntensity',label:'Drip strength',min:0,max:3,step:0.05}]},
    ]),

  // ════════════════════════════════════════════════════════════════════════
  // NEW SHADERS
  // ════════════════════════════════════════════════════════════════════════

  // ── MATRIX ──────────────────────────────────────────────────────────────
  matrix: S_simple(MATRIX_TUNABLE,
    { base:'#04dd33', hot:'#c8ffd0',
      colDensity:50.0, fallSpeed:1.4, headDensity:0.7, bendIntensity:0.6, clickIntensity:1.5 },
    { U_BASE:['color','base'],U_HOT:['color','hot'],
      U_COL_DENSITY:['float','colDensity'],U_FALL_SPEED:['float','fallSpeed'],
      U_HEAD_DENSITY:['float','headDensity'],U_BEND_INTENSITY:['float','bendIntensity'],
      U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'base',label:'Body'},{type:'color',key:'hot',label:'Head'}]},
      { title:'Code rain', controls:[
        {type:'slider',key:'colDensity',label:'Columns',min:20,max:120,step:2},
        {type:'slider',key:'fallSpeed',label:'Fall speed',min:0.1,max:3,step:0.05},
        {type:'slider',key:'headDensity',label:'Head density',min:0,max:1.5,step:0.02}]},
      { title:'Cursor', controls:[{type:'slider',key:'bendIntensity',label:'Bend',min:0,max:2,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Wave',min:0,max:3,step:0.05}]},
    ],
    {
      'Classic':  {base:'#04dd33',hot:'#c8ffd0'},
      'Amber':    {base:'#ddaa04',hot:'#fff0c0'},
      'Cyan':     {base:'#04ddcc',hot:'#c0fff0'},
      'Hot pink': {base:'#ff2090',hot:'#ffd0e8'},
    }),

  // ── CRT ─────────────────────────────────────────────────────────────────
  crt: S_simple(CRT_TUNABLE,
    { c1:'#080420', c2:'#d84cb0', c3:'#1ad4f0',
      flowSpeed:0.10, barrel:0.18, scanIntensity:0.25, rgbShift:0.8, noise:0.045, rollSpeed:0.07 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],
      U_FLOW_SPEED:['float','flowSpeed'],U_BARREL:['float','barrel'],
      U_SCAN_INTENSITY:['float','scanIntensity'],U_RGB_SHIFT:['float','rgbShift'],
      U_NOISE:['float','noise'],U_ROLL_SPEED:['float','rollSpeed'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Pink'},{type:'color',key:'c3',label:'Cyan'}]},
      { title:'CRT artifacts', controls:[
        {type:'slider',key:'barrel',label:'Barrel',min:0,max:0.6,step:0.01},
        {type:'slider',key:'scanIntensity',label:'Scanlines',min:0,max:0.6,step:0.01},
        {type:'slider',key:'rgbShift',label:'RGB shift',min:0,max:3,step:0.05},
        {type:'slider',key:'noise',label:'Noise',min:0,max:0.15,step:0.005},
        {type:'slider',key:'rollSpeed',label:'Roll bar speed',min:0,max:0.5,step:0.01}]},
      { title:'Motion', controls:[{type:'slider',key:'flowSpeed',label:'Content flow',min:0,max:0.4,step:0.005}]},
    ]),

  // ── VORTEX ──────────────────────────────────────────────────────────────
  vortex: S_simple(VORTEX_TUNABLE,
    { c1:'#020110', c2:'#cc2680', c3:'#36d4ff', c4:'#f5f188', centerGlow:'#fff2c8',
      spinSpeed:1.4, logK:7.0, warpPull:0.40, bands:4.0, clickIntensity:1.4 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],U_C4:['color','c4'],U_CENTER_GLOW:['color','centerGlow'],
      U_SPIN_SPEED:['float','spinSpeed'],U_LOG_K:['float','logK'],
      U_WARP_PULL:['float','warpPull'],U_BANDS:['float','bands'],
      U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Deep'},{type:'color',key:'c2',label:'Magenta'},{type:'color',key:'c3',label:'Cyan'},{type:'color',key:'c4',label:'Gold'},{type:'color',key:'centerGlow',label:'Center'}]},
      { title:'Spiral', controls:[
        {type:'slider',key:'spinSpeed',label:'Spin speed',min:-4,max:4,step:0.05},
        {type:'slider',key:'logK',label:'Spiral tightness',min:2,max:14,step:0.2},
        {type:'slider',key:'bands',label:'Bands',min:2,max:14,step:0.2},
        {type:'slider',key:'warpPull',label:'Cursor pull',min:0,max:1.2,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Intensity',min:0,max:3,step:0.05}]},
    ]),

  // ── CIRCUIT ─────────────────────────────────────────────────────────────
  circuit: S_simple(CIRCUIT_TUNABLE,
    { base:'#02060a', trace:'#1aaa78', hot:'#c5ffe0',
      grid:8.0, pulseSpeed:1.6, padDensity:0.75, cursorInflu:0.50, clickIntensity:1.3 },
    { U_BASE:['color','base'],U_TRACE:['color','trace'],U_HOT:['color','hot'],
      U_GRID:['float','grid'],U_PULSE_SPEED:['float','pulseSpeed'],
      U_PAD_DENSITY:['float','padDensity'],U_CURSOR_INFLU:['float','cursorInflu'],
      U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'base',label:'Board'},{type:'color',key:'trace',label:'Trace'},{type:'color',key:'hot',label:'Hot pulse'}]},
      { title:'PCB', controls:[
        {type:'slider',key:'grid',label:'Grid density',min:3,max:18,step:0.5},
        {type:'slider',key:'pulseSpeed',label:'Pulse speed',min:0,max:6,step:0.1},
        {type:'slider',key:'padDensity',label:'Pad density',min:0,max:1.5,step:0.05}]},
      { title:'Cursor', controls:[{type:'slider',key:'cursorInflu',label:'Influence',min:0,max:1.5,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Wave intensity',min:0,max:3,step:0.05}]},
    ],
    {
      'Green':    {base:'#02060a',trace:'#1aaa78',hot:'#c5ffe0'},
      'Cyan':     {base:'#020a14',trace:'#1aa5d4',hot:'#c5ecff'},
      'Amber':    {base:'#0a0602',trace:'#d4a51a',hot:'#fff0c5'},
      'Hot pink': {base:'#0a020a',trace:'#d41a90',hot:'#ffc5e0'},
    }),

  // ── OCEAN ───────────────────────────────────────────────────────────────
  ocean: S_simple(OCEAN_TUNABLE,
    { deep:'#02050f', mid:'#084c7a', crest:'#aedceb', sun:'#ffd07a',
      flowSpeed:0.5, waveAmp:1.0, sunIntensity:0.85, cursorWake:0.45, clickIntensity:1.0 },
    { U_DEEP:['color','deep'],U_MID:['color','mid'],U_CREST:['color','crest'],U_SUN:['color','sun'],
      U_FLOW_SPEED:['float','flowSpeed'],U_WAVE_AMP:['float','waveAmp'],
      U_SUN_INTENSITY:['float','sunIntensity'],U_CURSOR_WAKE:['float','cursorWake'],
      U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'deep',label:'Deep'},{type:'color',key:'mid',label:'Mid'},{type:'color',key:'crest',label:'Crest'},{type:'color',key:'sun',label:'Sun'}]},
      { title:'Waves', controls:[
        {type:'slider',key:'waveAmp',label:'Amplitude',min:0,max:3,step:0.05},
        {type:'slider',key:'flowSpeed',label:'Speed',min:0,max:2,step:0.05}]},
      { title:'Light', controls:[{type:'slider',key:'sunIntensity',label:'Sun glare',min:0,max:2,step:0.05}]},
      { title:'Interaction', controls:[
        {type:'slider',key:'cursorWake',label:'Cursor wake',min:0,max:1.5,step:0.02},
        {type:'slider',key:'clickIntensity',label:'Ripple',min:0,max:3,step:0.05}]},
    ],
    {
      'Pacific': {deep:'#02050f',mid:'#084c7a',crest:'#aedceb',sun:'#ffd07a'},
      'Tropical':{deep:'#02141a',mid:'#0aa092',crest:'#c8f5ec',sun:'#ffe98c'},
      'Storm':   {deep:'#030308',mid:'#1a1f3a',crest:'#7a8090',sun:'#5060a0'},
      'Sunset':  {deep:'#100614',mid:'#7a3050',crest:'#ffc0a0',sun:'#ff7050'},
    }),

  // ── LIGHTNING ───────────────────────────────────────────────────────────
  lightning: S_simple(LIGHTNING_TUNABLE,
    { bg:'#02041a', glow:'#5fa6ff', core:'#ffffff', flash:'#0e1e5e',
      strikeRate:0.6, followRate:0.30, branchAmount:0.40, intensity:1.0, clickIntensity:1.3 },
    { U_BG:['color','bg'],U_GLOW:['color','glow'],U_CORE:['color','core'],U_FLASH:['color','flash'],
      U_STRIKE_RATE:['float','strikeRate'],U_FOLLOW_RATE:['float','followRate'],
      U_BRANCH_AMOUNT:['float','branchAmount'],U_INTENSITY:['float','intensity'],
      U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'bg',label:'Sky'},{type:'color',key:'flash',label:'Flash tint'},{type:'color',key:'glow',label:'Bolt glow'},{type:'color',key:'core',label:'Core'}]},
      { title:'Bolt', controls:[
        {type:'slider',key:'strikeRate',label:'Strike rate',min:0.1,max:3,step:0.05},
        {type:'slider',key:'branchAmount',label:'Branches',min:0,max:1,step:0.02},
        {type:'slider',key:'intensity',label:'Intensity',min:0,max:3,step:0.05}]},
      { title:'Cursor follow', controls:[{type:'slider',key:'followRate',label:'Follower glow',min:0,max:1.5,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Click bolt',min:0,max:3,step:0.05}]},
    ],
    {
      'Storm':       {bg:'#02041a',glow:'#5fa6ff',core:'#ffffff',flash:'#0e1e5e'},
      'Mage':        {bg:'#0e021a',glow:'#c065ff',core:'#ffffff',flash:'#3c1466'},
      'Volcanic':    {bg:'#0a0204',glow:'#ff7a30',core:'#ffffd0',flash:'#5e1408'},
      'Cold':        {bg:'#01070f',glow:'#7af0ff',core:'#ffffff',flash:'#0a3a5e'},
    }),

  // ── PLASMA GLOBE ────────────────────────────────────────────────────────
  plasmaglobe: S_simple(PLASMAGLOBE_TUNABLE,
    { bg:'#0a0418', arcLow:'#5b30b6', arcHigh:'#ff8cff', orb:'#fff0ff',
      arcCount:6.0, flickerSpeed:1.1, warpPull:0.30, intensity:1.0, clickIntensity:1.4 },
    { U_BG:['color','bg'],U_ARC_LOW:['color','arcLow'],U_ARC_HIGH:['color','arcHigh'],U_ORB:['color','orb'],
      U_ARC_COUNT:['float','arcCount'],U_FLICKER_SPEED:['float','flickerSpeed'],
      U_WARP_PULL:['float','warpPull'],U_INTENSITY:['float','intensity'],
      U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'bg',label:'Background'},{type:'color',key:'arcLow',label:'Arc low'},{type:'color',key:'arcHigh',label:'Arc high'},{type:'color',key:'orb',label:'Orb'}]},
      { title:'Arcs', controls:[
        {type:'slider',key:'arcCount',label:'Arc count',min:1,max:12,step:1},
        {type:'slider',key:'flickerSpeed',label:'Flicker',min:0,max:5,step:0.05},
        {type:'slider',key:'intensity',label:'Intensity',min:0,max:3,step:0.05}]},
      { title:'Cursor', controls:[{type:'slider',key:'warpPull',label:'Orb follow',min:0,max:1.2,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Click arc',min:0,max:3,step:0.05}]},
    ],
    {
      'Classic':  {bg:'#0a0418',arcLow:'#5b30b6',arcHigh:'#ff8cff',orb:'#fff0ff'},
      'Ice':      {bg:'#020c14',arcLow:'#1a90c8',arcHigh:'#7af0ff',orb:'#ffffff'},
      'Inferno':  {bg:'#0a0404',arcLow:'#a02818',arcHigh:'#ffaa3a',orb:'#fff5e0'},
      'Toxic':    {bg:'#040a04',arcLow:'#2ea838',arcHigh:'#aaff60',orb:'#f0ffd0'},
    }),

  // ── CAUSTICS ────────────────────────────────────────────────────────────
  caustics: S_simple(CAUSTICS_TUNABLE,
    { deep:'#020c1e', mid:'#0c4d80', hot:'#cef2ff', shaft:'#90b8cc',
      flowSpeed:0.55, scale:3.0, warpPull:0.25, shaftIntensity:0.55, clickIntensity:1.2 },
    { U_DEEP:['color','deep'],U_MID:['color','mid'],U_HOT:['color','hot'],U_SHAFT:['color','shaft'],
      U_FLOW_SPEED:['float','flowSpeed'],U_SCALE:['float','scale'],
      U_WARP_PULL:['float','warpPull'],U_SHAFT_INTENSITY:['float','shaftIntensity'],
      U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'deep',label:'Deep'},{type:'color',key:'mid',label:'Mid'},{type:'color',key:'hot',label:'Caustic'},{type:'color',key:'shaft',label:'Shaft'}]},
      { title:'Water', controls:[
        {type:'slider',key:'flowSpeed',label:'Flow speed',min:0,max:2,step:0.02},
        {type:'slider',key:'scale',label:'Scale',min:1,max:8,step:0.1}]},
      { title:'Light', controls:[{type:'slider',key:'shaftIntensity',label:'Sun shaft',min:0,max:2,step:0.02}]},
      { title:'Cursor', controls:[{type:'slider',key:'warpPull',label:'Surface warp',min:0,max:1,step:0.02}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Ripple',min:0,max:3,step:0.05}]},
    ],
    {
      'Pool':     {deep:'#020c1e',mid:'#0c4d80',hot:'#cef2ff',shaft:'#90b8cc'},
      'Reef':     {deep:'#021414',mid:'#0a8a78',hot:'#d2fff0',shaft:'#8ac0a8'},
      'Cenote':   {deep:'#02041a',mid:'#0a4a8a',hot:'#aef0ff',shaft:'#7ac0ff'},
      'Ice cave': {deep:'#040a14',mid:'#3a5aa0',hot:'#e0eaff',shaft:'#a0b8e0'},
    }),

  // ── TESLA ───────────────────────────────────────────────────────────────
  tesla: S_simple(TESLA_TUNABLE,
    { bg:'#04020a', glow:'#d090ff', core:'#ffffff',
      arcCount:5.0, reach:0.7, violence:1.0, intensity:1.0, clickIntensity:1.5 },
    { U_BG:['color','bg'],U_GLOW:['color','glow'],U_CORE:['color','core'],
      U_ARC_COUNT:['float','arcCount'],U_REACH:['float','reach'],
      U_VIOLENCE:['float','violence'],U_INTENSITY:['float','intensity'],
      U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'bg',label:'Background'},{type:'color',key:'glow',label:'Arc glow'},{type:'color',key:'core',label:'Core'}]},
      { title:'Coil', controls:[
        {type:'slider',key:'arcCount',label:'Arc count',min:1,max:8,step:1},
        {type:'slider',key:'reach',label:'Arc reach',min:0.2,max:1.5,step:0.05},
        {type:'slider',key:'violence',label:'Jitter',min:0,max:2.5,step:0.05},
        {type:'slider',key:'intensity',label:'Intensity',min:0,max:3,step:0.05}]},
      { title:'Click', controls:[{type:'slider',key:'clickIntensity',label:'Click strike',min:0,max:3,step:0.05}]},
    ],
    {
      'Violet':  {bg:'#04020a',glow:'#d090ff',core:'#ffffff'},
      'Electric':{bg:'#020a14',glow:'#80c8ff',core:'#ffffff'},
      'Hellfire':{bg:'#0a0202',glow:'#ff7a30',core:'#fff8d0'},
      'Toxic':   {bg:'#020a04',glow:'#90ff5e',core:'#f0ffd0'},
    }),

  // ── QUANTUM ─────────────────────────────────────────────────────────────
  quantum: S_simple(QUANTUM_TUNABLE,
    { bg:'#02011a', c1:'#1a66ff', c2:'#ff4cd6', hot:'#f0f0ff',
      waveFreq:30.0, waveSpeed:3.0, particleDensity:28.0, entIntensity:0.45, clickIntensity:1.4 },
    { U_BG:['color','bg'],U_C1:['color','c1'],U_C2:['color','c2'],U_HOT:['color','hot'],
      U_WAVE_FREQ:['float','waveFreq'],U_WAVE_SPEED:['float','waveSpeed'],
      U_PARTICLE_DENSITY:['float','particleDensity'],U_ENT_INTENSITY:['float','entIntensity'],
      U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'bg',label:'Void'},{type:'color',key:'c1',label:'Source 1'},{type:'color',key:'c2',label:'Source 2'},{type:'color',key:'hot',label:'Particles'}]},
      { title:'Waves', controls:[
        {type:'slider',key:'waveFreq',label:'Frequency',min:8,max:80,step:1},
        {type:'slider',key:'waveSpeed',label:'Speed',min:0,max:10,step:0.1}]},
      { title:'Particles', controls:[
        {type:'slider',key:'particleDensity',label:'Density',min:8,max:60,step:1}]},
      { title:'Entanglement', controls:[
        {type:'slider',key:'entIntensity',label:'Link intensity',min:0,max:2,step:0.02}]},
      { title:'Click', controls:[
        {type:'slider',key:'clickIntensity',label:'Collapse',min:0,max:3,step:0.05}]},
    ],
    {
      'Classic':  {bg:'#02011a',c1:'#1a66ff',c2:'#ff4cd6',hot:'#f0f0ff'},
      'Acid':     {bg:'#040a02',c1:'#3ee03a',c2:'#ffe83a',hot:'#f5ffe0'},
      'Plasma':   {bg:'#0a020a',c1:'#ff3e6a',c2:'#7a3aff',hot:'#fff5ff'},
      'Cold':     {bg:'#020514',c1:'#3aaaff',c2:'#a0e0ff',hot:'#ffffff'},
    }),

  // ── CURL FIELD ──────────────────────────────────────────────────────────
  curlfield: S_simple(CURLFIELD_TUNABLE,
    { c1:'#04040e', c2:'#1a4dc8', c3:'#d2358a', c4:'#fff0bc',
      fieldScale:2.0, flowSpeed:0.15, streakSteps:14.0, cursorPull:0.45, clickIntensity:1.2 },
    { U_C1:['color','c1'],U_C2:['color','c2'],U_C3:['color','c3'],U_C4:['color','c4'],
      U_FIELD_SCALE:['float','fieldScale'],U_FLOW_SPEED:['float','flowSpeed'],
      U_STREAK_STEPS:['float','streakSteps'],U_CURSOR_PULL:['float','cursorPull'],
      U_CLICK_INTENSITY:['float','clickIntensity'] },
    [
      { title:'Palette', controls:[{type:'color',key:'c1',label:'Void'},{type:'color',key:'c2',label:'Mid'},{type:'color',key:'c3',label:'Bright'},{type:'color',key:'c4',label:'Hot'}]},
      { title:'Field', controls:[
        {type:'slider',key:'fieldScale',label:'Scale',min:0.5,max:6,step:0.1},
        {type:'slider',key:'flowSpeed',label:'Speed',min:0,max:0.6,step:0.005}]},
      { title:'Streaks', controls:[
        {type:'slider',key:'streakSteps',label:'Density',min:6,max:24,step:1}]},
      { title:'Interaction', controls:[
        {type:'slider',key:'cursorPull',label:'Cursor pull',min:0,max:1.5,step:0.02},
        {type:'slider',key:'clickIntensity',label:'Click burst',min:0,max:3,step:0.05}]},
    ]),
};

// ─────────────────────────────────────────────────────────────────────────────
// Family groupings + filter chips
// ─────────────────────────────────────────────────────────────────────────────
const FAMILY = {
  mercury:'Originals', aurora:'Originals', lattice:'Originals', plasma:'Originals', prism:'Originals',
  nebula:'Space', galaxy:'Space', singularity:'Space', wormhole:'Space', hyperspace:'Space',
  manifold:'Math', lagrangian:'Math', riemann:'Math', constellation:'Math',
  silk:'Subtle', vapor:'Subtle', tide:'Subtle', graphite:'Subtle',
  parchment:'Parchment', vellum:'Parchment', foxing:'Parchment', gilded:'Parchment', honey:'Parchment',
  matrix:'Cyberpunk', crt:'Cyberpunk', circuit:'Cyberpunk',
  vortex:'Generative', curlfield:'Generative', quantum:'Generative',
  ocean:'Nature', caustics:'Nature',
  lightning:'Electric', plasmaglobe:'Electric', tesla:'Electric',
};

const FAMILIES = ['All', 'Originals', 'Space', 'Math', 'Subtle', 'Parchment', 'Electric', 'Cyberpunk', 'Generative', 'Nature', 'Aurora-family'];
const AURORA_FAMILY_IDS = new Set(['aurora', 'parchment', 'vellum', 'foxing', 'gilded', 'honey']);

window.FORGELABS_TUNABLE = { SCHEMAS, FAMILY, FAMILIES, AURORA_FAMILY_IDS };
