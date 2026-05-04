# Plan de testing manual del MVP

Tests pendientes después del fix del dropdown de empleado, en orden
de riesgo (más crítico arriba). Cada paso tiene sub-puntos numerados
para reportar resultados (ej: "2.C falla porque...").

Mientras testeás, si algo rompe, anotá el ID del sub-paso, el
mensaje exacto y lo que ves en la consola del browser. Después
arreglamos uno por uno desde el más crítico hasta que ande todo.

---

## 1. Editar / eliminar tarea + filtros (jefe)

Ya empezado por separado en una conversación anterior — terminar
estos sub-puntos antes de avanzar al 2.

### 1.A — Editar tarea

1. Logueado como jefe en localhost:8081.
2. Tap en una tarea existente.
3. Tap en **Editar**.
4. Cambiá el título por algo distinto.
5. Cambiá el empleado (si hay otro) o dejalo igual.
6. Tap **Guardar**.

Reportar: ¿el form se prellenó con los datos actuales?
¿El dropdown mostró el empleado actual seleccionado, no el
placeholder? ¿Guardar volvió al detalle con los datos
actualizados?

### 1.B — Eliminar tarea

1. En el detalle de una tarea.
2. Tap en **Eliminar** (botón secundario).
3. Aparece confirm "¿Eliminar tarea? Esta acción no se puede
   deshacer." → tap **OK / Aceptar**.

Reportar: ¿apareció el confirm dialog (en web es `window.confirm`
nativo)? ¿Volvió al listado con la tarea ya removida? Probar
también el caso **Cancel** → no se elimina.

### 1.C — Filtros del listado

**Chips de estado** (fila horizontal):
- "Todas" / "Pendientes" / "En curso" / "Hechas".
- Tap en cada uno → el listado se filtra al instante.

**Dropdown de empleado**:
- Default: "Todos los empleados".
- Elegir un empleado → solo sus tareas.
- Volver al placeholder → todos.

**Combinaciones**: ej "Pendientes" + Maxi → solo pendientes
de Maxi.

**Pull to refresh**: pull-down en el listado → spinner verde,
recarga.

---

## 2. Flujo del empleado

Setup: logout del jefe → vuelve a `/login`.

### 2.A — Login y listado

1. Login con cuenta de empleado (Maxi: `maxi@test.com` /
   `test1234` o el password que tenga).
2. Te lleva a `/(empleado)`. Arriba dice "Hola, [tu nombre]".
3. Por default está seleccionado el chip **"Pendientes"**
   (no "Todas").
4. Aparecen las tareas que el jefe creó para Maxi en
   estado pendiente.

Reportar: ¿aparece la lista? ¿El nombre del header está bien?
¿Hay alguna tarea esperada que no aparece?

### 2.B — Filtros del empleado

Mismos chips que el jefe pero sin dropdown de empleado:
- "Todas" → todas.
- "En curso" → vacío al principio.
- "Hechas" → vacío al principio.
- Pull to refresh.

### 2.C — Cambio de estado de tarea (lo más importante)

1. Tap en una tarea pendiente → entra al detalle.
2. Aparece botón **"Marcar en curso"** (porque estado=pendiente).
   Tap.
3. La tarea se actualiza, el botón cambia a **"Marcar como
   hecha"**.
4. Tap "Marcar como hecha". El botón cambia a **"Reabrir tarea"**
   (variante secundaria).
5. Volver al listado (back). En "Pendientes" la tarea ya no
   aparece. En "Hechas" sí.

### 2.D — Verificación cruzada con el jefe

1. Logout del empleado, login del jefe.
2. Dashboard del jefe → el progreso de Maxi tiene que reflejar
   la tarea hecha.
3. En `/tareas` → filtrar por "Hechas" → la tarea aparece.

Reportar: ¿el cambio de estado se vio reflejado en ambos lados
sin refrescar manual?

---

## 3. Fotos (Fases 5A + 5B)

**ANTES**: aplicar las 3 policies de storage por dashboard.
Instrucciones detalladas en `docs/05-fotos.md` (versión modificada,
sin commitear todavía). Resumen:

1. Crear bucket `fotos` privado en Supabase Storage (si no lo
   hiciste).
2. Tab Policies del bucket → New policy → For full customization →
   crear las 3 (insert, select, delete) con las expresiones del
   doc.

### 3.A — Subir foto como empleado

1. Login como Maxi → entrar a una tarea (cualquier estado).
2. Scroll abajo hasta sección "Fotos" → tap en `FotoUploader`.
3. Permitir acceso a galería/cámara → elegir imagen.
4. Esperar que termine de subir → aparece en la grilla.

Errores típicos:
- "No tenés permiso para esta foto" → falta policy INSERT o el
  bucket no se llama `fotos`.
- Sube pero no se ve → falta SELECT.
- Error genérico → mandar el mensaje de la consola.

### 3.B — Ver y borrar

- Tap en miniatura → modal full screen.
- Cerrar modal → vuelve a grilla.
- Borrar foto (si el botón aparece al toque/long-press) →
  desaparece.

### 3.C — Ver desde el jefe

1. Logout, login jefe → ir a la tarea con la foto.
2. En el detalle, sección "Fotos del empleado" → ve la foto.
3. Verificar si el jefe puede borrar fotos de empleados (la
   policy DELETE permite owner o jefe del campo).

---

## 4. Signup desde cero

Cuentas NUEVAS, no tocar las existentes.

### 4.A — Jefe nuevo

1. Logout. En `/login` → "Registrate".
2. Nombre, email nuevo (ej: `jefe2@test.com`), password 6+ chars,
   confirmar.
3. Rol **"Soy jefe"** → no aparece campo "Código del campo".
4. "Crear cuenta" → dashboard del jefe **sin campo**.
5. Crear campo nuevo (ej: "Campo Sur", "SUR1"). Guardar.
6. Anotar el código generado/asignado.

### 4.B — Empleado nuevo del campo nuevo

1. Logout. Registro empleado.
2. Email, password, rol **"Soy empleado"** → aparece "Código del
   campo" → poner el código de 4.A (ej `SUR1`).
3. Crear cuenta → `/(empleado)` con lista vacía y mensaje
   "Cuando tu jefe te asigne una…".

### 4.C — Verificación cruzada

1. Logout, login con jefe nuevo.
2. Crear tarea para el empleado nuevo.
3. Logout, login con empleado nuevo → ver la tarea.

Reportar: ¿algún form tira errores raros? ¿El código del campo
se reconoce bien?

**Edge case (no obligatorio)**: registro de empleado con código
inválido (`XXXX99`) → "No existe un campo con ese código".

---

## 5. Edge cases sueltos

Pruebas cortas, una por una.

- **5.A** Logout → vuelve a `/login`.
- **5.B** Re-login misma cuenta → dashboard sin "Cargando…"
  eterno.
- **5.C** F5 estando logueado en web → debería ir a `/login`
  (web no persiste storage por el guard de SSR).
- **5.D** Login con email/password incorrectos → "Email o
  contraseña incorrectos" (no el error crudo de Supabase).
- **5.E** Crear tarea con título de 2 chars → "El título debe
  tener al menos 3 caracteres".
- **5.F** Descripción muy larga (> 2000 chars) → "La descripción
  es demasiado larga".
- **5.G** Crear tarea sin elegir empleado → "Asigná un empleado"
  (el fix del último commit).
- **5.H** `DatePickerField` con `minimumDate={new Date()}` →
  no debería aceptar fechas pasadas.

---

## Lo que queda fuera del MVP

- **Fase 6 (push notifications)**: requiere dev build de EAS,
  no funciona en Expo Go. Preparada en código pero comentada en
  `lib/auth-store.ts` (los TODO de `registrarParaPush`).
- **Multi-campo por usuario**: un jefe = un campo. Si querés
  agregar varios campos por jefe, es post-MVP.
- **Edición de campo**: hoy el jefe crea el campo una sola vez,
  no se puede editar desde la app.
- **Comentarios en tareas**: en `/(empleado)/tareas/[id].tsx`
  línea 110-112 hay un placeholder "Próximamente".
