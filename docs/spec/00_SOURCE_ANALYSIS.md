# 00 — Análisis integral del proyecto

## 1. Problema operativo

El proyecto aborda la gestión de comunicaciones de estudiantes hacia directores de programa de la Facultad de Ingeniería. El problema central no es la inexistencia de canales digitales: Outlook y Teams ya existen. El problema es que el flujo actual depende de lectura, clasificación, priorización, direccionamiento y seguimiento manual.

Consecuencias principales identificadas:

- alto volumen de mensajes;
- priorización manual;
- dependencia de la lectura individual;
- demoras;
- falta de trazabilidad;
- reprocesos;
- mensajes duplicados;
- riesgo de no detectar solicitudes críticas a tiempo;
- incertidumbre del estudiante sobre el estado de la solicitud.

## 2. Estado AS-IS

Flujo actual:

1. El estudiante identifica una necesidad.
2. Envía mensaje por Outlook o Teams.
3. El director recibe la comunicación.
4. Lee manualmente el mensaje.
5. Evalúa importancia y urgencia.
6. Decide si lo atiende o lo direcciona.
7. Responde o gestiona.
8. Realiza seguimiento.
9. Cierra.

La mayor carga manual está en revisión, priorización, clasificación, direccionamiento, respuesta y seguimiento.

## 3. Línea base preliminar

Los valores actuales son académicos/preliminares y deben tratarse como hipótesis de línea base hasta que se validen con pruebas.

| KPI | Línea base |
|---|---:|
| Tiempo promedio de primera revisión | 3,8 días hábiles |
| Tiempo promedio de respuesta | 2,3 semanas (~11,5 días hábiles) |
| Tiempo de clasificación/priorización | 2,1 días hábiles |
| Mensajes con seguimiento manual | 45 % |
| Solicitudes reasignadas | 18 % |
| Solicitudes duplicadas | 23 % |
| Solicitudes críticas atendidas oportunamente | 72 % |
| Trazabilidad estructurada | No estructurada |

## 4. Objetivo del TO-BE

Transformar mensajes no estructurados en **casos estructurados, clasificados, priorizados y trazables**, sin reemplazar Outlook/Teams ni sustituir el criterio humano.

Flujo objetivo:

**Estudiante → Outlook/Teams → captura → registro del caso → clasificación → priorización → bandeja → revisión del director → gestión/respuesta → estado → seguimiento → cierre**

## 5. Automatización prevista

Automatizado o asistido:

- captura;
- generación de identificador;
- clasificación temática;
- priorización sugerida;
- organización en bandeja;
- alertas;
- trazabilidad;
- cálculo de métricas;
- recordatorios.

Manual/humano:

- decisiones académicas;
- respuesta definitiva;
- revisión de casos ambiguos;
- modificación de categoría/prioridad;
- gestión de datos sensibles;
- cierre cuando requiere juicio humano.

## 6. Categorías iniciales

1. Matrícula
2. Asignaturas
3. Requisitos académicos
4. Prácticas profesionales
5. Fechas y plazos
6. Situaciones académicas particulares
7. Solicitudes generales
8. Otros

## 7. Prioridades

- Urgente
- Alta
- Media
- Baja

La prioridad automática siempre es una **sugerencia**.

## 8. Estados definidos

`Recibido → Clasificado → En revisión → En gestión → Pendiente de información → Resuelto → Cerrado`

El sistema debe conservar historial de cambios.

## 9. Roles

### Estudiante
Continúa enviando comunicaciones mediante canales oficiales.

### Director de programa
Usuario principal. Revisa casos, modifica prioridad/categoría, gestiona, reasigna y cambia estados.

### Personal administrativo
Gestiona casos asignados.

### Administrador de la solución
Administra categorías, reglas, usuarios, responsables, alertas y parámetros de SLA.

### Equipo de TI / DTI
Responsable técnico en una implementación institucional futura.

## 10. Arquitectura ya decidida en el proyecto

- Outlook: canal inicial del MVP.
- n8n Cloud: orquestador.
- OpenAI: análisis de lenguaje natural.
- Motor de reglas: ajuste determinista de prioridad.
- Supabase/PostgreSQL: almacenamiento.
- React: interfaz web.
- Vercel: frontend hosting.
- FastAPI: opcional.
- Teams: canal futuro.
- Entra ID: autenticación objetivo futura.

## 11. Restricciones

- No usar datos personales reales sin autorización.
- No depender de integraciones institucionales si no hay permisos.
- No tomar decisiones académicas automáticamente.
- No enviar respuestas definitivas automáticas.
- No asumir disponibilidad 24/7 ni SLA productivos.
- Casos sensibles requieren revisión humana.
- El MVP debe ser reproducible con datos simulados.

## 12. Hallazgos de diseño

El MVP debe probar cuatro hipótesis:

1. Es posible convertir una comunicación no estructurada en un caso trazable.
2. La IA puede apoyar el triage sin reemplazar al director.
3. Las reglas deterministas pueden convertir señales extraídas en una prioridad operativa consistente.
4. La bandeja y el historial permiten medir y reducir el esfuerzo operativo.

## 13. Decisiones adicionales propuestas para implementación

Las siguientes decisiones **no estaban definidas numéricamente en el documento fuente** y por ello deben tratarse como parámetros configurables del MVP:

- umbral de confianza de IA: valor inicial propuesto `0.70`;
- prioridad conservadora para información insuficiente: `Media + needs_human_review=true`;
- ventana exacta para determinar "fecha límite cercana": se propone derivarla de los SLA del proyecto;
- Demo Mode sin integraciones externas para asegurar reproducibilidad;
- API interna y formato JSON exacto de salida del modelo.

Claude puede modificar estos valores si deja la configuración externalizada y documentada.
