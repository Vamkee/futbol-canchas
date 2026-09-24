# Arquitectura técnica

Documento vivo con la trazabilidad entre `especificacion-reservas-canchas.md`
(fuente de verdad del producto) y el código de este repositorio.

## 0. Alcance de esta implementación

El repo implementa el **núcleo operativo** de la especificación (secciones 4,
5, 7-10, 17, parte de 18) para **un solo negocio** sembrado por seed
(`canchas-demo`), con el modelo de datos completo de unidades/espacios para
que agregar más negocios después no requiera otra reescritura del esquema.

Deliberadamente fuera de esta pasada: promociones (13.2), recurrentes
(sección 14), disputas (16.2), reseñas (10.2), notificaciones automatizadas
(sección 15 — se mantienen enlaces `wa.me` manuales), onboarding y roles de
plataforma (12, 16.1), escaneo de QR por cámara, pruebas pgTAP de
concurrencia (23.10).

## 1. Stack y hosting

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS.
- **Backend como servicio:** Supabase (PostgreSQL con `btree_gist`, Auth JWT,
  Storage, Row Level Security).
- **Hosting:** Vercel con cron vía `vercel.json` (sin infraestructura propia
  desplegada todavía — desarrollo 100% local con `supabase start`).
- **Notificaciones:** enlaces `wa.me` pre-llenados, sin coste de API.

## 2. Modelo de datos

Ver `supabase/migrations/0005_domain_model.sql` para el esquema completo y
`especificacion-reservas-canchas.md` sección 23 para la referencia normativa.
Resumen de las tablas que sostienen las garantías del sistema:

```
businesses 1─n venues 1─n units          (unidad física, lo que se ocupa)
                venues 1─n spaces        (lo que el cliente reserva)
                spaces n─n units (space_units)
units 1─n occupancies  (booking | block | change_hold)
bookings 1─n occupancies, 1─n payments, 1─n booking_price_lines
payments 1─n payment_proofs
```

- **`occupancies`** es la tabla que garantiza R1/RNF1: dos ocupaciones
  activas de la misma unidad nunca se solapan, sin importar si vienen de una
  reserva web, manual, un bloqueo o un cambio en retención. Se garantiza con
  `EXCLUDE USING gist (unit_id WITH =, period WITH &&) WHERE (is_active)`, no
  con lógica de aplicación.
- **`bookings.status`** tiene 9 valores (sección 5.1). El check-in no es un
  estado: es `checked_in_at`/`checked_in_by` dentro de una reserva
  `confirmed`.
- **`payments`** separa `declared_amount` de `verified_amount`; la constraint
  `payments_approval_requires_person` impide aprobar sin que una persona
  (`decided_by`) lo haga.
- **`bookings.access_token_hash`** guarda solo el hash SHA-256 de un token
  largo y aleatorio; el token en claro solo existe en el link que recibe el
  cliente (`?t=...`). El `code` de 6 caracteres es una referencia legible,
  nunca una credencial de acceso.

## 3. Funciones de negocio (RPC)

Toda operación que cambia ocupaciones o dinero es una función `plpgsql`
transaccional en `supabase/migrations/0006_domain_rpc.sql` que también
escribe en `audit_log` dentro de la misma transacción (regla de arquitectura
22.5.3). Las más relevantes:

| Función | Uso |
| --- | --- |
| `quote_booking` | Cotización por tramos (13.1), no aparta nada |
| `create_hold` | Crea el HOLD; si el cliente no elige espacio, aplica la asignación automática de 23.7 (la que menos fragmenta combinaciones) |
| `space_availability` | Grilla de disponibilidad para la búsqueda pública |
| `submit_payment` / `review_payment` | Sube comprobante / lo aprueba o rechaza una persona del negocio |
| `register_payment` / `void_payment` | Pagos manuales del personal (nacen aprobados) |
| `cancel_booking` | Aplica los tramos de cancelación de `business_policies.cancellation_tiers` |
| `request_change` / `decide_change` | Cambios de hora/espacio solicitados por el cliente (G3) |
| `create_block` / `release_block` | Bloqueos con resolución obligatoria de reservas afectadas (IND1) |
| `check_in`, `mark_no_show`, `revert_no_show`, `extend_booking`, `resolve_closure` | Día del partido (sección 10) |
| `run_expirations`, `run_closures` | Procesos idempotentes de la sección 17, llamados desde `/api/cron` |

## 4. Seguridad (RLS)

- El rol anónimo no tiene acceso directo a ninguna tabla operativa; solo a
  las funciones públicas listadas arriba (`supabase/migrations/0007_domain_rls.sql`).
- `is_member(business_id)` reemplaza el antiguo `is_admin()`: el personal
  solo lee su propio negocio (`business_members`), aislamiento entre
  negocios (RNF11) aunque hoy solo exista uno.
- `bookings`, `occupancies`, `payments`, `refunds`, `audit_log` no aceptan
  escritura directa de nadie: solo cambian por las funciones `security
  definer`, que corren como dueño de las tablas y por eso no quedan sujetas a
  estas políticas.
- Bucket `payment-proofs` privado, ruta `{business_id}/{codigo}/{archivo}`;
  el cliente solo sube a la carpeta de una reserva propia en `hold`, y solo
  el personal del mismo negocio lee con URL firmada.
- `SUPABASE_SERVICE_ROLE_KEY` únicamente server-side (cron).
- Middleware protege `/admin` y renueva la sesión (JWT).

## 5. Deuda técnica conocida / siguientes pasos

1. Pruebas pgTAP de `occupancies_no_overlap` bajo concurrencia real
   (23.10) — hoy solo se verificó manualmente.
2. `void_payment` no recalcula el estado de la reserva si el pago anulado ya
   la había confirmado.
3. G4 (el negocio propone un cambio) y el flujo completo de confirmación de
   reembolso (G8) no están implementados; `request_change` solo cubre G3.
4. Sin escaneo de QR por cámara: el check-in es por búsqueda manual.
5. Sin promociones, recurrentes, disputas, reseñas ni notificaciones
   automatizadas — ver especificación secciones 13.2, 14, 16.2, 10.2, 15.
