// ForgeLabs — Library: save / list / delete presets locally, and
// optionally push them to Supabase so TUNIX can pull by short code.
//
// localStorage key:  forgelabs.library  →  [Preset, Preset, ...]
//
// Preset shape:
// {
//   id:        'aurora-1716345678901',        // local unique id
//   name:      'Aurora Sunset',
//   note:      'para landing tensormed',
//   shaderId:  'aurora',
//   params:    { ... }    // null if no schema
//   global:    { mood:0, lens:0, tempo:1.0 },
//   thumbnail: 'data:image/png;base64,...',   // small (256×160)
//   createdAt: '2026-05-21T20:42:00.000Z',
//   code:      'fl-A3F9K2'                    // present once sent to TUNIX
// }

(function () {
  'use strict';

  const SUPA_URL = 'https://kdiebhgdnhbcyomezsob.supabase.co';
  const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkaWViaGdkbmhiY3lvbWV6c29iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzNjk2NjAsImV4cCI6MjA3NTk0NTY2MH0.Jfs74adWQtz8LRRlR5FDVA8zSs3p8_i1xJvIrFtWDdY';
  const TABLE = 'forgelabs_saves';
  const LS_KEY = 'forgelabs.library';

  function rid(len) {
    const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1
    let s = '';
    for (let i = 0; i < len; i++) s += ABC[Math.floor(Math.random() * ABC.length)];
    return s;
  }

  const Library = {
    list() {
      try {
        const arr = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
        return Array.isArray(arr) ? arr : [];
      } catch { return []; }
    },

    save(preset) {
      const items = this.list();
      const idx = items.findIndex(x => x.id === preset.id);
      if (idx >= 0) items[idx] = preset; else items.unshift(preset);
      localStorage.setItem(LS_KEY, JSON.stringify(items));
      return preset;
    },

    remove(id) {
      const items = this.list().filter(x => x.id !== id);
      localStorage.setItem(LS_KEY, JSON.stringify(items));
    },

    get(id) {
      return this.list().find(x => x.id === id) || null;
    },

    // POST to Supabase. Returns updated preset (with code).
    async sendToTunix(preset) {
      const code = preset.code || ('fl-' + rid(6));
      const body = {
        code,
        name: preset.name,
        note: preset.note || null,
        shader_id: preset.shaderId,
        params: preset.params || null,
        global: preset.global || null,
        thumbnail: preset.thumbnail || null,
      };
      const res = await fetch(`${SUPA_URL}/rest/v1/${TABLE}?on_conflict=code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPA_ANON,
          'Authorization': 'Bearer ' + SUPA_ANON,
          'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error('Supabase ' + res.status + ': ' + text);
      }
      // Update local copy with code
      preset.code = code;
      this.save(preset);
      return preset;
    },
  };

  window.ForgeLabsLibrary = Library;
})();
