# Decisión de Infraestructura — VPS, arquitectura y escalado (Forge OS / Tungsteno)

> Documento maestro de la decisión de VPS y arquitectura para escalar agentes,
> automatizaciones y clientes. Consolidado por TUNIX-web (jun 2026) para Patricio
> y TUNIX-VS Code. Reemplaza la VPS de Hostinger (problemas de CPU steal).

> ⚠️ **ACTUALIZACIÓN DE PRECIOS (22-jun-2026).** Hetzner aplicó un alza fuerte el
> **15-jun-2026** (price shock): CCX13 €15,99 → €43,49 (+169%), CCX23 ~€26 → **€86,49**.
> Los precios de Hetzner que aparecen más abajo en este doc son **PRE-alza y están
> obsoletos**. A precio real el **CCX23 ≈ ~$90k CLP, fuera de presupuesto**. La
> decisión está en revisión: contendientes reales dentro de presupuesto (~$50k CLP)
> son **Netcup RS 1000 G12** (4 cores dedicados/8GB/256GB NVMe, ~$41k CLP),
> **Hetzner CCX13** (2/8, ~$45k CLP) y **Vultr Santiago** (2/8, ~$54k CLP, baja
> latencia). Números finales pendientes de investigación en vivo.

## TL;DR — la decisión

- **Comprar:** *(en revisión tras el alza de Hetzner — ver nota arriba).* Candidato de mejor valor: **Netcup RS 1000 G12** (4 vCPU dedicados / 8 GB ECC / 256 GB NVMe) ~$41k CLP. Hetzner CCX23 quedó fuera de presupuesto (~$90k CLP).
- **Por qué:** vCPU **dedicado** (mata el CPU steal de Hostinger), dentro de presupuesto, marca seria.
- **Latencia:** irrelevante para tu carga — el VPS solo orquesta; el audio va por edge LATAM y la IA por APIs.
- **Escala:** subir de tier dentro del proveedor; ruta a GPU para AI cuando TensorMed lo pida.

---

## 1. El problema: CPU Steal y Jitter en Hostinger

- **CPU Steal:** en VPS sobrevendido, tus vCPUs son compartidos; el *steal time* (`%st` en `top`) es el % de tiempo en que tu vCPU quiere correr pero el núcleo físico está atendiendo a otro inquilino. En Hostinger barato puede ser 10-30% en peak. **Causa raíz de los problemas.**
- **Jitter:** variabilidad impredecible en los tiempos de respuesta, causada por el steal. Peor que la latencia alta, porque no se puede compensar (es aleatorio). Arruina voz real-time y hace que los agentes se sientan erráticos.
- **Dedicado (CCX/RS/Optimized):** cada vCPU pegado a un hilo físico reservado → steal ≈ 0%, jitter bajo, rendimiento constante.

## 1B. Cómo detectar steal ANTES de comprar (checklist)

El steal es **invisible en la página de venta**: te muestran "2 vCPU, 8 GB, NVMe" igual que un dedicado. El precio bajo *es* el steal (sobreventa). Cómo no caer:

**Antes de comprar:**
- 🔍 Busca la palabra **"dedicated"** (dedicated cores / dedicated vCPU). Si **no** dice "dedicated" → asume **compartido** y con riesgo de steal.
- 💸 Precio sospechosamente barato para las specs = CPU sobrevendido. Si es muy barato, alguien más usa tu núcleo.
- 📜 Revisa el **fair-use / términos**: "recursos compartidos", "burstable", "uso justo" = compartido.
- 📊 Mira benchmarks independientes (vpsbenchmarks.com) que miden el steal real.
- 🏷️ Nomenclatura: "dedicated vCPU", "CCX" (Hetzner), "Optimized" (Vultr), "RS / Root Server" (Netcup) = garantizado. "vCPU", "CX/CPX" (Hetzner shared), "Regular/VX1" = compartido.

**Una vez dentro (forense):**
```bash
top        # mira la columna %st (steal)
```
- `%st` ≈ 0% sostenido → dedicado real.
- `%st` 5-20%+ en peak → te están robando CPU (compartido sobrevendido).
- Cross-check: corre `sysbench cpu` a distintas horas; resultados inconsistentes = steal.

> **Ojo con la RAM:** en los planes "compartidos" la RAM y el disco normalmente **sí** son tuyos; lo que sobrevenden es el **CPU**. Por eso confunde: tienes tus 8 GB reales, pero tu CPU es prestado.

## 2. Comparación Hostinger vs Hetzner CCX23

| Característica | Hostinger VPS | **Hetzner CCX23** |
|---|---|---|
| vCPU | Compartido (sobrevendido) | **4 dedicados** (AMD EPYC) |
| CPU Steal | Alto en peak | **~0%** |
| Jitter | Alto | **Bajo** |
| RAM / Disco | Variable | **16 GB / 160 GB NVMe** |
| Rendimiento | Inconsistente | **Constante, garantizado** |
| Escalado | Limitado | Resize en caliente CCX13→CCX63 |
| Extras | Básico | Snapshots, firewall cloud, API/Terraform, IPv6, LB, redes privadas |

## 3. Arquitectura: 4 capas, cada una en su lugar

| Capa | Qué hace | Dónde vive |
|---|---|---|
| 🎤 Media (audio real-time) | Audio en vivo | Edge LATAM (gestionado São Paulo / o nodo propio) |
| 🧠 Orquestación | Flujos, lógica, integraciones | **n8n en la VPS (CCX23)** |
| 🗄️ Datos | Tablas, RAG, info actualizada | **Supabase** |
| 🖥️ Frontend | Landings, paneles | Vercel |
| 📦 Archivos pesados | Documentos, media de clientes | **Cloudflare R2** |

Regla: **no mezclar capas.** Datos → Supabase. Orquestación → VPS. Audio → edge. Archivos → R2. Cada una escala por separado sin tumbar a las otras.

## 4. Cómo se alimenta de datos un agente: dos tipos de tools

- 🟢 **Tipo A — lectura/escritura simple → Supabase DIRECTO.** Una consulta a Postgres (RPC indexado). ~50-150 ms. El VPS no interviene. Ej: "trae historial del cliente", "busca en RAG".
- 🟠 **Tipo B — orquestación compleja → n8n en la VPS.** Multi-paso, multi-sistema, APIs externas. Ej: "agenda + correo + WSP + actualiza CRM".

**Regla de oro:** dato puntual → Supabase directo. Flujo multi-paso → n8n/VPS. Nunca mandes una lectura simple a dar la vuelta por n8n.

## 5. Latencia de agentes (el problema de TUNIX Talk) — es config, no VPS

La latencia se siente cuando un tool está en el **camino crítico** (el agente debe llamarlo antes de hablar). Fixes:
1. **Latency masking:** el agente dice "déjame revisar..." y corre el tool en paralelo.
2. **Tools calientes = Supabase directo** (RPC indexado), no n8n.
3. **Menos tools, mejor enrutadas** (demasiados → el LLM pierde tiempo eligiendo).
4. **Pre-carga al inicio** (contexto del cliente cacheado en session start).
5. **n8n caliente y por webhook** (sin cold-start ni polling).

## 6. Voz real-time: el audio NO pasa por el VPS

Flujo de un turno: `Cliente → edge media → STT (Deepgram) → LLM → [tool call → VPS] → TTS → edge media → Cliente`. El audio viaja **cliente ↔ edge ↔ STT/TTS**; el VPS solo recibe JSON de lógica (~150 ms, invisible).

| Escenario | ¿Nodo propio? | Turno total | Calidad |
|---|---|---|---|
| A. Gestionado (edge São Paulo) | ❌ No | ~500-700 ms | 🟢 Premium |
| B. Nodo propio Santiago/SP | ✅ ~$12-18/mo | ~500-700 ms | 🟢 Premium |
| C. Todo en US (sin edge LATAM) | ❌ No | ~850-1000 ms | 🟡 Usable |

**No necesitas nodo propio en Chile/Brasil:** con un proveedor gestionado usas su edge São Paulo sin provisionar nada. Nodo propio solo si el volumen alto justifica bajar costo por minuto.

## 7. Storage: Cloudflare R2, NUNCA el disco del VPS

🚫 Archivos de clientes en el disco de cómputo = riesgo de que un cliente llene el disco y **caiga todo (n8n, agentes)**.

✅ Object storage desacoplado:
| Opción | Storage | Egress | Cuándo |
|---|---|---|---|
| **Cloudflare R2** | ~$0.015/GB/mes | **$0 gratis** | Archivos pesados, mucha descarga (ej: Instituto Teológico) |
| Supabase Storage | ~$0.021/GB/mes | Se cobra | Archivos atados a usuarios con RLS |

100 GB en R2 ≈ $1.5/mes, egress gratis, aislado del cómputo. **Para el Instituto Teológico y archivos de clientes: R2.**

## 8. Capacidad del CCX23

Orquestar es **I/O-bound** (los agentes esperan red, no queman CPU) → un box de 4 vCPU aguanta muchos agentes en paralelo.

| Recurso | CCX23 cómodo | Aprieta |
|---|---|---|
| Empresas medianas | 5-8 | 12+ pesadas |
| Agentes concurrentes (orquestación) | 10-20 | 30+ |
| Ejecuciones n8n/día | 5k-20k | 50k+ flujos pesados |
| Voz simultánea | 10-15 | según peso de tools |
| Webhooks/día | miles | cientos/seg sostenido |

**6 medianas + 10 agentes en paralelo = entra cómodo** (~40-60% de uso). Lo único que lo tumba: trabajo pesado de CPU en el box (video, datasets, LLM local) → offloadear.

## 9. Escalado dentro de Hetzner (sin cambiar de marca)

| Plan | vCPU / RAM / Disco | Precio aprox/mes |
|---|---|---|
| CCX13 | 2 / 8GB / 80GB | ~$17 |
| **CCX23** ⭐ | 4 / 16GB / 160GB | ~$32 |
| CCX33 | 8 / 32GB / 240GB | ~$63 |
| CCX43 | 16 / 64GB / 360GB | ~$125 |
| CCX63 | 48 / 192GB / 960GB | ~$370 |

- **Vertical:** resize en caliente (CPU+RAM suben juntos; **no se puede solo RAM**), conserva disco, ~2 min, reversible.
- **Disco extra:** Volumes independientes.
- **Horizontal:** múltiples nodos + load balancer + n8n en queue mode (para resiliencia a ~10 clientes pesados).
- **Más allá:** bare-metal dedicado, GPU (GEX).

## 10. IA / GPU / Training — la realidad

- El CCX23 (y todo CCX) es **CPU-only**: **no entrena IA** ni corre LLMs locales.
- **Pero el 99% de tu stack es inferencia vía API** (Anthropic, Deepgram, Voyage, ElevenLabs) → **no necesita GPU**. El CCX23 orquesta perfecto.
- **Cuando TensorMed/AETOS fine-tunee** su modelo médico → necesitas GPU:
  - **Dentro de Hetzner:** línea **GEX** (GEX44 RTX 4000 Ada 20GB ≈ €184/mo; GEX130 RTX 6000 ≈ €838/mo).
  - **Más inteligente para training intermitente:** GPU **por hora** (RunPod/Vast/Lambda) — entrenas, apagas, pagas solo lo usado.
- Estrategia 2 servers: CCX23 (cerebro, hoy) + GEX/GPU-hora (músculo IA, cuando TensorMed lo pida).

## 11. Resumen de costos

| Componente | Costo/mes | Cuándo |
|---|---|---|
| VPS CCX23 (orquestación) | ~$32 | Ahora |
| Supabase | plan actual | Ahora |
| Cloudflare R2 (storage) | centavos/GB, egress $0 | Cuando haya archivos |
| Edge voz (gestionado) | $0 fijo, pago por minuto | Cuando haya cliente de voz |
| Nodo media propio (opcional) | ~$12-18 | Solo si volumen alto |
| GPU (GEX o por hora) | desde €184/mo o ~€1-3/hora | Cuando TensorMed entrene |

**Base de partida: ~$32/mes + storage en centavos.**

---

## 12. Checklist de migración desde Hostinger

- [ ] Crear cuenta Hetzner (puede pedir verificación de identidad, ~1 día — hacerlo con tiempo).
- [ ] Provisionar **CCX23 en Ashburn, VA**. Confirmar precio exacto al momento.
- [ ] Activar **snapshots/backups automáticos** desde el día uno.
- [ ] Activar **firewall cloud** (cerrar puertos, exponer solo lo necesario).
- [ ] Instalar stack: Docker + n8n (modo webhook; queue mode cuando escale).
- [ ] Migrar workflows de n8n desde Hostinger (export/import).
- [ ] Apuntar webhooks (WSP, Meta, Resend, forms) al nuevo host.
- [ ] Verificar que datos siguen en **Supabase** (no migrar DB al VPS).
- [ ] Crear bucket **Cloudflare R2** para archivos de clientes / Instituto Teológico.
- [ ] Validar latencia/estabilidad (sin steal: `top` debe mostrar `%st` ≈ 0).
- [ ] Apagar la VPS de Hostinger una vez verificado todo.
- [ ] Documentar credenciales en `forge_secrets` (vault Supabase).

## 13. Reglas de oro (para no equivocarse al escalar)

1. **No compres capacidad para clientes que no tienes.** Parte CCX23, sube cuando los metrics lo pidan.
2. **No mezcles capas:** datos→Supabase, orquestación→VPS, audio→edge, archivos→R2.
3. **Lecturas simples directas a Supabase**, no por n8n.
4. **Nada de archivos de clientes en el disco del VPS** → R2.
5. **Training en GPU dedicada/por hora**, no en el VPS de cómputo.
6. **A los ~10 clientes pesados:** piensa en resiliencia (2 nodos + LB), no solo en tamaño.
