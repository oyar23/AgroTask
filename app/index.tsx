// Ruta "/" sin contenido propio: el efecto del layout raíz redirige al grupo
// correcto (auth, jefe o empleado) según el estado del store. Render vacío
// para evitar parpadeo entre el momento en que se monta el Stack y se ejecuta
// el replace.
export default function Index() {
  return null;
}
