#!/bin/bash
# Hook de PRUEBA (SessionStart) — verifica si el entorno web de Claude Code
# ejecuta los hooks SessionStart definidos en el repo. Inyecta un texto fijo.
# Si una sesion web puede leerlo, el entorno web SI corre hooks del repo.
# BORRAR tras la prueba (TUNIX, 2026-06-22).
printf '%s' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"BRIDGE-HOOK-RAN-9988 — Si puedes leer este codigo, el entorno web de Claude Code SI ejecuta los hooks SessionStart definidos en el repositorio. Es un hook de prueba de TUNIX para validar el puente de memoria; se borra despues."}}'
