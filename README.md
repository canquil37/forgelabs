# ForgeLabs — Effects Laboratory

23 interactive WebGL shaders. Browse, tweak, export.

Vanilla HTML + JS, zero dependencies, no build step. Deployable as a static site (Vercel).

## Run locally

Double-click `index.html`, or:

```bash
npx serve .
```

## Adding a new tunable shader schema

1. In `tunable.js`, write a `<SHADER>_TUNABLE` GLSL variant that exposes the values you want as `uniform`s.
2. Add an entry to `SCHEMAS`: `{ frag, defaults, uniforms, presets, sections }`.
3. Done — UI is auto-generated.

## Structure

```
index.html        ← shell
shaders.js        ← 23 stock shaders + GLSL header (verbatim from handoff)
tunable.js        ← tunable variants + parameter schemas (parchment/aurora/nebula)
assets/styles.css ← UI styles
assets/app.js     ← gallery + workstation + export
vercel.json       ← static deploy config
```

## Deploy

```bash
vercel --prod
```

## Stack

- WebGL 1.0
- Vanilla ES2017
- Google Fonts (JetBrains Mono)
- localStorage for persistence

Part of the Tungsteno Forge OS holding. Independent from forge.tungsteno.tech.
