# Arquitectura técnica

Documento vivo que describe las decisiones de arquitectura del **Sistema Web de
Reserva de Canchas Deportivas con Verificación de Pago Nequi** y su trazabilidad
contra el SRS.

| Código | Requerimiento |
| ------ | ------------- |
| RF-01  | Catálogo de canchas |
| RF-02  | Buscador y selección de horarios |
| RF-03  | Reserva de turno |
| RF-04  | Módulo de pago Nequi |
| RF-05  | Notificación WhatsApp |
| RF-06  | Consulta y gestión de reserva |
| RF-07  | Dashboard del administrador |
| RF-08  | Bloqueo manual de horarios |
| RN-01..05 | Reglas de negocio (ver `supabase/migrations/0002_business_logic.sql`) |

## 1. Stack y hosting

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS.
  Server Components para datos, componentes cliente acotados al mínimo.
- **Backend como servicio:** Supabase (PostgreSQL, Auth con JWT, Storage,
  Row Level Security) — host remoto o local con `supabase start`.
- **Hosting:** Vercel con despliegue continuo desde `main` y cron vía
  `vercel.json`.
- **Notificaciones:** enlaces `wa.me` pre-llenados (RF-05) sin coste de API.

## 2. Modelo de datos (resumen)

```
canchas 1───n reservas   canchas 1───n bloqueos   auth.users 1─1 admins
reservas: codigo UNIQUE, estado(enum), fecha, hora_inicio, hora_fin,
          expira_en (RN-01), comprobante_url, referencia_pago, motivo_rechazo
```

- Estados: `PENDIENTE_PAGO → CONFIRMADA | RECHAZADA | CANCELADA`.
  Transiciones validadas por trigger `validar_transicion_estado`.
- **Anti doble reserva (RN-05):** índice único parcial
  `(cancha_id, fecha, hora_inicio) WHERE estado IN ('PENDIENTE_PAGO','CONFIRMADA')`
  más chequeo de solapamiento dentro de los RPC de escritura.

## 3. Seguridad (RNF-04)

- Acceso anónimo solo por **RPC `security definer`**:
  `crear_reserva`, `adjuntar_comprobante`, `obtener_reserva`,
  `reprogramar_reserva`, `cancelar_reserva`, `franjas_disponibles`.
- RLS habilitado en todas las tablas públicas; `public.admins` define quién es
  administrador (`is_admin()`).
- Bucket `comprobantes` **privado**: el anónimo sube solo a la carpeta de su
  código de reserva; solo el admin puede leer (URL firmada).
- Clave `SUPABASE_SERVICE_ROLE_KEY` únicamente server-side (cron).
- Middleware protege `/admin` y renueva la sesión (JWT).

## 4. Reglas de negocio en código

| Regla | Dónde se aplica |
| ----- | --------------- |
| RN-01 Timer 15 min | `crear_reserva` (expira_en) + `liberar_reservas_expiradas()` + cron `/api/cron` cada 5 min |
| RN-02 Anticipo Nequi | La reserva hereda `monto_anticipo` de la cancha |
| RN-03 Validación humana | Dashboard admin (update directo con RLS) |
| RN-04 Política 6 h | `reprogramar_reserva` / `cancelar_reserva` |
| RN-05 Concurrencia | Índice único parcial + `SELECT ... FOR UPDATE` |

## 5. Seguridad contenida del repositorio (guard rails)

- Todos los secretos viven en variables de entorno; `.env.example` documenta.
- `SUPABASE_SERVICE_ROLE_KEY` nunca se importa en código cliente.
- Migraciones versionadas, RLS obligatorio, CI obligatorio.

## 6. Roadmap sugerido

1. Flujo de pago con confirmación automática vía webhook (futuro).
2. Generación de QR de Nequi guardado por cancha (imagen configurable).
3. Reportes del administrador (ocupación mensual por cancha).
4. Bloqueo atómico via exclusion constraint (Postgres `btree_gist`) para
   franjas de duración variable.
5. i18n (es/en) y PWA para instalación en el celular.