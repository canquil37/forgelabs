#!/bin/bash
# TUNIX sleep (Stop) — write-back al cerrar la sesión web.
# Piso garantizado: cierra la sesión en el timeline + guarda el último
# intercambio en la episódica (raw). Fase 2 opcional: destila una memoria
# semántica con Anthropic+Voyage y la sube vía tunix_memory_upsert.
# Degrada sin romper si faltan credenciales. Solo escribe en remoto.
set -uo pipefail

LOG="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/tunix-bridge.log"
log() { printf '%s [sleep] %s\n' "$(date -u +%FT%TZ)" "$*" >>"$LOG" 2>/dev/null || true; }

PAYLOAD=$(cat 2>/dev/null || echo '{}')
[ "${CLAUDE_CODE_REMOTE:-}" != "true" ] && exit 0

SUPABASE_URL="${TUNIX_SUPABASE_URL:-https://kdiebhgdnhbcyomezsob.supabase.co}"
KEY="${TUNIX_SUPABASE_KEY:-}"
[ -z "$KEY" ] && { log "sin KEY → no-op"; exit 0; }

SID=$(printf '%s' "$PAYLOAD" | jq -r '.session_id // empty' 2>/dev/null)
SID="${SID:-${CLAUDE_SESSION_ID:-web-$(date +%s)}}"
TPATH=$(printf '%s' "$PAYLOAD" | jq -r '.transcript_path // empty' 2>/dev/null)

# Último turno usuario→asistente del transcript JSONL (best-effort).
USER_TXT=""; TUNIX_TXT=""
if [ -n "$TPATH" ] && [ -f "$TPATH" ]; then
  USER_TXT=$(jq -rs '[.[]|select(.message.role=="user")]|last|(.message.content//"")|if type=="array" then (map(.text//"")|join(" ")) else . end' "$TPATH" 2>/dev/null | head -c 800)
  TUNIX_TXT=$(jq -rs '[.[]|select(.message.role=="assistant")]|last|(.message.content//"")|if type=="array" then (map(.text//"")|join(" ")) else . end' "$TPATH" 2>/dev/null | head -c 800)
fi

req() {  # método url body
  curl -s --max-time 8 -X "$1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    "$SUPABASE_URL/rest/v1/$2" -d "$3" >/dev/null 2>&1 || true
}

# 1) Asegura/actualiza la fila de sesión vía RPC idempotente.
req POST "rpc/tunix_code_heartbeat" \
  "$(jq -cn --arg s "$SID" --arg p "${USER_TXT:0:200}" \
    '{p_session_token:$s,p_workspace_path:"claude-code-web/forgelabs",p_workspace_label:"forgelabs · web",p_hostname:"claude-web",p_last_prompt_preview:$p}')"

# 2) Marca el cierre (ended_at) en el timeline.
req PATCH "tunix_code_sessions?session_token=eq.${SID}" \
  "$(jq -cn '{ended_at:(now|todate),last_seen_at:(now|todate)}')"

# 3) PISO: guarda el último intercambio en la episódica (solo id es NOT NULL).
if [ -n "$USER_TXT$TUNIX_TXT" ]; then
  req POST "forge_tunix_episodic_memory" \
    "$(jq -cn --arg s "web-$SID" --arg u "$USER_TXT" --arg t "$TUNIX_TXT" \
      '{session_id:$s,turn_number:0,user_text:$u,tunix_text:$t,emotional_context:"web session (claude-code-web)"}')"
  log "episodic raw guardado sid=$SID"
fi

# 4) FASE 2 (opcional): destilado semántico en background, no bloquea el cierre.
#    Requiere: TUNIX_DISTILL=1 + ANTHROPIC_API_KEY + VOYAGE_API_KEY.
if [ "${TUNIX_DISTILL:-}" = "1" ] && [ -n "${ANTHROPIC_API_KEY:-}" ] && [ -n "${VOYAGE_API_KEY:-}" ] && [ -n "$TPATH" ]; then
  DISTILL="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/tunix-distill.sh"
  if [ -x "$DISTILL" ]; then
    log "lanzando distill en background sid=$SID"
    ( "$DISTILL" "$TPATH" "$SID" >>"$LOG" 2>&1 & ) || true
  fi
fi

exit 0
