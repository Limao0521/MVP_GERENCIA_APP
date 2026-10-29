# 03 — Requisitos no funcionales

## NFR-001 — Reproducibilidad
Un tercero debe poder levantar el MVP siguiendo documentación.

## NFR-002 — Privacidad
No almacenar datos reales en el dataset de prueba.

## NFR-003 — Human-in-the-loop
Ningún resultado de IA debe representarse como decisión académica final.

## NFR-004 — Trazabilidad
Toda modificación manual relevante debe quedar registrada.

## NFR-005 — Modularidad
Separar:
- ingesta;
- análisis IA;
- reglas;
- persistencia;
- presentación.

## NFR-006 — Configurabilidad
Umbrales y SLA no deben quedar dispersos como magic numbers.

## NFR-007 — Degradación controlada
Si OpenAI falla:
- registrar error;
- crear el caso;
- marcar revisión manual;
- no perder la solicitud.

Si n8n falla:
- el error debe ser visible en logs y reintentable.

## NFR-008 — Seguridad
- secretos únicamente en variables de entorno/credenciales;
- nunca commit de API keys;
- mínimo privilegio;
- sanitización básica de inputs;
- RLS cuando corresponda.

## NFR-009 — Usabilidad
La bandeja debe permitir identificar casos urgentes sin abrir cada uno.

## NFR-010 — Performance académica
Objetivo propuesto:
- clasificación típica < 10 s en entorno demo;
- carga de bandeja < 3 s para hasta 1.000 casos.
Estos valores son objetivos técnicos propuestos, no KPIs institucionales del documento fuente.

## NFR-011 — Calidad de código
- TypeScript recomendado;
- lint;
- tests;
- nombres consistentes;
- README;
- arquitectura documentada.

## NFR-012 — Accesibilidad básica
- etiquetas;
- contraste razonable;
- navegación por teclado donde sea simple.

## NFR-013 — Observabilidad
Registrar como mínimo:
- errores de n8n;
- fallo de IA;
- fallo de DB;
- procesamiento;
- casos no clasificables;
- revisiones manuales.
