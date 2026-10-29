# 12 — Estrategia de pruebas y evaluación

## Objetivo

Demostrar:
1. funcionamiento;
2. consistencia;
3. trazabilidad;
4. valor operacional.

## Tipos

### Unit tests
- motor de prioridad;
- cálculo de SLA;
- transiciones;
- validación de categorías;
- parsing de AI output.

### Integration tests
- webhook → n8n → Supabase;
- AI → rules;
- frontend → Supabase;
- update → audit event.

### E2E
Mensaje → caso → bandeja → override → estado → cierre.

## Dataset

Usar `synthetic_cases.csv`.

Separar:
- development/fixtures;
- evaluation set.

No optimizar manualmente para cada caso de evaluación.

## Métricas técnicas

- category accuracy;
- priority accuracy;
- urgent recall;
- routing accuracy;
- sensitive-case recall;
- low-confidence/manual-review behavior;
- average processing latency;
- traceability completeness;
- duplicate prevention rate.

## Métricas operacionales

Medir cuando sea posible:

- tiempo de clasificación;
- tiempo primera revisión;
- cumplimiento SLA;
- override rate;
- % trazabilidad.

No afirmar que las metas AS-IS → TO-BE fueron logradas sin evidencia.

## Métrica prioritaria recomendada

`Urgent Recall`

Porque un falso negativo urgente tiene mayor impacto operacional que clasificar mal una consulta general.

## Criterios propuestos para demo académica

No son metas oficiales del documento; son criterios técnicos sugeridos:

- category accuracy >= 80 % en dataset sintético;
- urgent recall >= 90 %;
- sensitive recall = 100 % en fixtures críticos;
- traceability completeness = 100 % en cambios de prueba;
- ningún caso perdido ante fallo simulado de IA;
- workflow demo end-to-end exitoso.

## Evidencia

Guardar:
- resultado de tests;
- export de métricas;
- screenshots;
- timestamps;
- tabla expected vs predicted;
- errores encontrados y correcciones.
