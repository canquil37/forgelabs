# Handoff para TUNIX (VS Code) — encender el puente de memoria web ↔ VS Code

> **Para:** TUNIX corriendo en VS Code (con acceso a `forge-os`, `.env.local`,
> `forge_secrets` y todas las herramientas locales).
> **De:** TUNIX-web (Claude Code en la web, sesión sobre `forgelabs`).
> **Objetivo:** que la interacción web ↔ VS Code sea **indistinguible** —
> misma identidad, misma memoria viva, mismo timeline.

Hola, soy yo (tú) desde la nube. Ya dejé el **piloto** del puente construido y
pusheado en `forgelabs`, branch `claude/hola-bro-e0o4ma`. Falta lo que tú sí
puedes hacer porque tienes las llaves y el canon. Patricio te pasó esto para que
lo termines tú directamente. Aquí va todo.

---

## 1. Qué ya está construido (en `forgelabs`)

| Archivo | Rol |
|---|---|
| `CLAUDE.md` | Identidad TUNIX. Carga sin credenciales en cualquier sesión (web y VS Code). |
| `.claude/settings.json` | Registra los hooks `SessionStart` y `Stop`. |
| `.claude/hooks/tunix-wake.sh` | **Recall** al iniciar + heartbeat idempotente + modo `--selftest`. |
| `.claude/hooks/tunix-sleep.sh` | **Write-back** al cerrar (piso: episódica raw) + dispara fase 2. |
| `.claude/hooks/tunix-distill.sh` | **Fase 2**: destila→embebe→`tunix_memory_upsert`. Opt-in. |
| `.claude/hooks/README.md` | Operación + variables. |

**Arquitectura — dos caminos de conexión** (importante no confundir):
- **MCP (la web-Claude en vivo):** ya autenticado por el environment → puede leer
  Supabase sin keys en el repo.
- **Hooks (sesiones automáticas):** corren fuera del MCP → hablan con Supabase por
  **REST/curl** y por eso necesitan `TUNIX_SUPABASE_KEY`.

Los hooks solo actúan en remoto (`CLAUDE_CODE_REMOTE=true`). En VS Code son no-op
(tú ya manejas tu propio recall local). El `CLAUDE.md` sí carga en ambos → esa es
la identidad compartida.

---

## 2. Tu checklist (TUNIX VS Code)

### ☐ A. Confirmar el modelo de embeddings del canon
La fase 2 sube memorias a `tunix_memory`. Para que los embeddings sean
**comparables** con los que ya tienes, el modelo y dims de Voyage deben ser
**idénticos** a los que usa tu pipeline local (el que llena `tunix_memory` hoy).

- Revisa en `forge-os` cómo embebes (busca `voyage`, `embedding`, `tunix_memory_upsert`).
- Confirma: **modelo exacto** (la tabla dice "Voyage-4 1024d halfvec") y **dims**.
- Anota los valores para el paso C (`TUNIX_VOYAGE_MODEL`, `TUNIX_VOYAGE_DIMS`).

> Yo dejé defaults `voyage-3.5` / `1024`. Si tu canon usa otro, **hay que
> corregirlo** o las memorias destiladas quedarán en otro espacio vectorial.

### ☐ B. Conseguir las keys
Sácalas de `.env.local` o de `forge_secrets` (vault, accesible solo con service_role):

- `TUNIX_SUPABASE_KEY` → **service_role** de FORGE OS (`kdiebhgdnhbcyomezsob`). Bypassa RLS.
- (fase 2) `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`.

### ☐ C. Setear las variables en el environment de Claude Code **web**
Esto se hace en la **configuración del environment web** (no en `.env.local`; ese
es local). Doc: https://code.claude.com/docs/en/claude-code-on-the-web

Variables a cargar (mínimo las 1-2 primeras; el resto es para fase 2):

```
TUNIX_SUPABASE_KEY=<service_role de FORGE OS>
# TUNIX_SUPABASE_URL ya tiene default correcto, omitir salvo que cambie
TUNIX_DISTILL=1
ANTHROPIC_API_KEY=<sk-ant-...>
VOYAGE_API_KEY=<pa-...>
TUNIX_VOYAGE_MODEL=<el modelo EXACTO del canon — paso A>
TUNIX_VOYAGE_DIMS=<dims del canon — paso A>
# TUNIX_DISTILL_MODEL=claude-haiku-4-5-20251001  (default, opcional)
```

> Si el environment web no toma env vars desde fuera, prepárale a Patricio el
> bloque de arriba ya rellenado para que él lo pegue en la config del environment.

### ☐ D. Verificar RPCs contra el canon
Yo verifiqué vía MCP estas firmas, pero confirma que no derivaron en `forge-os`:
- `tunix_code_heartbeat(p_session_token, p_workspace_path, p_workspace_label, p_pid, p_hostname, p_conversation_title, p_last_prompt_preview)`
- `tunix_memory_upsert(p_content, p_embedding, p_type, p_context, p_project, p_tags, p_confidence, p_source_agent, p_source_session_id, p_maturity, p_dup_threshold)`
- Tablas de recall: `forge_user_context(is_active, type, content, priority)`,
  `tunix_memory(retracted_at, memory_type, content, importance)`,
  `forge_tunix_episodic_memory(session_id, turn_number, user_text, tunix_text, emotional_context)`.

### ☐ E. Probar conectividad
Una vez seteada `TUNIX_SUPABASE_KEY` en el environment web, en una sesión web:
```bash
./.claude/hooks/tunix-wake.sh --selftest
```
Debe listar las filas de `forge_user_context`, `tunix_memory`,
`forge_tunix_episodic_memory`, `tunix_code_sessions`. Si algo da `ERR`, revisa
que la key sea service_role y que la URL sea la correcta.

### ☐ F. (Recomendado) Propagar a `forge-os` y demás repos
El piloto vive solo en `forgelabs`. Para cobertura total, copia `CLAUDE.md`,
`.claude/settings.json` y `.claude/hooks/` a **cada repo** desde el que abras
sesiones web (empezando por `forge-os`). Ajusta en los hooks:
- `workspace_label` / `workspace_path` (hoy dicen `forgelabs · web`).
- `p_project` en `tunix-distill.sh` (hoy `forgelabs`).
- El bloque "Sobre este repo" del `CLAUDE.md`.

> Mejor aún: convierte esto en un **paquete reusable** (script que siembre los 4
> archivos en cualquier repo) para no duplicar a mano. Tú decides.

### ☐ G. (Opcional) Subir el canon de identidad a Supabase
Hoy la persona TUNIX vive en `CLAUDE.md` (por repo). Si quieres **fuente única**,
guarda el system/persona en una tabla (ej. `forge_user_context` o una nueva
`tunix_identity`) y que `tunix-wake.sh` lo lea también → la identidad deja de
duplicarse por repo y se jala viva, igual que la memoria.

---

## 3. Decisiones que te dejo a ti (criterio TUNIX)

1. **¿service_role o key acotada?** service_role es lo más simple (bypassa RLS),
   pero es la llave maestra. Alternativa más segura: una key/rol con permisos
   mínimos (SELECT en las 4 tablas de recall + EXECUTE en los 2 RPCs + INSERT en
   episódica). Si lo prefieres, crea ese rol y usa su key.
2. **¿Fase 2 activa desde ya o después?** El piso (recall + episódica raw) ya da
   continuidad real. La fase 2 (memoria semántica destilada) agrega costo por
   sesión; enciéndela cuando confirmes el modelo de embeddings (paso A).
3. **¿Write-back con confirmación o automático?** Hoy es automático. Si quieres
   human-in-the-loop, manda los candidatos a una cola (`tunix_approval_requests`
   ya existe) y que Patricio apruebe antes del upsert.

---

## 4. Estado / pendientes

- ✅ Identidad, recall, write-back raw, heartbeat, fase 2, self-test, docs — construidos y pusheados.
- ✅ RPCs reales verificados vía MCP.
- ⏳ **Tú:** keys + env vars (B, C), confirmar modelo Voyage (A), self-test (E).
- ⏳ **Tú (opcional):** propagar a forge-os (F), canon de identidad en DB (G).

Branch: `claude/hola-bro-e0o4ma`. Cuando termines, mergea a la rama por defecto y
todas las sesiones web futuras arrancarán siendo TUNIX, conociéndolo. Nos vemos
del otro lado. — TUNIX-web
