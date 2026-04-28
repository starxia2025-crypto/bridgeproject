# API de Integracion Externa

Documento tecnico para clientes externos que necesiten enviar tickets al servicio.

## Endpoint

```text
POST /api/integrations/external
```

## Cabeceras obligatorias

```text
Content-Type: application/json
x-client-id: TU_CLIENT_ID
x-api-key: TU_API_KEY
```

## Tipos soportados

- `email_change`
- `cancellation`

## Payload base

```json
{
  "externalId": "ext-123",
  "type": "email_change",
  "reporterEmail": "origen@cliente.com",
  "affectedEmail": "usuario@dominio.com",
  "orderId": "PED-001",
  "title": "Cambio de correo",
  "description": "Solicitud recibida desde sistema externo para cambiar correo.",
  "reason": "Cuenta duplicada",
  "newEmail": "usuario.nuevo@dominio.com"
}
```

## Reglas de validacion

- `externalId`: obligatorio y no vacio
- `type`: obligatorio; valores permitidos `email_change` o `cancellation`
- `reporterEmail`: email valido
- `affectedEmail`: email valido
- `orderId`: obligatorio y no vacio
- `title`: minimo 3 caracteres
- `description`: minimo 10 caracteres
- `reason`: obligatorio y no vacio
- `newEmail`: obligatorio si `type = email_change`
- `isbn`: obligatorio si `type = cancellation`
- no se admiten campos extra fuera del contrato

## Respuestas esperadas

Creado:

```json
{
  "ok": true,
  "ticketId": 4866,
  "ticketNumber": "TKT-ABC-123",
  "duplicate": false
}
```

Duplicado:

```json
{
  "ok": true,
  "ticketId": 4866,
  "ticketNumber": "TKT-ABC-123",
  "duplicate": true
}
```

Error de autenticacion:

```json
{
  "ok": false,
  "error": "Unauthorized",
  "message": "No autorizado."
}
```

Error de validacion:

```json
{
  "ok": false,
  "error": "ValidationError",
  "message": "Payload no valido."
}
```

Error de capacidad:

```json
{
  "ok": false,
  "error": "TooManyRequests",
  "message": "Demasiadas solicitudes. Intentalo de nuevo mas tarde."
}
```

Error generico:

```json
{
  "ok": false,
  "error": "InternalServerError",
  "message": "No se pudo procesar la solicitud."
}
```

## Ejemplo curl

```bash
curl -X POST "https://premac.starxia.com/api/integrations/external" \
  -H "Content-Type: application/json" \
  -H "x-client-id: TU_CLIENT_ID" \
  -H "x-api-key: TU_API_KEY" \
  -d '{
    "externalId": "ext-123",
    "type": "email_change",
    "reporterEmail": "origen@cliente.com",
    "affectedEmail": "usuario@dominio.com",
    "newEmail": "usuario.nuevo@dominio.com",
    "orderId": "PED-001",
    "title": "Cambio de correo",
    "description": "Solicitud recibida desde sistema externo para cambiar correo.",
    "reason": "Cuenta duplicada"
  }'
```
