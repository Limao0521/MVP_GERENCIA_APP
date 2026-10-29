# 02 — Requisitos funcionales

## Convenciones

- `MUST`: requerido.
- `SHOULD`: recomendado.
- `MAY`: opcional.
- Todos los cambios relevantes MUST ser auditables.

## Ingesta

### FR-001 — Captura
El sistema MUST aceptar mensajes desde:
- n8n Outlook trigger cuando haya credenciales;
- webhook/manual demo input como fallback.

### FR-002 — Validación de alcance
El flujo MUST determinar si el mensaje corresponde al piloto.

### FR-003 — Caso único
Cada mensaje aceptado MUST generar un `case_id` único.

### FR-004 — Metadatos
MUST registrar:
- origen;
- remitente;
- destinatario;
- fecha/hora;
- programa;
- asunto;
- cuerpo;
- fecha de recepción.

## Clasificación

### FR-010
MUST asignar una categoría inicial.

### FR-011
MUST generar resumen.

### FR-012
MUST intentar extraer fecha límite.

### FR-013
MUST identificar indicadores explícitos de urgencia.

### FR-014
MUST estimar posible impacto académico.

### FR-015
MUST generar `confidence` entre 0 y 1.

### FR-016
MUST detectar si el caso contiene señales de información sensible.

### FR-017
Si la confianza es baja, MUST marcar `needs_human_review=true`.

## Priorización

### FR-020
El motor MUST combinar resultados de IA + reglas deterministas.

### FR-021
Prioridades permitidas:
`urgent | high | medium | low`.

### FR-022
La prioridad MUST almacenarse como sugerida y no definitiva.

### FR-023
El director MUST poder modificarla.

### FR-024
Cada override MUST registrarse en auditoría.

## Routing

### FR-030
El sistema MUST sugerir responsable o programa.

### FR-031
El director MUST poder reasignar.

### FR-032
La reasignación MUST registrarse.

## Workflow

### FR-040
Estados:
- received
- classified
- under_review
- in_progress
- waiting_information
- resolved
- closed

### FR-041
El sistema MUST validar transiciones razonables.

### FR-042
El director MUST poder actualizar estado.

### FR-043
Cerrar un caso MUST registrar `resolved_at/closed_at`.

## Seguimiento

### FR-050
MUST generar alertas por SLA.

### FR-051
MUST generar alerta si un caso permanece sin gestión por 2 días hábiles.

### FR-052
MUST identificar casos próximos a vencer.

### FR-053
MUST identificar casos vencidos.

## Dashboard

### FR-060
MUST mostrar:
- recibidos;
- pendientes;
- cerrados;
- por categoría;
- por prioridad;
- próximos a vencer;
- vencidos;
- cumplimiento SLA;
- overrides/correcciones.

### FR-061
MUST permitir filtros.

### FR-062
MUST permitir ordenar por prioridad y fecha.

## Auditoría

### FR-070
Registrar:
- actor;
- acción;
- fecha/hora;
- campo;
- valor anterior;
- valor nuevo.

### FR-071
La auditoría MUST ser visible en detalle de caso.

## Administración

### FR-080
El administrador SHOULD poder editar:
- categorías;
- SLAs;
- reglas configurables;
- responsables;
- parámetros de alertas.

## Demo

### FR-090
El sistema MUST operar con datos 100 % simulados.

### FR-091
MUST existir una forma de reset/seed para repetir la demo.
