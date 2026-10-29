# 09 — Frontend React / UX

## Objetivo

El usuario debe identificar qué necesita atención sin leer todos los mensajes.

## Pantallas

### 1. Dashboard `/`

Cards:
- casos recibidos;
- pendientes;
- urgentes;
- vencidos;
- cumplimiento SLA;
- overrides.

Gráficos/tablas simples:
- por categoría;
- por prioridad;
- estado;
- tendencia por fecha si hay datos suficientes.

### 2. Bandeja `/cases`

Columnas:
- case_number
- received_at
- subject
- category
- current_priority
- status
- detected_deadline
- assigned_to
- SLA badge
- review flag

Filtros:
- prioridad
- categoría
- estado
- programa
- responsable
- fechas
- revisión humana
- sensible

Orden:
- prioridad;
- fecha límite;
- recepción.

### 3. Detalle `/cases/:id`

Secciones:

**Mensaje original**
- subject
- sender
- received_at
- body

**AI analysis**
- summary
- category
- confidence
- urgency
- impact
- detected_deadline
- suggested responsible
- sensitive/review flags

**Operational decision**
- current priority
- category override
- assigned_to
- status

Acciones:
- accept suggestion;
- change category;
- change priority;
- reassign;
- change status;
- resolve;
- close.

**Timeline**
Historial completo.

**Alerts**
Activas y reconocidas.

### 4. Admin `/admin`

P1:
- categorías;
- SLA;
- responsables;
- threshold de confianza.

## Demo Injector

Sólo visible en Demo Mode:
`/demo`

Formulario:
- sender
- recipient
- academic program
- subject
- body
- received_at

Botones:
- Send to n8n webhook
- Load sample scenario

## UX rules

- Urgente debe ser visualmente evidente sin depender sólo de color.
- Mostrar siempre "Suggested by system" vs "Current decision".
- Mostrar "Human review required".
- Mostrar advertencia en sensible.
- No exponer raw AI reasoning; sólo `reasoning_summary`.
- Loading/error/empty states obligatorios.

## Responsive

Desktop primero. Debe funcionar razonablemente en tablet.
