# 01 — Alcance del MVP y Definition of Done

## Objetivo del MVP

Demostrar funcionalmente que una solicitud estudiantil puede ser:

1. recibida o cargada;
2. transformada en caso;
3. clasificada;
4. priorizada;
5. almacenada;
6. mostrada en una bandeja operativa;
7. revisada/corregida por un humano;
8. seguida hasta su cierre;
9. medida mediante indicadores.

## P0 — obligatorio

- Crear caso desde mensaje de prueba.
- ID único.
- Persistencia en Supabase/PostgreSQL.
- Clasificación temática.
- Extracción de resumen.
- Extracción de fecha límite cuando exista.
- Detección de urgencia.
- Prioridad sugerida.
- Nivel de confianza.
- Responsable/programa sugerido.
- Bandera de revisión humana.
- Detección de caso sensible.
- Bandeja React.
- Filtros por prioridad, categoría, estado, responsable y fecha límite.
- Detalle de caso.
- Modificación manual de prioridad.
- Modificación manual de categoría.
- Reasignación.
- Cambio de estado.
- Historial/auditoría.
- Alertas internas.
- Dashboard de KPIs.
- Dataset sintético.
- Pruebas funcionales.
- n8n workflow importable.
- Instrucciones de instalación/ejecución.
- Demo Mode.

## P1 — recomendado

- Outlook de prueba como trigger real de n8n.
- Mock/manual webhook alternativo.
- Notificación visual de SLA cercano/vencido.
- Configuración editable de SLA.
- Registro de ejecución del clasificador.
- Métrica de override humano.
- RLS básica de Supabase.
- Pruebas unitarias de motor de reglas.
- Pruebas E2E del flujo principal.

## P2 — futuro / no bloquear entrega

- Teams real.
- Entra ID institucional.
- Integración con cuentas institucionales.
- Respuestas automáticas al estudiante.
- Integración SIGA.
- modelos de aprendizaje entrenados con datos institucionales;
- operación 24/7;
- HA, backups productivos y observabilidad institucional.

## Fuera de alcance

- resolver trámites;
- tomar decisiones académicas;
- aprobar/rechazar solicitudes;
- tratar datos sensibles automáticamente;
- reemplazar Outlook/Teams;
- desplegar en producción institucional.

## Definition of Done

Se considera terminado cuando, desde un entorno limpio, un tercero puede:

1. seguir el README;
2. configurar `.env`;
3. inicializar el esquema;
4. importar workflow n8n;
5. ejecutar frontend;
6. inyectar un mensaje sintético;
7. observar un caso creado;
8. ver clasificación/prioridad;
9. modificar prioridad;
10. cambiar estado;
11. ver el cambio en auditoría;
12. generar al menos una alerta;
13. ver KPIs;
14. ejecutar pruebas;
15. reproducir la demo sin datos personales reales.

## Demo crítica

Caso obligatorio para demo:

> "Necesito cancelar una materia antes de mañana porque el sistema no me permite hacerlo y podría perder el plazo."

Debe:

- crear caso;
- clasificar;
- detectar fecha/plazo;
- marcar alta urgencia;
- producir prioridad sugerida;
- aparecer arriba en bandeja;
- permitir override;
- registrar auditoría;
- afectar KPI correspondiente.
