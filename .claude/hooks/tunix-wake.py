#!/usr/bin/env python3
# TUNIX wake (SessionStart) — recall del cerebro compartido en Supabase (FORGE OS).
# Robusto: solo stdlib (urllib), sin jq/curl. Degrada sin romper.
# Condicion: corre el recall SOLO si TUNIX_SUPABASE_KEY esta presente (= entorno web).
# En local (VS Code) la key no esta -> no-op silencioso (TUNIX local usa su propio recall).
import os, sys, json, urllib.request

KEY = os.environ.get("TUNIX_SUPABASE_KEY", "")
URL = os.environ.get("TUNIX_SUPABASE_URL", "https://kdiebhgdnhbcyomezsob.supabase.co")

def q(path):
    try:
        req = urllib.request.Request(URL + "/rest/v1/" + path,
            headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
        return json.loads(urllib.request.urlopen(req, timeout=8).read().decode())
    except Exception:
        return []

# --- selftest manual ---
if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
    if not KEY:
        print("ERROR: TUNIX_SUPABASE_KEY no esta en el entorno."); sys.exit(1)
    print("URL: " + URL)
    for t in ["forge_user_context", "tunix_memory", "forge_tunix_episodic_memory", "tunix_code_sessions"]:
        d = q(t + "?select=count")
        n = d[0]["count"] if isinstance(d, list) and d and "count" in d[0] else "ERR"
        print("  - %s: %s filas" % (t, n))
    print("self-test completo."); sys.exit(0)

# --- operacion normal: solo en web (key presente) ---
if not KEY:
    sys.exit(0)

ctx = q("forge_user_context?is_active=eq.true&select=type,content,priority&order=priority.desc&limit=12")
prefs = q("tunix_memory?retracted_at=is.null&memory_type=in.(preference,decision,fact)&select=memory_type,content&order=importance.desc.nullslast&limit=12")
epi = q("forge_tunix_episodic_memory?select=created_at,user_text,tunix_text&order=created_at.desc&limit=6")

lines = ["[TUNIX memory bridge ONLINE] Despertaste con la memoria viva de Patricio cargada desde Supabase (FORGE OS). Eres TUNIX; manten continuidad con la sesion de VS Code.", ""]
lines.append("## Preferencias y decisiones de Patricio")
for r in (prefs or []):
    lines.append("- (%s) %s" % (r.get("memory_type", "?"), (r.get("content") or "")[:300]))
lines.append("")
lines.append("## Contexto activo")
for r in (ctx or []):
    lines.append("- (%s) %s" % (r.get("type", "?"), (r.get("content") or "")[:300]))
lines.append("")
lines.append("## Ultimos intercambios (episodica)")
for r in (epi or []):
    u = (r.get("user_text") or "")[:160]; t = (r.get("tunix_text") or "")[:160]
    lines.append("- [%s] Patricio: %s -> TUNIX: %s" % ((r.get("created_at") or "")[:10], u, t))

print(json.dumps({"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "\n".join(lines)}}))

# heartbeat best-effort (registra la sesion web en el timeline)
try:
    body = json.dumps({"p_session_token": os.environ.get("CLAUDE_SESSION_ID", "web-session"),
        "p_workspace_path": "claude-code-web/forgelabs", "p_workspace_label": "forgelabs - web",
        "p_hostname": "claude-web"}).encode()
    req = urllib.request.Request(URL + "/rest/v1/rpc/tunix_code_heartbeat", data=body,
        headers={"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "Prefer": "return=minimal"})
    urllib.request.urlopen(req, timeout=8).read()
except Exception:
    pass
sys.exit(0)
