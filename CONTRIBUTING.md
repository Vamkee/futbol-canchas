# Guía de contribución

Gracias por contribuir a **Fútbol Reservas**. Este repositorio sigue buenas
prácticas para colaboración: PRs pequeños, revisión obligatoria y calidad
verificada por CI.

## Flujo de trabajo

1. **Haz fork** del repositorio y clona tu copia.
2. Crea una rama descriptiva:

   ```bash
   git checkout -b feat/exportar-reservas
   # o fix/cron-expiracion, docs/arquitectura, etc.
   ```

3. Commitea en español o inglés (consistente con el repo), mensajes claros:

   ```bash
   git commit -m "feat: exportar reservas a CSV desde el dashboard"
   ```

   Convención: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.

4. Verifica antes de abrir el PR:

   ```bash
   npm install
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```

5. Abre el **Pull Request** contra `main`. Completa el
   [template](.github/PULL_REQUEST_TEMPLATE.md): describe qué cambia, por qué y
   cómo lo probaste. Asigna revisores.

## Convenciones de código

- TypeScript estricto, sin `any` innecesarios; tipos compartidos en `src/types`.
- Componentes con `"use client"` solo cuando manejan estado o eventos de navegador.
- Server Components por defecto: consultas a Supabase y RPC en el servidor.
- React Hook Form y Zod: los esquemas viven en `src/lib/validations.ts`.
- Numeración de migraciones Supabase consecutiva: `0005_mi_cambio.sql`.
  **Nunca edites** migraciones ya aplicadas; agrega una nueva.
- Captura los códigos de error del backend (`E_OCUPADA`, ...) en
  `src/lib/constants.ts`.

## Base de datos

- Los cambios de esquema requieren migración nueva **y** pruebas manuales.
- No se puede debilitar RLS: si agregas una tabla, habilita RLS y añade políticas.
- Los RPC de acceso público (`crear_reserva`, etc.) son `security definer` y
  explícitos en `search_path`; replica ese patrón.

## Pruebas

- Reglas de negocio puras → tests Vitest en `src/**/*.test.ts`.
- Regla: **toda regla de negocio (RN) debe tener test unitario**.

## Git/GitHub

- No hagas push directo a `main`; siempre por PR.
- No edites historial ajeno con `rebase`/`force-push` sobre ramas compartidas.
- `main` debe permanecer siempre en verde (CI pasa: lint + typecheck + test + build).

¿Dudas? Abre un issue o pregunta en la discusión del PR. 🙌