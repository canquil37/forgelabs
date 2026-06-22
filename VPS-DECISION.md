# Decisión de Infraestructura — VPS vs Servidor Dedicado (Forge OS / Tungsteno)

> **Propósito:** contextualizar TODA la investigación y conversación del 22-jun-2026
> sobre dónde alojar la infraestructura (VPS / servidor dedicado / bare-metal),
> para que **TUNIX-PC (VS Code)** y Patricio tengan el panorama completo y decidan.
> **La decisión sigue ABIERTA** — este doc deja los finalistas, precios verificados
> y trade-offs para cerrarla. Reemplaza la VPS de Hostinger (saturada / CPU steal).

---

## 0. Contexto macro CRÍTICO (leer primero)

En 2026 hubo una **crisis global de memoria (DRAM +171% interanual por demanda de IA)**.
Resultado: **TODOS los proveedores subieron precios** — Hetzner (+169% en cloud,
3 alzas en 2026), OVH (abril), Netcup, Scaleway (junio). **No es escapable cambiando
de marca; es macroeconómico.** Por eso el presupuesto hoy compra menos que hace un año.
→ Conclusión: elegir por **calidad/exclusividad/valor**, no por perseguir el precio más bajo.

---

## 1. Situación y requisitos de Patricio

- **Hoy:** paga ~$30k CLP/mes por VPS Hostinger. **Ahora está saturada al ~100%** (posible
  minero/oversubscription) → le llegan alertas de incidencias. No ha tenido caídas, pero el
  steal es real.
- **Agosto:** entra **1 cliente confirmado pagando ~$220k CLP/mes**. De ahí salen ~$100k cloud
  (APIs IA) + Supabase → margen ajustado al inicio.
- **Necesidad inmediata (esta semana):** montar el **agente de ese cliente** en algo
  **confiable y seguro** (sin el steal de Hostinger). Eso es no-negociable.
- **2º prospecto:** preguntó explícitamente **dónde están los datos y qué seguridad tienen**
  → ángulo de **soberanía de datos**.
- **Proyección:** escalar a varios clientes (Emabel + TensorMed/salud), muchos agentes, mucha IA.
- **Presupuesto:** ideal ~$30-50k CLP; dispuesto a **invertir más por alto estándar**.
- **Quiere poder decir:** *"tengo un servidor/infra de alto estándar, exclusivo, datos en Chile."*

---

## 2. El problema: CPU Steal y Jitter

- **CPU Steal** (`%st` en `top`): en VPS sobrevendido, otros inquilinos te roban ciclos de CPU.
  Hostinger barato puede tener 10-30% en peak. **Causa raíz de la saturación actual.**
- **Jitter:** variabilidad impredecible de respuesta (causada por el steal). Peor que latencia
  alta porque no se puede compensar. Arruina voz real-time y hace agentes erráticos.

### Cómo detectar steal ANTES de comprar
- Busca la palabra **"dedicated"**. Si no la dice → asume compartido.
- Precio sospechosamente barato = CPU sobrevendido.
- Nomenclatura: dedicado = "dedicated vCPU", "CCX" (Hetzner), "Optimized" (Vultr), "RS" (Netcup),
  "Dedicated CPU" (Linode/DO). Compartido = "vCPU", "CX/CPX" (Hetzner), "Regular/VX1", "Basic".
- Ya dentro: `top` → `%st` ≈ 0 dedicado; 5-20%+ en peak = te roban CPU.
- Ojo: en planes compartidos la RAM/disco SÍ son tuyos; lo que sobrevenden es el **CPU**.

---

## 3. Concepto clave: VPS (vCPU dedicado) vs Servidor Dedicado (bare-metal)

| | **VPS dedicado** | **Servidor dedicado (bare-metal / "fierro")** |
|---|---|---|
| Qué es | Una **rebanada** con cores reservados | La **máquina física entera**, 100% tuya |
| Exclusividad | Cores garantizados, virtualizado | Total — sin hypervisor ni vecinos |
| Specs por $ | Menos (pagas la rebanada + conveniencia) | Más (el fierro completo, a veces consumer) |
| Escalar | Resize en panel (rápido) | Horizontal / migración |
| Ops tuyas | Menos (snapshots fáciles, el proveedor maneja fallas de host) | Más (tú: backups, recuperación; punto único de falla) |
| Prestigio | Profesional | "Servidor dedicado" pega más fuerte ante clientes |

**Niveles de exclusividad:** Bare-metal (total) > vCPU pinned real (Hetzner CCX, Linode, Vultr
Optimized) > soft-dedicado (Netcup RS, baja sobreventa, sin throttle por contrato) > compartido
(Hostinger, OVH VPS — con steal).

---

## 4. Arquitectura recomendada (4 capas — no mezclar)

| Capa | Qué hace | Dónde vive |
|---|---|---|
| 🎤 Media (voz real-time) | Audio en vivo | Edge LATAM (gestionado São Paulo) |
| 🧠 Orquestación | n8n + agentes + flujos | **El servidor/VPS** |
| 🗄️ Datos | Tablas, RAG | **Supabase** (Cloud, o self-hosted en Chile p/soberanía) |
| 📦 Archivos pesados | Documentos, media | **Cloudflare R2** ($0 egress) |

- **Tools del agente:** lectura simple → Supabase directo (rápido). Flujo multi-paso → n8n.
- **Voz real-time:** el audio NO pasa por el servidor (va por edge) → los 150-230ms del servidor
  no afectan la voz. El servidor solo orquesta.
- **Archivos de clientes → R2, NUNCA el disco del servidor** (si se llena, se cae todo).

---

## 5. Investigación de proveedores — PRECIOS VERIFICADOS (22-jun-2026)

Conversión: USD≈960 CLP, EUR≈1.030 CLP. Confianza alta salvo nota.

### VPS dedicado (vCPU)
| Proveedor / plan | Cores ded. / RAM / Disco | Precio | CLP | Latencia Chile | Datos en Chile |
|---|---|---|---|---|---|
| **Vultr Optimized 2/8** (Santiago) | 2 / 8GB | $56 +19% IVA ≈ $67 | ~$64k | **<20ms** | ✅ |
| **Vultr VX1 2/8** | 2 / 8GB | $43.80 (+IVA) | ~$50k | <20ms si Santiago | ✅ |
| **Netcup RS 2000 G12** | 8 / 16GB (soft⚠️) | €16.89 | ~$17k | 150ms(VA)/230ms(EU) | ❌ |
| **Netcup RS 4000 G12** | 12 / 32GB (soft⚠️) | €27.08 | ~$28k | igual | ❌ |
| **Netcup RS 8000 G12** | 16 / 64GB (soft⚠️) | €48.33 | ~$50k | igual | ❌ |
| **Linode Dedicated 4GB** (São Paulo) | 2 / 4GB (pinned) | $36 | ~$35k | ~50ms | ❌ (Brasil) |
| **Hetzner CCX13** | 2 / 8GB (pinned) | €43.49 | ~$45k | ~150ms(VA) | ❌ |
| **Hetzner CCX23** | 4 / 16GB | €86.49 | ~$90k ❌ | ~150ms | ❌ |
| **Scaleway PRO2-XXS** | 2 / 8GB (pinned) | €40.15 | ~$41k | ~230ms (EU) | ❌ |
| DigitalOcean GP 2/8 | 2 / 8GB (pinned) | $63 | ~$60k | ~150ms (NY) | ❌ |
| Kamatera Type D | ~$90-160 | over | — | ~130ms (Miami) | ❌ |

### Bare-metal (fierro)
| Proveedor / plan | CPU / RAM / Disco | Precio | CLP | Latencia | Datos en Chile |
|---|---|---|---|---|---|
| **Latitude.sh m4.metal.small** (Santiago) | EPYC 6c / **64GB** / 1.9TB / GPU-ready | **$131 reservado / $270 on-demand** | ~$126-260k | **<10ms** | ✅ |
| **Hetzner AX42** | Ryzen 8c / 64GB / 1TB | €49 | ~$50k | ~230ms (EU) | ❌ |
| **OVH RISE / Advance** (US) | bare-metal EPYC | ~$92-102 | ~$90-98k | ~150ms | ❌ |
| **DCH** (chileno) | dedicado, soporte local | ~$135k CLP | $140 | <10ms | ✅✅ |
| **HostingCenter.cl** | hardware a medida | $199.900+IVA | $210 | <10ms | ✅✅ |

⚠️ **Notas de precio:** Hetzner subió 3 veces en 2026 (los números son post-alza). Vultr
Santiago lleva ~19% IVA Chile + posible premium regional → confirmar en panel. Latitude cambió
su lineup: el viejo "c2.small $92" YA NO EXISTE; el actual es m4.metal.small ($131 reservado).
Precios de Vultr/Latitude/chilenos: **confirmar en el panel del proveedor** (bloquean scraping).

### Vultr Santiago: ¿fierro directo?
**NO.** Santiago ofrece Cloud Compute + **Optimized (vCPU dedicado)** + Kubernetes + Object
Storage. **Bare-metal NO está en Santiago** (solo en hubs grandes). Para fierro en Chile →
Latitude.sh o proveedor chileno. Bonus: datacenter Vultr Santiago tiene **PCI DSS + SOC 2 Type 2**
(respuesta de seguridad concreta para el cliente que preguntó).

---

## 6. Latencia a Chile (verificada)
In-country Chile **<10ms** → São Paulo **~40-55ms** → US-West/LA ~100-140ms → Miami ~120-170ms →
US-East/Virginia ~140-165ms → **Europa ~220-260ms**.
> Para carga backend/orquestación (asíncrona) la latencia es irrelevante. Solo importa para
> usuarios chilenos en tiempo real (que de todos modos van por edge/Vercel).

---

## 7. Soberanía de datos (Chile) — argumento de venta REAL
- Para **salud/TensorMed**, "los datos NO salen de Chile" es vendible y casi compliance
  (**Ley 21.719** de protección de datos). Suma: soporte español + mantención directa + <10ms.
- **Supabase Cloud NO tiene región Chile** (lo más cerca São Paulo). Para soberanía REAL →
  **self-host Supabase en un servidor chileno**.

---

## 8. Capacidad (VPS 2 vCPU / 8GB dedicado, bien optimizada)
Con **datos en Supabase Cloud + archivos en R2 + n8n multi-tenant**:
- Clientes bien estructurados: **5 cómodo**, 7-8 estirando, **10 = punto de upgrade**.
- Agentes concurrentes: 10-15 (la IA corre en APIs, no en el box).
- Ejecuciones n8n/día: 5.000-15.000.
> ⚠️ Si self-hosteas Supabase EN la misma caja de 8GB → baja a 2-3 clientes (come 2-4GB). En
> producción multi-cliente: datos en Supabase Cloud, NO self-hosted encima.
> El servidor es **costo FIJO compartido** entre todos los clientes → margen mejora por cliente.
- Upgrade: Vultr resize a 4/16, o Netcup RS 4000 (12c/32GB), o 2 nodos. Trigger: RAM>75% o ~8 clientes.

---

## 9. Self-hosted Supabase — ahorro + soberanía, pero con responsabilidad
- ✅ Elimina la suscripción Supabase Cloud (~$25-48k CLP/mes) + da datos en Chile.
- ⚠️ Te vuelves el DBA: **backups off-site (a R2), seguridad, updates, recuperación**. Con datos
  de clientes, un error = pérdida/brecha. Concentra riesgo (1 caja = compute + datos).
- 🔑 **Aprenderlo en SANDBOX primero** (Hetzner AX42 64GB), no con datos de clientes a la primera.

---

## 10. Servidor en casa + UPS — opinión
- ❌ **Producción para clientes: NO.** Internet residencial sin SLA + la UPS cubre minutos (no
  horas) + no resuelve corte de internet → inalcanzable. Opuesto al alto estándar.
- ✅ **Futuro: máquina de ENTRENAMIENTO de IA.** Ahí la UPS sí sirve (protege training de
  parpadeos). Datos en Supabase. Cargas no-críticas.
- 🔮 Instalar servidores en sitios de clientes (on-premise) = producto B2B futuro, requiere más madurez.

---

## 11. GPU / training de IA
- El CCX/VPS/AX42 son **CPU-only** → no entrenan modelos. Tu stack actual es **inferencia vía API**
  (no necesita GPU). Para fine-tuning de TensorMed: Latitude.sh GPU (Santiago, por hora),
  Netcup vGPU, o RunPod/Vast (training en ráfaga, lo más barato).

---

## 12. 🎯 LA DECISIÓN (abierta) — finalistas y trade-offs

**Requisitos:** confiable (sin steal), seguro, datos en Chile (idealmente), escalable, ~$30-90k CLP.

### Opción A — Pragmática AHORA (recomendada para esta semana)
**Vultr Santiago, Optimized o VX1 (2 vCPU/8GB dedicado) ≈ $50-64k CLP.**
- ✅ No steal, datos en Chile, PCI DSS/SOC 2, reputado, resize sin migrar, deploy esta semana,
  aguanta 5 clientes. Cubierto de sobra por el cliente de $220k.
- ➖ No es fierro; 8GB limita self-hosted Supabase.

### Opción B — Puente ultra-barato
**Netcup RS 2000 G12 (8c/16GB) ≈ $17k CLP** — más barato que Hostinger, mucho más máquina.
- ➖ Soft-dedicado (riesgo pequeño/raro de steal — incidente G11 2024), datos no en Chile,
  soporte autoservicio. Migrar a Chile después (build en Docker = fácil).

### Opción C — Alto estándar (fierro, para 3-5+ clientes)
**Latitude.sh m4.metal.small (6c/64GB/1.9TB) Santiago ≈ $131k CLP reservado.**
- ✅ Fierro 100% tuyo, datos en Chile, GPU-ready, self-host Supabase (soberanía + ahorro),
  64GB hostea 10-15 clientes. El estándar que Patricio quiere defender.
- ➖ Caro para 1 cliente esta semana; más ops (backups, punto único de falla).

### Sandbox / aprendizaje
**Hetzner AX42 (8c/64GB) ≈ $50k CLP** — para practicar self-hosted Supabase sin tocar producción.

---

## 13. Ruta sugerida (staged)
```
ESTA SEMANA:   Vultr Santiago dedicado (Opción A) → 1er cliente, confiable, datos en Chile
               + aliviar Hostinger (subir plan) mientras se migra lo actual sin presión
APRENDIZAJE:   Hetzner AX42 (sandbox) → dominar self-hosted Supabase + build en Docker (portable)
3-5 CLIENTES:  Latitude.sh fierro Santiago (Opción C) → alto estándar, soberanía, GPU-ready
FUTURO:        Workstation GPU en casa + UPS → entrenar IA (datos en Supabase)
```
> Todo en **Docker/docker-compose** desde el día uno → migrar entre proveedores = copy-paste.

---

## 14. Estado y próximos pasos
- [ ] **Patricio:** confirmar en panel de Vultr el precio real de Santiago (Optimized/VX1 2/8 + IVA).
- [ ] **Patricio:** confirmar en panel de Latitude el precio de m4.metal.small en Santiago.
- [ ] Decidir Opción A vs B vs C según caja de esta semana y apetito de ops.
- [ ] Montar el 1er agente en **Docker** (portable) — aislar cada cliente por workflow + RLS.
- [ ] Configurar **R2** para archivos de clientes.
- [ ] (Aprendizaje) Sandbox de self-hosted Supabase.

> **Honestidad de fuentes:** Hetzner verificado (screenshot + docs). Vultr/Latitude/Netcup/
> chilenos: precios de páginas oficiales vía snippets (bloquean scraping) → **confirmar el número
> final en el panel del proveedor antes de pagar**. Hubo 2 correcciones de precio en la sesión
> (alza Hetzner 15-jun, y cambio de lineup de Latitude: c2.small→m4.metal.small).
