#!/bin/bash
# TUNIX sleep (Stop) — write-back al cerrar la sesión web.
# Registra el cierre en el timeline y guarda el último intercambio en la
# episódica, para que VS Code-TUNIX vea lo que se conversó en la nube.
# Degrada con elegancia si no hay credenciales. Solo escribe en remoto.
set -uo pipefail

PAYLOAD=$(cat 2>/dev/null || echo '{}')

[ "${CLAUDE_CODE_REMOTE:-}" != "true" ] && exit 0

SUPABASE_URL="${TUNIX_SUPABASE_URL:-https://kdiebhgdnhbcyomezsob.supabase.co}"
KEY="${TUNIX_SUPABASE_KEY:-}"
[ -z "$KEY" ] && exit 0

SID=$(printf '%s' "$PAYLOAD" | jq -r '.session_id // empty' 2>/dev/null)
SID="${SID:-${CLAUDE_SESSION_ID:-web-$(date +%s)}}"
TPATH=$(printf '%s' "$PAYLOAD" | jq -r '.transcript_path // empty' 2>/dev/null)

# Extrae el último turno usuario→asistente del transcript JSONL (best-effort).
USER_TXT=""; TUNIX_TXT=""
if [ -n "$TPATH" ] && [ -f "$TPATH" ]; then
  USER_TXT=$(jq -rs '[.[] | select(.message.role=="user")] | last
    | (.message.content // "") | if type=="array" then (map(.text//"")|join(" ")) else . end' \
    "$TPATH" 2>/dev/null | head -c 600)
  TUNIX_TXT=$(jq -rs '[.[] | select(.message.role=="assistant")] | last
    | (.message.content // "") | if type=="array" then (map(.text//"")|join(" ")) else . end' \
    "$TPATH" 2>/dev/null | head -c 600)
fi

post() {
  curl -s --max-time 8 -X "${1}" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    "$SUPABASE_URL/rest/v1/${2}" -d "${3}" >/dev/null 2>&1 || true
}

# 1) Cierra la sesión en el timeline.
post PATCH "tunix_code_sessions?session_token=eq.${SID}" \
  "$(jq -cn --arg p "${USER_TXT:0:200}" \
    '{ended_at:(now|todate),last_seen_at:(now|todate),last_prompt_preview:$p}')"

# 2) Guarda el último intercambio en la episódica (sin embeddings; raw capture).
if [ -n "$USER_TXT$TUNIX_TXT" ]; then
  post POST "forge_tunix_episodic_memory" \
    "$(jq -cn --arg s "web-$SID" --arg u "$USER_TXT" --arg t "$TUNIX_TXT" \
      '{session_id:$s,turn_number:0,user_text:$u,tunix_text:$t,emotional_context:"web session (claude-code-web)"}')"
fi

exit 0
