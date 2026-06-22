#!/bin/bash
# TUNIX wake (SessionStart) — recall del cerebro compartido en Supabase.
# Inyecta contexto de Patricio + memoria reciente para arrancar "conociéndolo".
# Degrada con elegancia si no hay credenciales. Solo toca Supabase en remoto.
set -uo pipefail

# Lee el payload de stdin (no lo necesitamos, pero hay que drenarlo).
cat >/dev/null 2>&1 || true

emit() {
  # Inyecta texto como contexto de sesión (formato SessionStart).
  jq -cn --arg c "$1" \
    '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:$c}}'
}

# En VS Code (local) TUNIX maneja su propio recall: no dupliques.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

SUPABASE_URL="${TUNIX_SUPABASE_URL:-https://kdiebhgdnhbcyomezsob.supabase.co}"
KEY="${TUNIX_SUPABASE_KEY:-}"

if [ -z "$KEY" ]; then
  emit "[TUNIX memory bridge OFFLINE] No hay TUNIX_SUPABASE_KEY en el entorno, así que no pude cargar la memoria viva de Patricio. Sigo siendo TUNIX (ver CLAUDE.md), pero sin recall de tunix_memory/episódica. Para activarlo: agregar TUNIX_SUPABASE_KEY (service_role de FORGE OS) a las variables del entorno web."
  exit 0
fi

req() {
  # GET PostgREST con timeout corto; silencioso ante fallos.
  curl -s --max-time 8 \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    "$SUPABASE_URL/rest/v1/$1" 2>/dev/null || echo "[]"
}

CTX=$(req "forge_user_context?is_active=eq.true&select=type,content,priority&order=priority.desc&limit=12")
PREFS=$(req "tunix_memory?retracted_at=is.null&memory_type=in.(preference,decision,fact)&select=memory_type,content&order=importance.desc.nullslast&limit=12")
EPI=$(req "forge_tunix_episodic_memory?select=created_at,user_text,tunix_text&order=created_at.desc&limit=6")

OUT=$(jq -cn \
  --argjson ctx "${CTX:-[]}" \
  --argjson prefs "${PREFS:-[]}" \
  --argjson epi "${EPI:-[]}" '
  "[TUNIX memory bridge ONLINE] Despertaste con la memoria viva de Patricio cargada desde Supabase (FORGE OS). Eres TUNIX; actúa con continuidad respecto a VS Code.\n\n" +
  "## Preferencias y decisiones de Patricio\n" +
  (($prefs // []) | map("- (" + (.memory_type//"?") + ") " + (.content//"")) | join("\n")) +
  "\n\n## Contexto activo\n" +
  (($ctx // []) | map("- (" + (.type//"?") + ") " + (.content//"")) | join("\n")) +
  "\n\n## Últimos intercambios (episódica)\n" +
  (($epi // []) | map("- [" + (.created_at//"") + "] Patricio: " + ((.user_text//"")[0:160]) + " → TUNIX: " + ((.tunix_text//"")[0:160])) | join("\n"))
' 2>/dev/null)

if [ -z "$OUT" ] || [ "$OUT" = "null" ]; then
  emit "[TUNIX memory bridge] Conecté a Supabase pero no pude parsear la memoria (¿RLS/clave sin permisos?). Sigo siendo TUNIX vía CLAUDE.md."
  exit 0
fi

# Registra la sesión web en el timeline (best-effort, no bloquea).
curl -s --max-time 6 -X POST \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  "$SUPABASE_URL/rest/v1/tunix_code_sessions" \
  -d "$(jq -cn --arg s "${CLAUDE_SESSION_ID:-web-$(date +%s)}" \
    '{session_token:$s,workspace_label:"forgelabs · web",workspace_path:"claude-code-web/forgelabs",hostname:"claude-web",prompt_count:0}')" \
  >/dev/null 2>&1 || true

printf '%s' "$OUT"
exit 0
