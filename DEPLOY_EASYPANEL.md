# Deploy en EasyPanel

Esta guía deja el proyecto funcionando en una VPS con EasyPanel mediante tres servicios:

- `postgres`
- `api`
- `web`

La idea recomendada es:

- `web`: `https://helpdesk.tudominio.com`
- `api`: `https://api-helpdesk.tudominio.com`
- `postgres`: servicio interno de EasyPanel sin exponer públicamente

## 1. Requisitos previos

- VPS con EasyPanel funcionando
- Repositorio Git accesible desde EasyPanel
- Dominio o subdominios apuntando a la VPS

## 2. Archivos de Docker ya preparados

Este repo queda listo para desplegar con:

- `Dockerfile.api`
- `Dockerfile.web`
- `docker/nginx/web.conf`
- `.dockerignore`

## 3. Crear el proyecto en EasyPanel

1. Entra en EasyPanel.
2. Crea un proyecto nuevo, por ejemplo `helpdesk-saas`.
3. Conecta el repositorio Git donde has subido este código.

## 4. Crear la base de datos PostgreSQL

1. Dentro del proyecto crea un servicio de tipo PostgreSQL.
2. Ponle nombre: `postgres`.
3. Define:
   - Database: `helpdesk_db`
   - Username: `helpdesk_user`
   - Password: una contraseña fuerte
4. Guarda el servicio.

EasyPanel te mostrará la conexión interna. La `DATABASE_URL` normalmente será parecida a:

```env
postgresql://helpdesk_user:TU_PASSWORD@postgres:5432/helpdesk_db
```

Usa el hostname interno del servicio, normalmente `postgres`.

## 5. Crear el servicio `api`

1. Crea un servicio nuevo de tipo `App`.
2. Elige despliegue por `Dockerfile`.
3. Usa:
   - Name: `api`
   - Dockerfile path: `Dockerfile.api`
   - Port: `3001`

### Variables de entorno del servicio `api`

Añade como mínimo:

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://helpdesk_user:TU_PASSWORD@postgres:5432/helpdesk_db
FRONTEND_URL=https://helpdesk.tudominio.com/
```

Opcionales:

```env
OPENAI_API_KEY=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common
MICROSOFT_REDIRECT_URI=https://api-helpdesk.tudominio.com/api/auth/microsoft/callback
```

### Dominio del servicio `api`

Asigna por ejemplo:

```text
api-helpdesk.tudominio.com
```

### Health check del servicio `api`

Usa:

```text
/api/healthz
```

## 6. Crear el servicio `web`

1. Crea un servicio nuevo de tipo `App`.
2. Elige despliegue por `Dockerfile`.
3. Usa:
   - Name: `web`
   - Dockerfile path: `Dockerfile.web`
   - Port: `80`

### Build args del servicio `web`

Añade estos build args:

```env
PORT=4173
BASE_PATH=/
VITE_API_BASE_URL=https://api-helpdesk.tudominio.com
```

`VITE_API_BASE_URL` es importante porque el frontend queda preparado para consumir la API desde un subdominio separado.

### Dominio del servicio `web`

Asigna por ejemplo:

```text
helpdesk.tudominio.com
```

## 7. Primer despliegue

Despliega primero:

1. `postgres`
2. `api`
3. `web`

Cuando `api` termine de construir, todavía faltará crear las tablas.

## 8. Crear las tablas en PostgreSQL

El proyecto usa Drizzle. Para crear el esquema:

1. Abre la terminal/console del servicio `api` en EasyPanel.
2. Ejecuta:

```bash
pnpm --filter @workspace/db run push
```

Ese comando usará `DATABASE_URL` y creará las tablas del sistema.

## 9. Crear el primer superadmin

Después de crear las tablas, desde la terminal del servicio `api` ejecuta:

```bash
export SEED_SUPERADMIN_EMAIL=admin@tudominio.com
export SEED_SUPERADMIN_PASSWORD='CambiaEsto123!'
export SEED_SUPERADMIN_NAME='Administrador Principal'
export SEED_TENANT_NAME='Tenant Principal'
export SEED_TENANT_SLUG='principal'
pnpm --filter @workspace/scripts run seed:admin
```

Eso hará dos cosas:

- crear el tenant si no existe
- crear un usuario `superadmin` si no existe

## 10. Verificaciones rápidas

### API

Abre:

```text
https://api-helpdesk.tudominio.com/api/healthz
```

Debe responder:

```json
{"status":"ok"}
```

### Web

Abre:

```text
https://helpdesk.tudominio.com
```

Inicia sesión con el usuario que acabas de sembrar.

## 11. Actualizar el proyecto después de cambios

Cada vez que subas cambios a Git:

1. EasyPanel reconstruirá `api` y `web`.
2. Si cambiaste esquema de base de datos, entra otra vez en la terminal del servicio `api` y ejecuta:

```bash
pnpm --filter @workspace/db run push
```

## 12. Variables importantes

### `api`

```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://helpdesk_user:TU_PASSWORD@postgres:5432/helpdesk_db
FRONTEND_URL=https://helpdesk.tudominio.com/
OPENAI_API_KEY=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT_ID=common
MICROSOFT_REDIRECT_URI=https://api-helpdesk.tudominio.com/api/auth/microsoft/callback
```

### `web`

Build args:

```env
PORT=4173
BASE_PATH=/
VITE_API_BASE_URL=https://api-helpdesk.tudominio.com
```

## 13. Notas importantes

- `postgres` no debe exponerse públicamente.
- Si cambias el dominio del frontend, actualiza también `FRONTEND_URL`.
- Si activas Microsoft OAuth, el redirect URI debe apuntar al servicio `api`.
- El frontend está preparado para consumir la API desde un dominio separado gracias a `VITE_API_BASE_URL`.
