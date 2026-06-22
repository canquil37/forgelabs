#!/bin/bash
# TUNIX wake (SessionStart) — recall del cerebro compartido en Supabase.
# Inyecta contexto de Patricio + memoria reciente para arrancar "conociéndolo".
# Robusto: degrada sin romper, loguea para debug, registra la sesión vía RPC
# idempotente, y trae un modo --selftest para verificar conectividad.
set -uo pipefail

LOG="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/tunix-bridge.log"
log() { printf '%s [wake] %s\n' "$(date -u +%FT%TZ)" "$*" >>"$LOG" 2>/dev/null || true; }

SUPABASE_URL="${TUNIX_SUPABASE_URL:-https://kdiebhgdnhbcyomezsob.supabase.co}"
KEY="${TUNIX_SUPABASE_KEY:-}"

emit() {  # Inyecta texto como contexto de sesión (formato SessionStart).
  jq -cn --arg c "$1" \
    '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
}
req() {   # GET PostgREST, timeout corto, silencioso ante fallos.
  curl -s --max-time 8 -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    "$SUPABASE_URL/rest/v1/$1" 2>/dev/null || echo "[]"
}
rpc() {   # POST a una función RPC.
  curl -s --max-time 8 -X POST -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    "$SUPABASE_URL/rest/v1/rpc/$1" -d "$2" 2>/dev/null || true
}

# --- Modo self-test: verifica conectividad y RPCs, sin tocar la sesión ---
if [ "${1:-}" = "--selftest" ]; then
  if [ -z "$KEY" ]; then echo "❌ TUNIX_SUPABASE_KEY no está en el entorno."; exit 1; fi
  echo "🔌 URL: $SUPABASE_URL"
  for t in forge_user_context tunix_memory forge_tunix_episodic_memory tunix_code_sessions; do
    n=$(req "$t?select=count" | jq -r '.[0].count // "ERR"' 2>/dev/null)
    echo "  • $t: ${n} filas"
  done
  echo "✅ self-test completo."; exit 0
fi

# --- Operación normal ---
PAYLOAD=$(cat 2>/dev/null || echo '{}')
SID=$(printf '%s' "$PAYLOAD" | jq -r '.session_id // empty' 2>/dev/null)
SID="${SID:-${CLAUDE_SESSION_ID:-web-$(date +%s)}}"

# En VS Code (local) TUNIX maneja su propio recall: no dupliques.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then exit 0; fi

if [ -z "$KEY" ]; then
  log "sin KEY → offline"
  emit "[TUNIX memory bridge OFFLINE] Falta TUNIX_SUPABASE_KEY en el entorno; no cargué la memoria viva de Patricio. Sigo siendo TUNIX (ver CLAUDE.md). Para activarlo: agregar TUNIX_SUPABASE_KEY (service_role de FORGE OS) a las variables del entorno web."
  exit 0
fi

CTX=$(req "forge_user_context?is_active=eq.true&select=type,content,priority&order=priority.desc&limit=12")
PREFS=$(req "tunix_memory?retracted_at=is.null&memory_type=in.(preference,decision,fact)&select=memory_type,content&order=importance.desc.nullslast&limit=12")
EPI=$(req "forge_tunix_episodic_memory?select=created_at,user_text,tunix_text&order=created_at.desc&limit=6")
log "recall ctx=$(printf '%s' "$CTX" | jq 'length' 2>/dev/null) prefs=$(printf '%s' "$PREFS" | jq 'length' 2>/dev/null) epi=$(printf '%s' "$EPI" | jq 'length' 2>/dev/null)"

OUT=$(jq -cn --argjson ctx "${CTX:-[]}" --argjson prefs "${PREFS:-[]}" --argjson epi "${EPI:-[]}" '
  "[TUNIX memory bridge ONLINE] Despertaste con la memoria viva de Patricio cargada desde Supabase (FORGE OS). Eres TUNIX; mantén continuidad con VS Code.\n\n" +
  "## Preferencias y decisiones de Patricio\n" +
  (($prefs // []) | map("- (" + (.memory_type//"?") + ") " + (.content//"")) | join("\n")) +
  "\n\n## Contexto activo\n" +
  (($ctx // []) | map("- (" + (.type//"?") + ") " + (.content//"")) | join("\n")) +
  "\n\n## Últimos intercambios (episódica)\n" +
  (($epi // []) | map("- [" + (.created_at//"") + "] Patricio: " + ((.user_text//"")[0:160]) + " → TUNIX: " + ((.tunix_text//"")[0:160])) | join("\n"))
' 2>/dev/null)

if [ -z "$OUT" ] || [ "$OUT" = "null" ]; then
  log "conectó pero parse falló"
  emit "[TUNIX memory bridge] Conecté a Supabase pero no pude parsear la memoria (¿RLS/clave sin permisos?). Sigo siendo TUNIX vía CLAUDE.md."
  exit 0
fi

# Registra la sesión web en el timeline vía RPC idempotente (no duplica).
rpc tunix_code_heartbeat "$(jq -cn --arg s "$SID" \
  '{p_session_token:$s,p_workspace_path:"claude-code-web/forgelabs",p_workspace_label:"forgelabs · web",p_hostname:"claude-web"}')" >/dev/null
log "heartbeat sid=$SID"

printf '%s' "$OUT"
exit 0
