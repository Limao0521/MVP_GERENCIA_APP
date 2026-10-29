# 07 — Reglas de negocio y SLA

## Reglas fuente del proyecto

### BR-001 — Human review
Clasificación y prioridad no son definitivas hasta revisión humana.

### BR-002 — Información insuficiente
Marcar para revisión humana y usar una prioridad conservadora.

### BR-003 — Casos sensibles
No ejecutar decisiones automáticas definitivas.

### BR-004 — Seguimiento
Casos pendientes mucho tiempo generan alerta.

### BR-005 — Fecha límite
Una fecha límite detectada debe almacenarse y afectar prioridad.

### BR-006 — Override
El director puede modificar categoría y prioridad.

### BR-007 — Auditoría
Todo override debe quedar registrado.

## SLA inicial

| Prioridad | Objetivo primera revisión |
|---|---|
| Urgente | mismo día hábil |
| Alta | <= 1 día hábil |
| Media | <= 2 días hábiles |
| Baja | <= 5 días hábiles |

Regla adicional del proyecto:
- sin gestión por 2 días hábiles → alerta de seguimiento.

## Reglas operativas propuestas para hacer el MVP determinista

> Estas reglas concretan el comportamiento técnico porque el documento fuente no define todos los umbrales numéricos. Deben estar en configuración y no hard-coded.

### PRIORITY-01
Si `sensitive=true`:
- `needs_human_review=true`;
- no ejecutar acciones automáticas finales;
- calcular prioridad sólo como indicación interna.

### PRIORITY-02
Si fecha límite está vencida o vence dentro del día hábil actual:
- `suggested_priority=urgent`.

### PRIORITY-03
Si la fecha límite está a <= 1 día hábil:
- `suggested_priority=urgent`.

### PRIORITY-04
Si fecha límite está a <= 2 días hábiles:
- `suggested_priority=high`.

### PRIORITY-05
Si `impact=high` y `urgency in [critical, high]`:
- mínimo `high`.

### PRIORITY-06
Si `urgency=critical`:
- `urgent`.

### PRIORITY-07
Si no hay señales críticas y la categoría es `Solicitudes generales`:
- `low`, salvo señales contrarias.

### PRIORITY-08
Si existe información insuficiente:
- `medium`;
- `needs_human_review=true`.

### PRIORITY-09
Si confidence < threshold:
- mantener prioridad sugerida por reglas;
- marcar revisión humana.

## Orden de precedencia

1. seguridad/sensibilidad;
2. fecha límite;
3. urgencia explícita;
4. impacto;
5. categoría;
6. fallback conservador.

## Alertas

### ALERT-001
SLA de primera revisión próximo a vencer.

### ALERT-002
SLA de primera revisión vencido.

### ALERT-003
Caso sin gestión por 2 días hábiles.

### ALERT-004
Fecha límite académica dentro de 24 h.

### ALERT-005
Caso sensible pendiente de revisión.

## Transiciones

Permitidas por defecto:

```text
received -> classified
classified -> under_review
under_review -> in_progress
under_review -> waiting_information
in_progress -> waiting_information
waiting_information -> in_progress
in_progress -> resolved
resolved -> closed
```

Administrador puede reabrir `closed -> under_review` sólo si Claude decide implementarlo; si se implementa debe quedar auditado.

## Business days

Para el MVP:
- lunes a viernes;
- no modelar festivos inicialmente;
- documentar esta limitación.
