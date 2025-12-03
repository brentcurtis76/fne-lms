# Verificación de Correcciones - Rol Docente v2

**Fecha:** Diciembre 2025
**Ambiente:** Producción (https://www.nuevaeducacion.org)
**Documento Base:** `docs/qa/DOCENTE_FIXES_REQUIRED.md`

---

## Usuarios de Prueba

| Email | Contraseña | Escenario |
|-------|------------|-----------|
| docente.test1@fne-lms.test | Prueba2025! | Escuela con generación + Comunidad |
| docente.test2@fne-lms.test | Prueba2025! | Escuela con generación + Comunidad (diferente) |
| docente.test3@fne-lms.test | Prueba2025! | Escuela sin generación + Comunidad |
| docente.test4@fne-lms.test | Prueba2025! | Escuela con generación + SIN comunidad |
| docente.test5@fne-lms.test | Prueba2025! | Configuración mínima (sin gen/comunidad) |

**Usuarios recomendados para cada prueba:**
- **Secciones 1-4:** Usar `docente.test1` o `docente.test2` (tienen comunidad)
- **Sección 5 (Sidebar):** Usar `docente.test4` o `docente.test5` para verificar que NO ven Espacio Colaborativo

---

## Instrucciones

Para cada prueba:
1. Ejecutar los pasos indicados
2. Marcar con ✅ si funciona correctamente
3. Marcar con ❌ si hay problema (agregar nota)
4. Marcar con ⏭️ si no aplica o no se puede probar

---

## 1. AUTENTICACIÓN Y PERFIL

### 1.1 Recuperación de Contraseña
**Issue Original:** Error al validar enlace de recuperación

**Pasos:**
1. Ir a la página de login
2. Hacer clic en "¿Olvidaste tu contraseña?"
3. Ingresar email de prueba y enviar
4. Abrir el email recibido
5. Hacer clic en el enlace de recuperación
6. Verificar que se abre la página para crear nueva contraseña
7. Ingresar nueva contraseña y confirmar
8. Verificar que se puede hacer login con la nueva contraseña

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

### 1.2 Cambio de Contraseña (Usuario Logueado)
**Nueva funcionalidad:** Cambiar contraseña desde perfil

**Pasos:**
1. Iniciar sesión como docente
2. Ir a Mi Perfil
3. Buscar sección "Cambiar Contraseña"
4. Ingresar contraseña actual
5. Ingresar nueva contraseña y confirmar
6. Hacer clic en "Cambiar Contraseña"
7. Verificar mensaje de éxito
8. Cerrar sesión y volver a entrar con nueva contraseña

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

### 1.3 Avatar Se Actualiza al Cambiar Nombre
**Issue Original:** Iniciales del avatar no se actualizaban

**Pasos:**
1. Iniciar sesión como docente
2. Ir a Mi Perfil
3. Anotar las iniciales actuales del avatar
4. Cambiar el nombre (ej: "Juan" → "Pedro")
5. Guardar cambios
6. Verificar que el avatar muestra las nuevas iniciales
7. Verificar en el header que también cambió
8. Refrescar la página y verificar que persiste

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

## 2. CURSOS INDIVIDUALES

### 2.1 Sidebar con Lista de Lecciones
**Issue Original:** No existía sidebar con lecciones

**Pasos:**
1. Ir a "Mi Aprendizaje" > "Mis Cursos"
2. Hacer clic en un curso para abrirlo
3. Verificar que aparece un sidebar izquierdo con:
   - Lista de todas las lecciones
   - Indicador de lección actual (resaltada)
   - Iconos de check para lecciones completadas
4. Hacer clic en otra lección desde el sidebar
5. Verificar que navega correctamente

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

### 2.2 Navegación Entre Lecciones
**Issue Original:** "Siguiente Lección" llevaba al final en vez del inicio

**Pasos:**
1. Abrir un curso con múltiples lecciones
2. Ir a la primera lección
3. Hacer scroll hacia abajo hasta ver botón "Siguiente Lección"
4. Hacer clic en "Siguiente Lección"
5. Verificar que:
   - La página hace scroll al INICIO de la nueva lección
   - El título de la lección es visible arriba
   - NO muestra "Felicidades has completado" de entrada

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

### 2.3 Persistencia de Progreso
**Issue Original:** Barra de progreso se reseteaba a 0%

**Pasos:**
1. Ir a "Mi Aprendizaje" > "Mis Cursos"
2. Anotar el progreso de un curso (ej: 50%)
3. Abrir el curso
4. Completar una lección adicional
5. Salir del curso (volver a la lista)
6. Verificar que la barra de progreso muestra el nuevo porcentaje
7. Refrescar la página
8. Verificar que el progreso persiste

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

## 3. RUTAS DE APRENDIZAJE

### 3.1 Cargar Cursos desde Ruta
**Issue Original:** Error "No se pudo cargar el curso"

**Pasos:**
1. Ir a "Mi Aprendizaje" > "Mis Rutas"
2. Hacer clic en una ruta asignada
3. Ver la lista de cursos dentro de la ruta
4. Verificar que los cursos muestran títulos (no "Curso sin título")
5. Hacer clic en un curso dentro de la ruta
6. Verificar que el curso carga correctamente
7. Navegar por las lecciones

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

## 4. ESPACIO COLABORATIVO

### 4.1 Acceso al Espacio Colaborativo
**Pasos:**
1. Iniciar sesión como docente con comunidad asignada
2. En el sidebar, hacer clic en "Espacio Colaborativo"
3. Verificar que carga la página del workspace
4. Verificar que muestra el nombre de la comunidad

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

### 4.2 Crear Hilo de Conversación
**Issue Original:** No se podían enviar mensajes

**Pasos:**
1. En el Espacio Colaborativo, hacer clic en "Nuevo Hilo"
2. Ingresar título del hilo
3. Seleccionar categoría
4. Escribir mensaje inicial
5. Hacer clic en "Crear Hilo"
6. Verificar que el hilo aparece en la lista
7. Verificar que el mensaje inicial está visible

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

### 4.3 Enviar Mensajes en Hilo
**Pasos:**
1. Abrir un hilo existente
2. Escribir un mensaje en el campo de texto
3. Hacer clic en "Enviar mensaje" (o presionar Enter)
4. Verificar que el mensaje aparece en la conversación
5. Verificar que muestra tu nombre y timestamp

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

### 4.4 Reacciones a Mensajes
**Nueva funcionalidad**

**Pasos:**
1. En un hilo, buscar un mensaje existente
2. Hacer clic en el ícono de reacción (emoji)
3. Seleccionar una reacción (👍, ❤️, 💡, etc.)
4. Verificar que la reacción aparece debajo del mensaje
5. Hacer clic de nuevo para quitar la reacción
6. Verificar que la reacción desaparece

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

### 4.5 Responder a Mensaje
**Nueva funcionalidad**

**Pasos:**
1. En un hilo, buscar un mensaje
2. Hacer clic en "Responder"
3. Verificar que aparece indicador "Respondiendo a [nombre]"
4. Escribir tu respuesta
5. Enviar el mensaje
6. Verificar que el nuevo mensaje muestra contexto de respuesta
7. Verificar que indica a quién estás respondiendo

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

### 4.6 Editar Mensaje Propio
**Nueva funcionalidad**

**Pasos:**
1. Buscar un mensaje que hayas enviado
2. Hacer clic en el menú de opciones (⋯)
3. Seleccionar "Editar"
4. Verificar que aparece "Editando mensaje" y el texto se carga en el campo
5. Modificar el texto
6. Guardar cambios
7. Verificar que el mensaje muestra el texto actualizado
8. Verificar que aparece indicador "(editado)"

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

### 4.7 Eliminar Mensaje Propio
**Nueva funcionalidad**

**Pasos:**
1. Buscar un mensaje que hayas enviado
2. Hacer clic en el menú de opciones (⋯)
3. Seleccionar "Eliminar"
4. Verificar que aparece un modal de confirmación (NO alert del navegador)
5. El modal debe decir "¿Estás seguro de que deseas eliminar este mensaje?"
6. Hacer clic en "Eliminar"
7. Verificar que el mensaje desaparece de la conversación

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

### 4.8 Subir Imagen en Mensaje
**Nueva funcionalidad**

**Pasos:**
1. En el campo de mensaje, hacer clic en el ícono de adjuntar (📎)
2. Seleccionar una imagen (JPG, PNG)
3. Verificar que aparece preview de la imagen
4. Enviar el mensaje
5. Verificar que la imagen se muestra en el mensaje
6. Verificar que la imagen mantiene su proporción (no se ve estirada/cortada)
7. Hacer clic en la imagen para ver en tamaño completo

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

### 4.9 Subir Documento en Mensaje
**Nueva funcionalidad**

**Pasos:**
1. En el campo de mensaje, hacer clic en el ícono de adjuntar (📎)
2. Seleccionar un documento (PDF, Word, etc.)
3. Verificar que aparece el nombre del archivo
4. Enviar el mensaje
5. Verificar que el documento aparece como tarjeta con ícono
6. Hacer clic en el documento para descargarlo

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

### 4.10 @Menciones en Mensajes
**Pasos:**
1. En el campo de mensaje, escribir "@"
2. Verificar que aparece lista de miembros sugeridos
3. Seleccionar un miembro
4. Verificar que el nombre aparece resaltado en el mensaje
5. Enviar el mensaje
6. Verificar que la mención se ve como link/resaltado

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

## 5. VISIBILIDAD DE SIDEBAR

### 5.1 Espacio Colaborativo Solo para Usuarios con Comunidad
**Issue Original:** Usuarios sin comunidad veían la opción

**Pasos (con usuario SIN comunidad):**
1. Iniciar sesión con usuario sin comunidad asignada
2. Revisar el sidebar
3. Verificar que NO aparece "Espacio Colaborativo"

**Pasos (con usuario CON comunidad):**
1. Iniciar sesión con usuario con comunidad asignada
2. Revisar el sidebar
3. Verificar que SÍ aparece "Espacio Colaborativo"

**Resultado:** [ ] ✅ Funciona | [ ] ❌ Falla | [ ] ⏭️ N/A

**Notas:**
```

```

---

## Resumen de Resultados

| Sección | Total | ✅ | ❌ | ⏭️ |
|---------|-------|-----|-----|-----|
| Autenticación y Perfil | 3 | | | |
| Cursos Individuales | 3 | | | |
| Rutas de Aprendizaje | 1 | | | |
| Espacio Colaborativo | 10 | | | |
| Visibilidad Sidebar | 1 | | | |
| **TOTAL** | **18** | | | |

---

## Problemas Encontrados

### Críticos (Bloquean uso)
```

```

### Altos (Afectan UX significativamente)
```

```

### Medios (Mejoras de UX)
```

```

---

## Notas Adicionales del Tester
```

```

---

**Tester:** ______________________
**Fecha de Pruebas:** ______________________
**Firma:** ______________________
