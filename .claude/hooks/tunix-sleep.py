#!/usr/bin/env python3
# TUNIX sleep (Stop) -- write-back episodico del cerebro compartido en Supabase (FORGE OS).
# Espejo del wake: al cerrar cada turno, guarda lo conversado en la sesion web a
# forge_tunix_episodic_memory (la MISMA tabla que el wake LEE y que llena TUNIX Talk),
# para que la continuidad web <-> VS Code sea bidireccional (la web ahora tambien RECUERDA).
# Robusto: solo stdlib (urllib), sin jq/curl. Degrada sin romper (siempre exit 0).
# Condicion: corre el write-back SOLO si TUNIX_SUPABASE_KEY esta presente (= entorno web).
# En local (VS Code) la key no esta -> no-op silencioso (el write-back local es otro hook).
import os, sys, json, urllib.request, urllib.parse

KEY = os.environ.get("TUNIX_SUPABASE_KEY", "")
URL = os.environ.get("TUNIX_SUPABASE_URL", "https://kdiebhgdnhbcyomezsob.supabase.co")
TABLE = "forge_tunix_episodic_memory"

# Bloques de texto que son ruido de plataforma, no conversacion real -> se descartan.
SKIP_PREFIXES = ("<ide_opened_file>", "<system-reminder>", "<command-name>", "<command-message>",
                 "<command-args>", "<local-command-stdout>", "<local-command-stderr>",
                 "<bash-input>", "<bash-stdout>", "<bash-stderr>", "Caveat:",
                 "[Request interrupted")

# stdout robusto frente a consolas no-UTF8 (Windows cp1252) en modo selftest; inocuo en produccion.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def req(method, path, body=None, extra=None):
    headers = {"apikey": KEY, "Authorization": "Bearer " + KEY}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if extra:
        headers.update(extra)
    r = urllib.request.Request(URL + "/rest/v1/" + path, data=data, headers=headers, method=method)
    return urllib.request.urlopen(r, timeout=8)


def block_text(content):
    # content puede ser str o lista de bloques; devuelve solo el texto de conversacion real.
    if isinstance(content, str):
        t = content.strip()
        return "" if t.startswith(SKIP_PREFIXES) else t
    if isinstance(content, list):
        parts = []
        for b in content:
            if isinstance(b, dict) and b.get("type") == "text":
                t = (b.get("text") or "").strip()
                if t and not t.startswith(SKIP_PREFIXES):
                    parts.append(t)
        return "\n".join(parts).strip()
    return ""


def parse_turns(path):
    # Recorre el JSONL y empareja user -> assistant en turnos {user, tunix}.
    turns, pending = [], None
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                if obj.get("type") not in ("user", "assistant"):
                    continue
                msg = obj.get("message") or {}
                role = msg.get("role")
                if not role:
                    continue
                text = block_text(msg.get("content"))
                if not text:
                    continue
                if role == "user":
                    pending = text
                else:  # assistant
                    turns.append({"user": pending or "", "tunix": text})
                    pending = None
    except Exception:
        return []
    return turns


def main():
    selftest = len(sys.argv) > 1 and sys.argv[1] == "--selftest"

    # En modo normal el hook Stop recibe el evento por stdin; en selftest NO se lee stdin
    # (evita que el proceso quede bloqueado esperando entrada en una terminal interactiva).
    inp = {}
    if not selftest:
        try:
            inp = json.load(sys.stdin)
        except Exception:
            inp = {}

    # Local (sin key) y no es selftest -> no-op. El write-back local lo hace otro hook.
    if not KEY and not selftest:
        sys.exit(0)

    transcript = inp.get("transcript_path")
    session_id = inp.get("session_id") or inp.get("sessionId") or "web-session"
    if selftest and len(sys.argv) > 2:
        transcript = sys.argv[2]

    if not transcript or not os.path.exists(transcript):
        if selftest:
            print("ERROR: transcript no encontrado: %r" % transcript)
        sys.exit(0)

    turns = parse_turns(transcript)

    if selftest:
        print("session_id : %s" % session_id)
        print("transcript : %s" % transcript)
        print("turnos     : %d" % len(turns))
        for t in turns[-3:]:
            print("  user : %r" % t["user"][:70])
            print("  tunix: %r" % t["tunix"][:70])
        if not KEY:
            print("(sin TUNIX_SUPABASE_KEY -> no inserta; correcto en local)")
            sys.exit(0)

    if not turns:
        sys.exit(0)

    # Idempotencia: ultimo turn_number ya guardado para esta sesion -> solo insertamos lo nuevo.
    last_turn = -1
    try:
        path = ("%s?session_id=eq.%s&select=turn_number&order=turn_number.desc&limit=1"
                % (TABLE, urllib.parse.quote(session_id)))
        r = req("GET", path, extra={"Accept": "application/json"})
        d = json.loads(r.read().decode())
        if d and d[0].get("turn_number") is not None:
            last_turn = int(d[0]["turn_number"])
    except Exception:
        last_turn = -1

    rows = []
    for i, t in enumerate(turns):
        if i <= last_turn:
            continue
        rows.append({
            "session_id": session_id,
            "turn_number": i,
            "user_text": t["user"][:8000],
            "tunix_text": t["tunix"][:8000],
            "tools_used": [],
        })

    if not rows:
        sys.exit(0)

    try:
        for j in range(0, len(rows), 50):  # batches de 50 para sesiones largas
            req("POST", TABLE, body=rows[j:j + 50], extra={"Prefer": "return=minimal"})
        if selftest:
            print("insertados : %d turnos nuevos (desde turn %d)" % (len(rows), last_turn + 1))
    except Exception as e:
        if selftest:
            print("ERROR insert: %s" % e)

    sys.exit(0)


if __name__ == "__main__":
    main()
