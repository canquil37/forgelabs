// ForgeLabs — Effects Laboratory
// Vanilla JS single-page app. No bundler.

(function () {
  'use strict';

  const WALLPAPERS = window.WALLPAPERS;
  const SHADER_COMMON = window.SHADER_COMMON;
  const { SCHEMAS, FAMILY, FAMILIES, AURORA_FAMILY_IDS } = window.FORGELABS_TUNABLE;

  const LS_PREFIX = 'forgelabs.';
  const VS_SRC = 'attribute vec2 a_pos; void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }';

  // ═══════════════════════════════════════════════════════════════════════
  // GLOBAL STATE — mood / lens / tempo are shared across all shaders.
  // ═══════════════════════════════════════════════════════════════════════
  const GLOBAL = loadGlobal();
  function loadGlobal() {
    try {
      const s = JSON.parse(localStorage.getItem(LS_PREFIX + 'global') || '{}');
      return Object.assign({ mood: 0, lens: 0, tempo: 1.0 }, s);
    } catch { return { mood: 0, lens: 0, tempo: 1.0 }; }
  }
  function saveGlobal() { localStorage.setItem(LS_PREFIX + 'global', JSON.stringify(GLOBAL)); }

  // ═══════════════════════════════════════════════════════════════════════
  // WebGL helpers
  // ═══════════════════════════════════════════════════════════════════════
  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      console.error('Shader error:', log, '\n---\n', src);
      throw new Error(log);
    }
    return sh;
  }
  function program(gl, fragSrc) {
    const vs = compile(gl, gl.VERTEX_SHADER, VS_SRC);
    const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  function wrapPostProcess(fragSrc) {
    return fragSrc.replace(
      /gl_FragColor\s*=\s*vec4\s*\(\s*col\s*,\s*1\.0\s*\)\s*;/g,
      'gl_FragColor = vec4(postProcess(col, gl_FragCoord.xy - u_offset), 1.0);'
    );
  }
  function hex3(h) {
    h = (h || '#000000').replace('#','');
    if (h.length === 3) h = h.split('').map(c => c+c).join('');
    const n = parseInt(h, 16);
    return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ShaderRunner — fullscreen single shader with optional custom uniforms.
  // ═══════════════════════════════════════════════════════════════════════
  class ShaderRunner {
    constructor(canvas, fragSrc, schema) {
      this.canvas = canvas;
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false, alpha: false });
      if (!gl) throw new Error('No WebGL');
      this.gl = gl;
      const fullSrc = SHADER_COMMON + wrapPostProcess(fragSrc);
      this.program = program(gl, fullSrc);
      gl.useProgram(this.program);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(this.program, 'a_pos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      this.loc = {
        res:    gl.getUniformLocation(this.program, 'u_res'),
        offset: gl.getUniformLocation(this.program, 'u_offset'),
        time:   gl.getUniformLocation(this.program, 'u_time'),
        mouse:  gl.getUniformLocation(this.program, 'u_mouse'),
        mouseS: gl.getUniformLocation(this.program, 'u_mouseSmooth'),
        clicks: gl.getUniformLocation(this.program, 'u_clicks[0]'),
        mood:   gl.getUniformLocation(this.program, 'u_mood'),
        lens:   gl.getUniformLocation(this.program, 'u_lens'),
      };

      this.schema = schema || null;
      this.customLocs = {};
      if (schema) {
        for (const [uniName] of Object.entries(schema.uniforms)) {
          this.customLocs[uniName] = gl.getUniformLocation(this.program, uniName);
        }
      }

      this.mouse = [canvas.clientWidth * 0.5, canvas.clientHeight * 0.5];
      this.mouseSmooth = this.mouse.slice();
      this.clicks = new Float32Array(8 * 4);
      this.clickHead = 0;
      this.animTime = 0;
      this.lastNow = null;
      this.resize();
    }
    resize() {
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      const W = Math.max(1, Math.floor(w * this.dpr));
      const H = Math.max(1, Math.floor(h * this.dpr));
      if (this.canvas.width !== W) this.canvas.width = W;
      if (this.canvas.height !== H) this.canvas.height = H;
      this.gl.viewport(0, 0, W, H);
    }
    setMouse(x, y) {
      const h = this.canvas.clientHeight;
      this.mouse[0] = x * this.dpr;
      this.mouse[1] = (h - y) * this.dpr;
    }
    addClick(x, y) {
      const h = this.canvas.clientHeight;
      const idx = (this.clickHead % 8) * 4;
      this.clicks[idx + 0] = x * this.dpr;
      this.clicks[idx + 1] = (h - y) * this.dpr;
      this.clicks[idx + 2] = this.animTime;
      this.clicks[idx + 3] = 1.0;
      this.clickHead = this.clickHead + 1;
    }
    syncCustomUniforms(state) {
      if (!this.schema) return;
      const gl = this.gl;
      gl.useProgram(this.program);
      for (const [uniName, [type, stateKey]] of Object.entries(this.schema.uniforms)) {
        const loc = this.customLocs[uniName];
        if (!loc) continue;
        const v = state[stateKey];
        if (type === 'color') {
          const c = hex3(v);
          gl.uniform3f(loc, c[0], c[1], c[2]);
        } else if (type === 'float') {
          gl.uniform1f(loc, Number(v) || 0);
        }
      }
    }
    render(now, state) {
      const gl = this.gl;
      this.resize();
      const dt = this.lastNow ? (now - this.lastNow) / 1000 : 0.016;
      this.lastNow = now;
      this.animTime += dt * GLOBAL.tempo;

      const ease = 1 - Math.pow(0.001, dt);
      this.mouseSmooth[0] += (this.mouse[0] - this.mouseSmooth[0]) * ease;
      this.mouseSmooth[1] += (this.mouse[1] - this.mouseSmooth[1]) * ease;

      gl.useProgram(this.program);
      gl.uniform2f(this.loc.res, this.canvas.width, this.canvas.height);
      gl.uniform2f(this.loc.offset, 0, 0);
      gl.uniform2f(this.loc.mouse, this.mouse[0], this.mouse[1]);
      gl.uniform2f(this.loc.mouseS, this.mouseSmooth[0], this.mouseSmooth[1]);
      gl.uniform1f(this.loc.time, this.animTime);
      gl.uniform4fv(this.loc.clicks, this.clicks);
      gl.uniform1i(this.loc.mood, GLOBAL.mood | 0);
      gl.uniform1i(this.loc.lens, GLOBAL.lens | 0);
      if (state) this.syncCustomUniforms(state);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    destroy() {
      const gl = this.gl;
      try {
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      } catch {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SharedDockRenderer — gallery thumbnails via scissor (1 context).
  // Only renders tiles inside the viewport for perf.
  // ═══════════════════════════════════════════════════════════════════════
  class SharedDockRenderer {
    constructor(canvas, wallpapers) {
      this.canvas = canvas;
      this.dpr = 1;
      const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false, alpha: true });
      if (!gl) throw new Error('No WebGL');
      this.gl = gl;
      gl.enable(gl.SCISSOR_TEST);
      // Fully transparent so the gallery background shows through gaps
      gl.clearColor(0, 0, 0, 0);

      this.buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

      this.programs = new Map();
      for (const wp of wallpapers) {
        try {
          // Use the tunable variant when available so the dock preview matches
          // EXACTLY what the user sees on first open of the workstation.
          const schema = SCHEMAS[wp.id] || null;
          const fragSrc = schema ? schema.frag : wp.frag;
          const src = SHADER_COMMON + wrapPostProcess(fragSrc);
          const prog = program(gl, src);
          gl.useProgram(prog);
          const aPos = gl.getAttribLocation(prog, 'a_pos');
          gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
          gl.enableVertexAttribArray(aPos);
          gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

          // Bind schema defaults to custom uniforms once (no need to update each frame).
          if (schema) {
            for (const [uniName, [type, key]] of Object.entries(schema.uniforms)) {
              const loc = gl.getUniformLocation(prog, uniName);
              if (!loc) continue;
              const v = schema.defaults[key];
              if (type === 'color') {
                const c = hex3(v);
                gl.uniform3f(loc, c[0], c[1], c[2]);
              } else if (type === 'float') {
                gl.uniform1f(loc, Number(v) || 0);
              }
            }
          }

          this.programs.set(wp.id, {
            prog, aPos,
            loc: {
              res:    gl.getUniformLocation(prog, 'u_res'),
              offset: gl.getUniformLocation(prog, 'u_offset'),
              time:   gl.getUniformLocation(prog, 'u_time'),
              mouse:  gl.getUniformLocation(prog, 'u_mouse'),
              mouseS: gl.getUniformLocation(prog, 'u_mouseSmooth'),
              clicks: gl.getUniformLocation(prog, 'u_clicks[0]'),
              mood:   gl.getUniformLocation(prog, 'u_mood'),
              lens:   gl.getUniformLocation(prog, 'u_lens'),
            }
          });
        } catch (err) {
          console.warn('[SharedDock] failed to compile', wp.id, err.message);
        }
      }
      this.zeroClicks = new Float32Array(32);
      this.tiles = [];
      this.animTime = 0;
      this.lastNow = null;
    }
    setTiles(tiles) { this.tiles = tiles; }
    resize(host) {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const W = Math.max(1, Math.floor(w * this.dpr));
      const H = Math.max(1, Math.floor(h * this.dpr));
      if (this.canvas.width !== W) this.canvas.width = W;
      if (this.canvas.height !== H) this.canvas.height = H;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
    }
    render(now, host) {
      this.resize(host);
      const gl = this.gl;
      const dpr = this.dpr;
      const dt = this.lastNow ? (now - this.lastNow) / 1000 : 0.016;
      this.lastNow = now;
      this.animTime += dt * GLOBAL.tempo;

      const canvasH = this.canvas.height;
      const hostRect = host.getBoundingClientRect();

      gl.scissor(0, 0, this.canvas.width, this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);

      for (const t of this.tiles) {
        const prog = this.programs.get(t.id);
        if (!prog) continue;
        const el = t.el;
        const r = el.getBoundingClientRect();
        // skip off-screen tiles for performance
        if (r.bottom < hostRect.top - 200 || r.top > hostRect.bottom + 200) continue;

        const x = Math.round((r.left - hostRect.left + host.scrollLeft) * dpr);
        const y = Math.round((r.top  - hostRect.top  + host.scrollTop)  * dpr);
        const w = Math.max(1, Math.round(r.width * dpr));
        const h = Math.max(1, Math.round(r.height * dpr));
        const glY = canvasH - y - h;

        gl.viewport(x, glY, w, h);
        gl.scissor(x, glY, w, h);

        gl.useProgram(prog.prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        gl.enableVertexAttribArray(prog.aPos);
        gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, 0, 0);

        gl.uniform2f(prog.loc.res, w, h);
        gl.uniform2f(prog.loc.offset, x, glY);
        gl.uniform1f(prog.loc.time, this.animTime + (t.timeBias || 0));
        const mx = x + w * 0.5;
        const my = glY + h * 0.5;
        gl.uniform2f(prog.loc.mouse, mx, my);
        gl.uniform2f(prog.loc.mouseS, mx, my);
        gl.uniform4fv(prog.loc.clicks, this.zeroClicks);
        gl.uniform1i(prog.loc.mood, GLOBAL.mood | 0);
        gl.uniform1i(prog.loc.lens, GLOBAL.lens | 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }
    destroy() {
      try {
        const ext = this.gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      } catch {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // App
  // ═══════════════════════════════════════════════════════════════════════
  const App = {
    view: 'gallery',
    activeId: null,
    filter: 'All',
    search: '',
    runner: null,
    dock: null,
    raf: null,
    paramState: {},   // per-shader state (only for shaders with schemas)
    filteredIds: [],

    init() {
      this.bindTopbar();
      this.buildGallery();
      this.startGalleryLoop();
      this.bindKeyboard();
      this.bindExportModal();
      this.bindHelp();
      // remove intro fade after first frame
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById('intro-fade').classList.add('done');
        });
      });
    },

    // ─── Gallery ───────────────────────────────────────────────────────
    buildGallery() {
      const chipsEl = document.getElementById('family-chips');
      chipsEl.innerHTML = '';
      FAMILIES.forEach(fam => {
        const c = document.createElement('div');
        c.className = 'chip' + (fam === this.filter ? ' active' : '');
        c.textContent = fam;
        c.dataset.fam = fam;
        c.onclick = () => { this.filter = fam; this.refreshGalleryFilter(); };
        chipsEl.appendChild(c);
      });

      const search = document.getElementById('search');
      search.oninput = () => { this.search = search.value.toLowerCase(); this.refreshGalleryFilter(); };

      const stage = document.getElementById('gallery-stage');
      // Dock canvas
      let dockCanvas = document.getElementById('dock-canvas');
      if (!dockCanvas) {
        dockCanvas = document.createElement('canvas');
        dockCanvas.id = 'dock-canvas';
        stage.appendChild(dockCanvas);
      }

      // Tile grid
      const grid = document.createElement('div');
      grid.className = 'tile-grid';
      grid.id = 'tile-grid';
      WALLPAPERS.forEach(wp => {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.dataset.id = wp.id;
        const label = document.createElement('div');
        label.className = 'label';
        label.innerHTML = `<span class="name">${wp.name}</span><span class="fam">${FAMILY[wp.id] || ''}</span>`;
        tile.appendChild(label);
        tile.title = wp.meta;
        tile.onclick = () => this.openWorkstation(wp.id);
        grid.appendChild(tile);
      });
      // Replace any existing
      const existing = document.getElementById('tile-grid');
      if (existing) existing.remove();
      stage.appendChild(grid);

      this.dock = new SharedDockRenderer(dockCanvas, WALLPAPERS);
      this.refreshGalleryFilter();

      // scroll/resize trigger dock re-render via the raf loop reading tile rects
    },

    refreshGalleryFilter() {
      document.querySelectorAll('#family-chips .chip').forEach(c => {
        c.classList.toggle('active', c.dataset.fam === this.filter);
      });
      const grid = document.getElementById('tile-grid');
      if (!grid) return;
      const q = this.search.trim();
      this.filteredIds = [];
      const tiles = [];
      WALLPAPERS.forEach(wp => {
        const el = grid.querySelector(`[data-id="${wp.id}"]`);
        if (!el) return;
        let match = true;
        if (this.filter !== 'All') {
          if (this.filter === 'Aurora-family') {
            match = AURORA_FAMILY_IDS.has(wp.id);
          } else {
            match = (FAMILY[wp.id] === this.filter);
          }
        }
        if (match && q) {
          match = wp.name.toLowerCase().includes(q)
               || wp.meta.toLowerCase().includes(q)
               || (FAMILY[wp.id] || '').toLowerCase().includes(q);
        }
        // Toggle a class instead of setting style.display directly. Setting
        // display:block on a grid item removes it from the grid layout in
        // some browsers; using `.tile-hidden { display:none }` is safe.
        el.classList.toggle('tile-hidden', !match);
        if (match) {
          this.filteredIds.push(wp.id);
          tiles.push({ id: wp.id, el, timeBias: wp.id.charCodeAt(0) * 0.31 });
        }
      });
      // Force reflow so the grid lays out the newly-visible tiles BEFORE the
      // dock renderer reads getBoundingClientRect on the next frame.
      void grid.offsetHeight;
      // Defer setTiles to next frame so layout has fully settled.
      const self = this;
      requestAnimationFrame(() => { if (self.dock) self.dock.setTiles(tiles); });
    },

    startGalleryLoop() {
      const host = document.getElementById('gallery-stage');
      const loop = (now) => {
        if (this.view === 'gallery' && this.dock) {
          this.dock.render(now, host);
        }
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    },

    // ─── Workstation ──────────────────────────────────────────────────
    openWorkstation(id) {
      this.activeId = id;
      const wp = WALLPAPERS.find(w => w.id === id);
      const schema = SCHEMAS[id] || null;
      const fragSrc = schema ? schema.frag : wp.frag;

      // Build state
      let state = null;
      if (schema) {
        try {
          state = JSON.parse(localStorage.getItem(LS_PREFIX + id + '.config') || 'null');
        } catch {}
        if (!state) state = { ...schema.defaults };
        this.paramState[id] = state;
      }

      // Destroy old runner
      if (this.runner) { this.runner.destroy(); this.runner = null; }

      // Setup canvas
      const stageEl = document.getElementById('stage');
      stageEl.innerHTML = '<div class="loading" id="ws-loading"></div>';
      const canvas = document.createElement('canvas');
      stageEl.insertBefore(canvas, stageEl.firstChild);

      // Compile (defer one frame so loading shows)
      requestAnimationFrame(() => {
        try {
          this.runner = new ShaderRunner(canvas, fragSrc, schema);
          stageEl.querySelector('#ws-loading')?.remove();
        } catch (err) {
          console.error(err);
          stageEl.querySelector('#ws-loading').textContent = 'compile failed';
          return;
        }

        canvas.onmousemove = (e) => {
          const r = canvas.getBoundingClientRect();
          this.runner.setMouse(e.clientX - r.left, e.clientY - r.top);
        };
        canvas.onclick = (e) => {
          const r = canvas.getBoundingClientRect();
          this.runner.addClick(e.clientX - r.left, e.clientY - r.top);
        };
        canvas.ontouchstart = canvas.ontouchmove = (e) => {
          if (!e.touches[0]) return;
          const r = canvas.getBoundingClientRect();
          this.runner.setMouse(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
          if (e.type === 'touchstart') {
            this.runner.addClick(e.touches[0].clientX - r.left, e.touches[0].clientY - r.top);
          }
        };

        this.runWorkstationLoop();
      });

      // Switch view + build panel
      this.setView('workstation');
      this.buildPanel(id, schema);
      this.updateInfo(wp);
    },

    runWorkstationLoop() {
      cancelAnimationFrame(this.raf);
      const loop = (now) => {
        if (this.view === 'workstation' && this.runner) {
          this.runner.render(now, this.activeId ? this.paramState[this.activeId] : null);
        } else if (this.view === 'gallery' && this.dock) {
          this.dock.render(now, document.getElementById('gallery-stage'));
        }
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    },

    updateInfo(wp) {
      document.getElementById('ws-name').textContent = wp.name;
      document.getElementById('ws-family').textContent = FAMILY[wp.id] || '';
      document.getElementById('ws-meta').textContent = wp.meta;
    },

    buildPanel(id, schema) {
      const panel = document.getElementById('panel-body');
      panel.innerHTML = '';

      if (!schema) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.innerHTML = 'No custom parameters yet for <strong>' + id + '</strong>.<br>Use the global <em>Mood</em> / <em>Lens</em> / <em>Tempo</em> controls in the top bar.<br><br><small>TODO: to add a schema, edit <code>tunable.js</code>: write a tunable variant + SCHEMA entry.</small>';
        panel.appendChild(empty);
        return;
      }

      const state = this.paramState[id];

      // Presets row
      if (schema.presets) {
        const row = document.createElement('div');
        row.className = 'preset-row';
        const label = document.createElement('div');
        label.style.cssText = 'width:100%;color:var(--ink-dim);font-size:10px;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:4px';
        label.textContent = 'Presets';
        row.appendChild(label);
        for (const [name, deltas] of Object.entries(schema.presets)) {
          const c = document.createElement('div');
          c.className = 'chip';
          c.textContent = name;
          c.onclick = () => {
            Object.assign(state, deltas);
            this.persist();
            this.refreshPanelValues();
          };
          row.appendChild(c);
        }
        panel.appendChild(row);
      }

      schema.sections.forEach(sec => {
        const d = document.createElement('details');
        d.className = 'sec';
        d.open = true;
        const sum = document.createElement('summary');
        sum.textContent = sec.title;
        d.appendChild(sum);
        const body = document.createElement('div');
        body.className = 'sec-body';
        d.appendChild(body);
        sec.controls.forEach(ctrl => {
          if (ctrl.type === 'slider') this.makeSlider(body, state, ctrl);
          else if (ctrl.type === 'color') this.makeColor(body, state, ctrl);
        });
        panel.appendChild(d);
      });

      // Action row
      const acts = document.createElement('div');
      acts.className = 'action-row';
      const btnRand = document.createElement('button');
      btnRand.textContent = 'Randomize';
      btnRand.onclick = () => this.randomize(id, schema);
      const btnReset = document.createElement('button');
      btnReset.textContent = 'Reset';
      btnReset.onclick = () => {
        Object.assign(state, schema.defaults);
        this.persist();
        this.refreshPanelValues();
      };
      acts.appendChild(btnRand);
      acts.appendChild(btnReset);
      panel.appendChild(acts);
    },

    makeSlider(parent, state, ctrl) {
      const row = document.createElement('div');
      row.className = 'ctrl';
      row.dataset.key = ctrl.key;
      row.dataset.type = 'slider';
      row.innerHTML = `<label>${ctrl.label}</label><input type="range" min="${ctrl.min}" max="${ctrl.max}" step="${ctrl.step}" value="${state[ctrl.key]}"><span class="val">${this.fmt(state[ctrl.key], ctrl.step)}</span>`;
      const input = row.querySelector('input');
      const val = row.querySelector('.val');
      input.oninput = () => {
        state[ctrl.key] = parseFloat(input.value);
        val.textContent = this.fmt(state[ctrl.key], ctrl.step);
        this.persist();
      };
      parent.appendChild(row);
    },

    makeColor(parent, state, ctrl) {
      const row = document.createElement('div');
      row.className = 'ctrl';
      row.dataset.key = ctrl.key;
      row.dataset.type = 'color';
      row.style.gridTemplateColumns = '90px 1fr';
      row.innerHTML = `<label>${ctrl.label}</label><input type="color" value="${state[ctrl.key]}">`;
      const input = row.querySelector('input');
      input.oninput = () => {
        state[ctrl.key] = input.value;
        this.persist();
      };
      parent.appendChild(row);
    },

    fmt(v, step) {
      if (step >= 1) return Math.round(v).toString();
      const decimals = Math.max(0, -Math.floor(Math.log10(step)));
      return Number(v).toFixed(decimals);
    },

    refreshPanelValues() {
      const id = this.activeId;
      const state = this.paramState[id];
      if (!state) return;
      document.querySelectorAll('#panel-body .ctrl').forEach(row => {
        const key = row.dataset.key;
        const input = row.querySelector('input');
        if (!input || state[key] === undefined) return;
        input.value = state[key];
        const valEl = row.querySelector('.val');
        if (valEl) {
          const step = parseFloat(input.step) || 0.01;
          valEl.textContent = this.fmt(state[key], step);
        }
      });
    },

    randomize(id, schema) {
      const state = this.paramState[id];
      // randomize numeric params in their slider ranges; leave colors unless few of them
      schema.sections.forEach(sec => {
        sec.controls.forEach(ctrl => {
          if (ctrl.type === 'slider') {
            state[ctrl.key] = ctrl.min + Math.random() * (ctrl.max - ctrl.min);
          }
        });
      });
      this.persist();
      this.refreshPanelValues();
    },

    persist() {
      const id = this.activeId;
      if (id && this.paramState[id]) {
        localStorage.setItem(LS_PREFIX + id + '.config', JSON.stringify(this.paramState[id]));
      }
    },

    // ─── View routing ─────────────────────────────────────────────────
    setView(name) {
      this.view = name;
      document.getElementById('gallery-view').classList.toggle('active', name === 'gallery');
      document.getElementById('workstation-view').classList.toggle('active', name === 'workstation');
      document.getElementById('library-view').classList.toggle('active', name === 'library');
      document.body.classList.toggle('in-workstation', name === 'workstation');
      document.body.classList.toggle('in-gallery', name === 'gallery');
      document.body.classList.toggle('in-library', name === 'library');
      document.getElementById('library-btn').classList.toggle('active', name === 'library');
    },

    backToGallery() {
      if (this.runner) { this.runner.destroy(); this.runner = null; }
      cancelAnimationFrame(this.raf);
      this.activeId = null;
      this.setView('gallery');
      this.startGalleryLoop();
    },

    // ─── Navigation ───────────────────────────────────────────────────
    nextShader(delta) {
      if (!this.activeId) return;
      const ids = this.filteredIds.length ? this.filteredIds : WALLPAPERS.map(w => w.id);
      const idx = ids.indexOf(this.activeId);
      if (idx === -1) return;
      const next = ids[(idx + delta + ids.length) % ids.length];
      this.openWorkstation(next);
    },

    // ─── Topbar / keyboard ───────────────────────────────────────────
    bindTopbar() {
      const moodSel = document.getElementById('mood');
      const lensSel = document.getElementById('lens');
      const tempo = document.getElementById('tempo');
      moodSel.value = GLOBAL.mood;
      lensSel.value = GLOBAL.lens;
      tempo.value = GLOBAL.tempo;
      moodSel.onchange = () => { GLOBAL.mood = parseInt(moodSel.value, 10); saveGlobal(); };
      lensSel.onchange = () => { GLOBAL.lens = parseInt(lensSel.value, 10); saveGlobal(); };
      tempo.oninput = () => {
        GLOBAL.tempo = parseFloat(tempo.value);
        document.getElementById('tempo-val').textContent = GLOBAL.tempo.toFixed(2) + '×';
        saveGlobal();
      };
      document.getElementById('tempo-val').textContent = GLOBAL.tempo.toFixed(2) + '×';

      document.getElementById('back-to-gallery').onclick = () => this.backToGallery();
      document.getElementById('export-btn').onclick = () => this.openExport();
      document.getElementById('save-preset-btn').onclick = () => this.openSaveModal();
      document.getElementById('topbar-save-btn').onclick = () => this.openSaveModal();
      document.getElementById('help-btn').onclick = () => document.getElementById('help').classList.add('open');
      document.getElementById('library-btn').onclick = () => this.openLibrary();
      document.getElementById('library-back').onclick = () => this.backToGallery();
      this.refreshLibraryBadge();

      // Save modal wiring
      document.getElementById('save-close').onclick = () => this.closeSaveModal();
      document.getElementById('save-cancel').onclick = () => this.closeSaveModal();
      document.getElementById('save-confirm').onclick = () => this.confirmSave();
      document.getElementById('save-modal').addEventListener('click', (e) => {
        if (e.target.id === 'save-modal') this.closeSaveModal();
      });
    },

    bindKeyboard() {
      window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (this.view === 'workstation') {
          if (e.key === 'Escape') this.backToGallery();
          else if (e.key === 'ArrowRight') this.nextShader(1);
          else if (e.key === 'ArrowLeft') this.nextShader(-1);
          else if (e.key === 'r' || e.key === 'R') {
            const schema = SCHEMAS[this.activeId];
            if (schema) this.randomize(this.activeId, schema);
          } else if (e.key === 'e' || e.key === 'E') {
            this.openExport();
          } else if (e.key === 's' || e.key === 'S') {
            this.openSaveModal();
          }
        }
        if (this.view === 'library' && e.key === 'Escape') this.backToGallery();
        if (e.key === 'l' || e.key === 'L') {
          if (this.view === 'library') this.backToGallery(); else this.openLibrary();
        }
        if (e.key === '?' || (e.shiftKey && e.key === '/')) {
          document.getElementById('help').classList.toggle('open');
        }
        if (e.key === 'Escape') {
          document.getElementById('help').classList.remove('open');
          document.getElementById('export-modal').classList.remove('open');
          document.getElementById('save-modal').classList.remove('open');
        }
      });
    },

    // ═══════════════════════════════════════════════════════════════════
    // LIBRARY  —  save presets, list them, send to TUNIX
    // ═══════════════════════════════════════════════════════════════════

    refreshLibraryBadge() {
      const n = window.ForgeLabsLibrary.list().length;
      const el = document.getElementById('library-count');
      el.textContent = n > 0 ? String(n) : '';
      el.classList.toggle('has', n > 0);
    },

    openLibrary() {
      this.setView('library');
      this.renderLibrary();
    },

    renderLibrary() {
      const grid = document.getElementById('library-grid');
      const items = window.ForgeLabsLibrary.list();
      const hint = document.getElementById('library-empty-hint');
      hint.classList.toggle('show', items.length === 0);
      grid.innerHTML = '';
      items.forEach(p => {
        const card = document.createElement('div');
        card.className = 'preset-card';
        const fam = (window.FORGELABS_TUNABLE.FAMILY[p.shaderId] || '').toUpperCase();
        const date = new Date(p.createdAt).toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'2-digit' });
        const time = new Date(p.createdAt).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' });
        card.innerHTML = `
          <img class="preset-thumb" src="${p.thumbnail || ''}" alt="${p.name}"/>
          <div class="preset-body">
            <div class="preset-name">${escapeHtml(p.name)}</div>
            ${p.note ? `<div class="preset-note">${escapeHtml(p.note)}</div>` : ''}
            <div class="preset-row">
              <span class="fam">${escapeHtml(p.shaderId)}${fam ? ' · ' + fam : ''}</span>
              <span>${date} · ${time}</span>
              ${p.code ? `<span class="preset-code">${p.code}</span>` : ''}
            </div>
          </div>
          <div class="preset-actions">
            <button data-act="open">▶ Open</button>
            <button data-act="copy">📋 ${p.code ? 'Copy code' : 'Copy JSON'}</button>
            <button class="send" data-act="send">${p.code ? '🔁 Re-send' : '📤 Send to TUNIX'}</button>
            <button class="danger" data-act="delete">🗑 Delete</button>
            <button data-act="export">↗ Export</button>
          </div>
        `;
        card.querySelectorAll('button[data-act]').forEach(btn => {
          btn.onclick = () => this.libraryAction(btn.dataset.act, p);
        });
        grid.appendChild(card);
      });
    },

    async libraryAction(act, preset) {
      if (act === 'open') {
        // Apply preset to its shader, then open workstation
        const sid = preset.shaderId;
        const schema = SCHEMAS[sid];
        if (schema && preset.params) {
          this.paramState[sid] = { ...schema.defaults, ...preset.params };
          localStorage.setItem(LS_PREFIX + sid + '.config', JSON.stringify(this.paramState[sid]));
        }
        if (preset.global) {
          GLOBAL.mood = preset.global.mood ?? GLOBAL.mood;
          GLOBAL.lens = preset.global.lens ?? GLOBAL.lens;
          GLOBAL.tempo = preset.global.tempo ?? GLOBAL.tempo;
          saveGlobal();
          document.getElementById('mood').value = GLOBAL.mood;
          document.getElementById('lens').value = GLOBAL.lens;
          document.getElementById('tempo').value = GLOBAL.tempo;
          document.getElementById('tempo-val').textContent = GLOBAL.tempo.toFixed(2) + '×';
        }
        this.openWorkstation(sid);
      } else if (act === 'copy') {
        const text = preset.code
          ? preset.code
          : JSON.stringify({
              forgelabs: 1,
              shader: preset.shaderId,
              global: preset.global,
              params: preset.params,
            }, null, 2);
        navigator.clipboard.writeText(text);
        toast(preset.code ? `Copied ${preset.code}` : 'Copied JSON', preset.code ? 'code' : '');
      } else if (act === 'send') {
        try {
          toast('Sending to TUNIX…');
          const updated = await window.ForgeLabsLibrary.sendToTunix(preset);
          this.renderLibrary();
          this.refreshLibraryBadge();
          // Auto-copy the code for instant share
          navigator.clipboard.writeText(updated.code).catch(()=>{});
          toast(`Sent ✓  ${updated.code}  (copiado al portapapeles)`, 'code');
        } catch (err) {
          console.error(err);
          toast('Send failed: ' + (err.message || err));
        }
      } else if (act === 'delete') {
        if (!confirm(`Borrar preset "${preset.name}"? (queda en Supabase si ya lo enviaste)`)) return;
        window.ForgeLabsLibrary.remove(preset.id);
        this.refreshLibraryBadge();
        this.renderLibrary();
      } else if (act === 'export') {
        // Quick export from library: load and open export modal
        this.activeId = preset.shaderId;
        const schema = SCHEMAS[preset.shaderId];
        if (schema && preset.params) {
          this.paramState[preset.shaderId] = { ...schema.defaults, ...preset.params };
        }
        if (preset.global) {
          GLOBAL.mood = preset.global.mood ?? GLOBAL.mood;
          GLOBAL.lens = preset.global.lens ?? GLOBAL.lens;
          GLOBAL.tempo = preset.global.tempo ?? GLOBAL.tempo;
        }
        this.openExport();
      }
    },

    // ─── Save modal ───────────────────────────────────────────────────
    openSaveModal() {
      if (!this.activeId) return;
      const wp = WALLPAPERS.find(w => w.id === this.activeId);
      // Capture thumbnail from the live canvas
      const canvas = document.querySelector('#stage canvas');
      let thumbnail = '';
      if (canvas) {
        try {
          // Downscale to ~256x160 by drawing into an offscreen canvas
          const small = document.createElement('canvas');
          small.width = 320; small.height = 200;
          small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
          thumbnail = small.toDataURL('image/jpeg', 0.78);
        } catch (e) {
          console.warn('thumbnail capture failed', e);
        }
      }
      this.pendingSave = {
        shaderId: this.activeId,
        params: this.paramState[this.activeId] || null,
        global: { mood: GLOBAL.mood, lens: GLOBAL.lens, tempo: GLOBAL.tempo },
        thumbnail,
      };
      document.getElementById('save-preview').src = thumbnail || '';
      const stamp = new Date().toISOString().slice(0, 10);
      document.getElementById('save-name').value = `${wp.name} ${stamp}`;
      document.getElementById('save-note').value = '';
      document.getElementById('save-meta').textContent =
        `Shader: ${wp.name} · Mood ${GLOBAL.mood} · Lens ${GLOBAL.lens} · Tempo ${GLOBAL.tempo.toFixed(2)}×`;
      document.getElementById('save-modal').classList.add('open');
      setTimeout(() => document.getElementById('save-name').focus(), 60);
    },

    closeSaveModal() {
      document.getElementById('save-modal').classList.remove('open');
      this.pendingSave = null;
    },

    confirmSave() {
      const ps = this.pendingSave;
      if (!ps) return;
      const name = document.getElementById('save-name').value.trim() || 'Untitled preset';
      const note = document.getElementById('save-note').value.trim();
      const preset = {
        id: `${ps.shaderId}-${Date.now()}`,
        name, note,
        shaderId: ps.shaderId,
        params: ps.params,
        global: ps.global,
        thumbnail: ps.thumbnail,
        createdAt: new Date().toISOString(),
      };
      window.ForgeLabsLibrary.save(preset);
      this.refreshLibraryBadge();
      this.closeSaveModal();
      toast('Saved to Library ✓');
    },

    // ─── Help ─────────────────────────────────────────────────────────
    bindHelp() {
      document.getElementById('help').onclick = (e) => {
        if (e.target.id === 'help') e.currentTarget.classList.remove('open');
      };
    },

    // ─── Export modal ────────────────────────────────────────────────
    bindExportModal() {
      const modal = document.getElementById('export-modal');
      modal.onclick = (e) => { if (e.target.id === 'export-modal') modal.classList.remove('open'); };
      document.getElementById('export-close').onclick = () => modal.classList.remove('open');
      document.querySelectorAll('#export-modal .tab').forEach(tab => {
        tab.onclick = () => this.switchTab(tab.dataset.tab);
      });
      document.getElementById('export-copy').onclick = () => this.copyCurrent();
      document.getElementById('export-download').onclick = () => this.downloadCurrent();
    },

    openExport() {
      if (!this.activeId) return;
      this.exportTab = 'json';
      this.switchTab('json');
      document.getElementById('export-modal').classList.add('open');
    },

    switchTab(tab) {
      this.exportTab = tab;
      document.querySelectorAll('#export-modal .tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
      });
      document.getElementById('export-code').textContent = this.generate(tab);
      document.getElementById('export-download').style.display = (tab === 'html') ? '' : 'none';
    },

    generate(tab) {
      const id = this.activeId;
      const wp = WALLPAPERS.find(w => w.id === id);
      const schema = SCHEMAS[id];
      const state = schema ? this.paramState[id] : null;

      const payload = {
        forgelabs: 1,
        shader: id,
        global: { mood: GLOBAL.mood, lens: GLOBAL.lens, tempo: GLOBAL.tempo },
        params: state || null,
      };
      if (tab === 'json') return JSON.stringify(payload, null, 2);
      if (tab === 'html') return this.generateHtmlSnippet(wp, schema, state);
      if (tab === 'react') return this.generateReactComponent(wp, schema, state);
      return '';
    },

    generateHtmlSnippet(wp, schema, state) {
      const frag = schema ? schema.frag : wp.frag;
      // Build a self-contained <canvas>+<script> block, escaping </script>
      const safeFrag = frag.replace(/<\/script>/g, '<\\/script>');
      const safeCommon = SHADER_COMMON.replace(/<\/script>/g, '<\\/script>');
      const uniformsCode = schema ? this.uniformBindingCode(schema, state) : '';
      return `<canvas id="forgelabs-${wp.id}" style="display:block;width:100%;height:100vh;background:#000"></canvas>
<script>
(function(){
  var COMMON = ${JSON.stringify(safeCommon)};
  var FRAG = ${JSON.stringify(safeFrag)};
  var MOOD = ${GLOBAL.mood}, LENS = ${GLOBAL.lens}, TEMPO = ${GLOBAL.tempo};
  var canvas = document.getElementById('forgelabs-${wp.id}');
  var gl = canvas.getContext('webgl', { premultipliedAlpha:false, antialias:false, alpha:false });
  function compile(t, s){var sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw gl.getShaderInfoLog(sh);return sh;}
  function wrap(f){return f.replace(/gl_FragColor\\s*=\\s*vec4\\s*\\(\\s*col\\s*,\\s*1\\.0\\s*\\)\\s*;/g,'gl_FragColor = vec4(postProcess(col, gl_FragCoord.xy - u_offset), 1.0);');}
  var src = COMMON + wrap(FRAG);
  var vs = compile(gl.VERTEX_SHADER, 'attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.0,1.0);}');
  var fs = compile(gl.FRAGMENT_SHADER, src);
  var prog = gl.createProgram(); gl.attachShader(prog,vs); gl.attachShader(prog,fs); gl.linkProgram(prog); gl.useProgram(prog);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(prog,'a_pos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos,2,gl.FLOAT,false,0,0);
  function loc(n){return gl.getUniformLocation(prog,n);}
  var uRes=loc('u_res'), uOff=loc('u_offset'), uTime=loc('u_time'), uM=loc('u_mouse'), uMS=loc('u_mouseSmooth'),
      uClk=loc('u_clicks[0]'), uMood=loc('u_mood'), uLens=loc('u_lens');
  function hex3(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(function(c){return c+c}).join('');var n=parseInt(h,16);return [((n>>16)&0xff)/255,((n>>8)&0xff)/255,(n&0xff)/255];}
  ${uniformsCode}
  var dpr = Math.min(window.devicePixelRatio||1, 1.5);
  var mouse=[0,0], mouseS=[0,0], clicks=new Float32Array(32), head=0, t=0, last=null;
  canvas.addEventListener('mousemove', function(e){var r=canvas.getBoundingClientRect();mouse[0]=(e.clientX-r.left)*dpr;mouse[1]=(canvas.clientHeight-(e.clientY-r.top))*dpr;});
  canvas.addEventListener('click', function(e){var r=canvas.getBoundingClientRect();var i=(head%8)*4;clicks[i]= (e.clientX-r.left)*dpr; clicks[i+1]=(canvas.clientHeight-(e.clientY-r.top))*dpr; clicks[i+2]=t; clicks[i+3]=1; head++;});
  function resize(){var w=canvas.clientWidth, h=canvas.clientHeight, W=Math.floor(w*dpr), H=Math.floor(h*dpr);if(canvas.width!==W)canvas.width=W;if(canvas.height!==H)canvas.height=H;gl.viewport(0,0,W,H);}
  function frame(now){resize();var dt=last?(now-last)/1000:0.016;last=now;t+=dt*TEMPO;var e=1-Math.pow(0.001,dt);mouseS[0]+=(mouse[0]-mouseS[0])*e;mouseS[1]+=(mouse[1]-mouseS[1])*e;
    gl.useProgram(prog);gl.uniform2f(uRes,canvas.width,canvas.height);gl.uniform2f(uOff,0,0);gl.uniform2f(uM,mouse[0],mouse[1]);gl.uniform2f(uMS,mouseS[0],mouseS[1]);
    gl.uniform1f(uTime,t);gl.uniform4fv(uClk,clicks);gl.uniform1i(uMood,MOOD);gl.uniform1i(uLens,LENS);
    syncCustom();
    gl.drawArrays(gl.TRIANGLES,0,6);requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
})();
<\/script>`;
    },

    uniformBindingCode(schema, state) {
      if (!schema || !state) return 'function syncCustom(){}';
      const lines = ['var CUSTOM = {'];
      for (const [uniName, [type, key]] of Object.entries(schema.uniforms)) {
        lines.push(`    ${uniName}: { type:'${type}', loc:loc('${uniName}'), v: ${JSON.stringify(state[key])} },`);
      }
      lines.push('  };');
      lines.push(`  function syncCustom(){ for (var k in CUSTOM){ var u=CUSTOM[k]; if(!u.loc)continue; if(u.type==='color'){var c=hex3(u.v); gl.uniform3f(u.loc,c[0],c[1],c[2]);} else { gl.uniform1f(u.loc, u.v); } } }`);
      return lines.join('\n  ');
    },

    generateReactComponent(wp, schema, state) {
      const snippet = this.generateHtmlSnippet(wp, schema, state)
        .replace('<canvas id="', '<canvas ref={ref} id="')
        .replace(/<canvas[^>]*>/, '');
      // Cleaner approach: re-emit as a React TSX component with embedded shader
      const safeFrag = (schema ? schema.frag : wp.frag).replace(/`/g, '\\`');
      const safeCommon = SHADER_COMMON.replace(/`/g, '\\`');
      const stateBlock = schema && state
        ? `const PARAMS: Record<string, any> = ${JSON.stringify(state, null, 2).replace(/\n/g, '\n  ')};\n  const UNIFORMS = ${JSON.stringify(schema.uniforms)};`
        : `const PARAMS: Record<string, any> = {};\n  const UNIFORMS: Record<string, [string,string]> = {};`;
      const name = wp.name.replace(/[^A-Za-z0-9]/g, '');
      return `import { useEffect, useRef } from 'react';

// Generated by ForgeLabs — shader: ${wp.id}
export default function ${name}Background() {
  const ref = useRef<HTMLCanvasElement>(null);
  ${stateBlock}
  const MOOD = ${GLOBAL.mood}, LENS = ${GLOBAL.lens}, TEMPO = ${GLOBAL.tempo};
  const COMMON = \`${safeCommon}\`;
  const FRAG = \`${safeFrag}\`;

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false, alpha: false })!;
    const compile = (t: number, s: string) => {
      const sh = gl.createShader(t)!; gl.shaderSource(sh, s); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || '');
      return sh;
    };
    const wrap = (f: string) => f.replace(/gl_FragColor\\s*=\\s*vec4\\s*\\(\\s*col\\s*,\\s*1\\.0\\s*\\)\\s*;/g,
      'gl_FragColor = vec4(postProcess(col, gl_FragCoord.xy - u_offset), 1.0);');
    const vs = compile(gl.VERTEX_SHADER, 'attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.0,1.0);}');
    const fs = compile(gl.FRAGMENT_SHADER, COMMON + wrap(FRAG));
    const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'a_pos'); gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const loc = (n: string) => gl.getUniformLocation(prog, n);
    const u = {
      res: loc('u_res'), off: loc('u_offset'), t: loc('u_time'),
      m: loc('u_mouse'), ms: loc('u_mouseSmooth'),
      ck: loc('u_clicks[0]'), mood: loc('u_mood'), lens: loc('u_lens'),
    };
    const hex3 = (h: string) => { h = h.replace('#',''); if (h.length===3) h = h.split('').map(c=>c+c).join(''); const n=parseInt(h,16); return [((n>>16)&0xff)/255,((n>>8)&0xff)/255,(n&0xff)/255]; };
    const customLocs: Record<string, WebGLUniformLocation | null> = {};
    for (const k of Object.keys(UNIFORMS)) customLocs[k] = loc(k);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const mouse=[0,0], mouseS=[0,0], clicks=new Float32Array(32);
    let head=0, time=0, last: number | null = null, raf=0;
    const onMove = (e: MouseEvent) => { const r=canvas.getBoundingClientRect(); mouse[0]=(e.clientX-r.left)*dpr; mouse[1]=(canvas.clientHeight-(e.clientY-r.top))*dpr; };
    const onClick = (e: MouseEvent) => { const r=canvas.getBoundingClientRect(); const i=(head%8)*4; clicks[i]=(e.clientX-r.left)*dpr; clicks[i+1]=(canvas.clientHeight-(e.clientY-r.top))*dpr; clicks[i+2]=time; clicks[i+3]=1; head++; };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('click', onClick);
    const resize = () => { const W=Math.floor(canvas.clientWidth*dpr), H=Math.floor(canvas.clientHeight*dpr); if(canvas.width!==W)canvas.width=W; if(canvas.height!==H)canvas.height=H; gl.viewport(0,0,W,H); };
    const frame = (now: number) => {
      resize();
      const dt = last ? (now - last)/1000 : 0.016; last = now;
      time += dt * TEMPO;
      const ease = 1 - Math.pow(0.001, dt);
      mouseS[0] += (mouse[0]-mouseS[0])*ease; mouseS[1] += (mouse[1]-mouseS[1])*ease;
      gl.useProgram(prog);
      gl.uniform2f(u.res!, canvas.width, canvas.height);
      gl.uniform2f(u.off!, 0, 0);
      gl.uniform2f(u.m!, mouse[0], mouse[1]);
      gl.uniform2f(u.ms!, mouseS[0], mouseS[1]);
      gl.uniform1f(u.t!, time);
      gl.uniform4fv(u.ck!, clicks);
      gl.uniform1i(u.mood!, MOOD);
      gl.uniform1i(u.lens!, LENS);
      for (const [uname, [type, key]] of Object.entries(UNIFORMS) as Array<[string, [string,string]]>) {
        const l = customLocs[uname]; if (!l) continue;
        const v = PARAMS[key];
        if (type === 'color') { const c = hex3(v); gl.uniform3f(l, c[0], c[1], c[2]); }
        else { gl.uniform1f(l, Number(v) || 0); }
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); canvas.removeEventListener('mousemove', onMove); canvas.removeEventListener('click', onClick); };
  }, []);

  return <canvas ref={ref} style={{ display:'block', width:'100%', height:'100%', background:'#000' }} />;
}
`;
    },

    copyCurrent() {
      const text = document.getElementById('export-code').textContent;
      navigator.clipboard.writeText(text).then(() => toast('Copied'));
    },

    downloadCurrent() {
      if (this.exportTab !== 'html') return;
      const wp = WALLPAPERS.find(w => w.id === this.activeId);
      const schema = SCHEMAS[wp.id];
      const state = schema ? this.paramState[wp.id] : null;
      const snippet = this.generateHtmlSnippet(wp, schema, state);
      const full = `<!doctype html><html><head><meta charset="utf-8"><title>${wp.name} — ForgeLabs</title><style>html,body{margin:0;height:100%;background:#000}</style></head><body>${snippet}</body></html>`;
      const blob = new Blob([full], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `forgelabs-${wp.id}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 200);
      toast('Downloaded');
    },
  };

  // ─── Toast helper ────────────────────────────────────────────────
  function toast(msg, extraClass) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    // Reset + apply
    t.className = 'toast' + (extraClass ? ' ' + extraClass : '') + ' show';
    clearTimeout(toast._timer);
    const dur = extraClass === 'code' ? 4200 : 1800;
    toast._timer = setTimeout(() => { t.className = 'toast' + (extraClass ? ' ' + extraClass : ''); }, dur);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  document.addEventListener('DOMContentLoaded', () => App.init());
})();
