#!/bin/bash
# TUNIX distill (fase 2) — destilado semántico de una sesión.
# Uso: tunix-distill.sh <transcript_path> <session_id>
# Extrae 0-3 memorias duraderas con Anthropic, las embebe con Voyage y las
# sube vía tunix_memory_upsert (dedup interno). Corre en background desde el
# Stop hook. Opt-in: TUNIX_DISTILL=1 + ANTHROPIC_API_KEY + VOYAGE_API_KEY.
#
# IMPORTANTE: el modelo/dims de Voyage DEBEN coincidir con el canon de TUNIX
# para que los embeddings sean comparables. Config vía:
#   TUNIX_VOYAGE_MODEL (default voyage-3.5)  TUNIX_VOYAGE_DIMS (default 1024)
#   TUNIX_DISTILL_MODEL (default claude-haiku-4-5-20251001)
set -uo pipefail

TPATH="${1:-}"; SID="${2:-unknown}"
LOG="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/tunix-bridge.log"
log() { printf '%s [distill] %s\n' "$(date -u +%FT%TZ)" "$*" >>"$LOG" 2>/dev/null || true; }

SUPABASE_URL="${TUNIX_SUPABASE_URL:-https://kdiebhgdnhbcyomezsob.supabase.co}"
KEY="${TUNIX_SUPABASE_KEY:-}"
AKEY="${ANTHROPIC_API_KEY:-}"
VKEY="${VOYAGE_API_KEY:-}"
VMODEL="${TUNIX_VOYAGE_MODEL:-voyage-3.5}"
VDIMS="${TUNIX_VOYAGE_DIMS:-1024}"
DMODEL="${TUNIX_DISTILL_MODEL:-claude-haiku-4-5-20251001}"

[ -z "$KEY$AKEY$VKEY" ] && { log "faltan keys → abort"; exit 0; }
[ -n "$TPATH" ] && [ -f "$TPATH" ] || { log "transcript inexistente → abort"; exit 0; }

# Transcripción compacta (últimos ~12k chars de texto user/assistant).
CONV=$(jq -rs '[.[]|select(.message.role=="user" or .message.role=="assistant")
  | (.message.role) + ": " + ((.message.content//"")|if type=="array" then (map(.text//"")|join(" ")) else . end)]
  | join("\n")' "$TPATH" 2>/dev/null | tail -c 12000)
[ -z "$CONV" ] && { log "conv vacía → abort"; exit 0; }

PROMPT="Eres el destilador de memoria de TUNIX. Dada esta transcripción de una sesión con Patricio, extrae entre 0 y 3 memorias DURADERAS y útiles a futuro: preferencias de Patricio, decisiones tomadas, hechos del proyecto o lecciones. NO incluyas trivialidades, saludos ni datos efímeros. Si no hay nada digno de recordar, devuelve []. Responde SOLO con un JSON array, sin texto extra: [{\"content\":\"...\",\"type\":\"preference|decision|fact|lesson|pattern\",\"tags\":[\"...\"]}]

TRANSCRIPCIÓN:
$CONV"

# 1) Destilar con Anthropic.
AREQ=$(jq -cn --arg m "$DMODEL" --arg p "$PROMPT" \
  '{model:$m,max_tokens:1024,messages:[{role:"user",content:$p}]}')
ARESP=$(curl -s --max-time 40 https://api.anthropic.com/v1/messages \
  -H "x-api-key: $AKEY" -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" -d "$AREQ" 2>/dev/null || echo '{}')
RAW=$(printf '%s' "$ARESP" | jq -r '.content[0].text // empty' 2>/dev/null)
MEMS=$(printf '%s' "$RAW" | jq -c '.' 2>/dev/null)
if [ -z "$MEMS" ] || [ "$MEMS" = "null" ]; then log "destilado sin JSON válido"; exit 0; fi
N=$(printf '%s' "$MEMS" | jq 'length' 2>/dev/null || echo 0)
log "destiladas $N memorias"
[ "$N" -eq 0 ] && exit 0

# 2) Por cada memoria: embeber con Voyage + upsert.
i=0
while [ "$i" -lt "$N" ]; do
  CONTENT=$(printf '%s' "$MEMS" | jq -r ".[$i].content // empty")
  TYPE=$(printf '%s' "$MEMS" | jq -r ".[$i].type // \"fact\"")
  TAGS=$(printf '%s' "$MEMS" | jq -c ".[$i].tags // []")
  i=$((i+1))
  [ -z "$CONTENT" ] && continue

  EMB=$(curl -s --max-time 30 https://api.voyageai.com/v1/embeddings \
    -H "Authorization: Bearer $VKEY" -H "content-type: application/json" \
    -d "$(jq -cn --arg t "$CONTENT" --arg m "$VMODEL" --argjson d "$VDIMS" \
      '{input:[$t],model:$m,output_dimension:$d}')" 2>/dev/null \
    | jq -c '.data[0].embedding // empty' 2>/dev/null)
  if [ -z "$EMB" ] || [ "$EMB" = "null" ]; then log "voyage falló para mem $i"; continue; fi

  req=$(jq -cn --arg c "$CONTENT" --arg e "$EMB" --arg ty "$TYPE" \
    --arg sid "web-$SID" --argjson tg "$TAGS" \
    '{p_content:$c,p_embedding:$e,p_type:$ty,p_context:"destilado de sesión web (claude-code-web)",p_project:"forgelabs",p_tags:$tg,p_source_agent:"tunix-web",p_source_session_id:$sid}')
  curl -s --max-time 10 -X POST -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" -H "Prefer: return=minimal" \
    "$SUPABASE_URL/rest/v1/rpc/tunix_memory_upsert" -d "$req" >/dev/null 2>&1 \
    && log "upsert OK: ${CONTENT:0:60}" || log "upsert falló mem $i"
done
exit 0
