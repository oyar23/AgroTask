# Decisiones del proyecto

Log cronológico de decisiones técnicas que afectan el modelo, la
seguridad o cómo trabajamos. Las decisiones nuevas van arriba.

---

## 2026-04-28 · Policy `profiles_select` expandida para cubrir el caso jefe→empleado

La versión original de la policy solo permitía ver profiles del mismo
campo via `profiles.campo_id = current_user_campo_id()`. Eso no
contemplaba el caso de un jefe con `profile.campo_id = NULL` (estado
normal cuando recién creó el campo y no se autoasignó), que no podía
ver a sus empleados.

Se agregó una tercera cláusula:

```sql
OR campo_id IN (SELECT id FROM campos WHERE jefe_id = auth.uid())
```

que matchea por la relación de **autoridad** (`campos.jefe_id`) en
lugar de **pertenencia** (`profiles.campo_id`).

Detalle completo y caso de estudio en `docs/01-schema-y-rls.md`,
sección "Caso de estudio: el jefe ciego".
