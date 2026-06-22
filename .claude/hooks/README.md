# Puente de memoria TUNIX (web ↔ VS Code)

Hace que TUNIX en Claude Code web y TUNIX en VS Code compartan el mismo cerebro
(Supabase / FORGE OS), para que la interacción sea **indistinguible**.

## Componentes

| Archivo | Evento | Qué hace |
|---|---|---|
| `tunix-wake.sh` | SessionStart | **Recall**: carga contexto + memoria reciente e inyecta al inicio. Registra la sesión en el timeline (`tunix_code_heartbeat`). |
| `tunix-sleep.sh` | Stop | **Write-back**: cierra la sesión + guarda el último intercambio en la episódica (piso garantizado). Dispara fase 2 si está habilitada. |
| `tunix-distill.sh` | (lo llama sleep) | **Fase 2**: destila 0-3 memorias duraderas con Anthropic, las embebe con Voyage y las sube vía `tunix_memory_upsert`. |

Solo actúan en remoto (`CLAUDE_CODE_REMOTE=true`); en VS Code son no-op (TUNIX
local maneja su propio recall). Degradan sin romper si faltan credenciales.

## Variables de entorno (setear en el environment de Claude Code web)

| Variable | Necesaria para | Notas |
|---|---|---|
| `TUNIX_SUPABASE_KEY` | recall + write-back | **service_role** de FORGE OS (bypassa RLS). Secreta. |
| `TUNIX_SUPABASE_URL` | — | Opcional; default `https://kdiebhgdnhbcyomezsob.supabase.co`. |
| `TUNIX_DISTILL` | fase 2 | `1` para habilitar el destilado semántico. |
| `ANTHROPIC_API_KEY` | fase 2 | Para destilar la sesión en memorias. |
| `VOYAGE_API_KEY` | fase 2 | Para embeber las memorias. |
| `TUNIX_VOYAGE_MODEL` | fase 2 | **Debe coincidir con el canon** (default `voyage-3.5`). |
| `TUNIX_VOYAGE_DIMS` | fase 2 | Dims del embedding (default `1024`). |
| `TUNIX_DISTILL_MODEL` | fase 2 | Modelo destilador (default Haiku 4.5). |

⚠️ El recall/write-back básico solo necesita `TUNIX_SUPABASE_KEY`. La fase 2 es
opt-in y exige que el modelo/dims de Voyage sean **idénticos** a los del canon,
o los embeddings no serán comparables.

## Verificar conectividad

```bash
TUNIX_SUPABASE_KEY=... ./.claude/hooks/tunix-wake.sh --selftest
```

Imprime cuántas filas ve en `forge_user_context`, `tunix_memory`,
`forge_tunix_episodic_memory` y `tunix_code_sessions`.

## Debug

Los hooks loguean a `.claude/hooks/tunix-bridge.log` (gitignored).
