# 📝 Sistema de Feedback - Guía de Usuario

## Descripción General

El sistema de feedback de FNE LMS permite a los usuarios reportar errores, sugerir ideas y proporcionar comentarios sobre la plataforma. Los usuarios pueden enviar feedback con capturas de pantalla, y los administradores pueden gestionar y responder a todas las solicitudes.

## 🎯 Para Usuarios de la Plataforma

### Cómo Enviar Feedback

1. **Encuentra el Botón de Feedback**
   - Busca el botón flotante amarillo en la esquina inferior derecha de cualquier página
   - Tiene un ícono de mensaje y pulsa para llamar tu atención
   - El tooltip dice "¿Encontraste un problema? ¡Cuéntanos!"

2. **Envía tu Feedback**
   - Haz clic en el botón flotante para abrir el modal de feedback
   - Escribe una descripción del problema o sugerencia
   - Selecciona el tipo: **Problema** (error) o **Idea** (sugerencia)
   - Opcionalmente adjunta una captura de pantalla haciendo clic o arrastrando una imagen
   - Haz clic en **"Enviar →"** para enviar

3. **Qué Pasa Después**
   - Verás un mensaje de éxito con un número de referencia (ej: #FB-A1B2C3D4)
   - Los administradores serán notificados automáticamente
   - El modal se cierra después de 3 segundos

### Consejos para un Buen Feedback

- **Sé específico**: En lugar de "no funciona", describe exactamente qué pasó
- **Incluye pasos**: "Cuando hago clic en el botón guardar después de editar mi perfil..."
- **Agrega capturas**: Una imagen vale más que mil palabras
- **Elige el tipo correcto**: Usa "Problema" para errores, "Idea" para sugerencias

## 🛠️ Para Administradores

### Acceder al Panel de Feedback

1. Navega a **Configuración → Feedback** en la barra lateral
2. Verás el panel de feedback con:
   - Tarjetas de estadísticas resumidas
   - Opciones de filtro por estado y tipo
   - Lista de todas las solicitudes de feedback

### Gestionar Feedback

#### Características del Panel
- **Tarjetas de Estadísticas**: Resumen rápido de feedback nuevo, en progreso y resuelto
- **Filtros de Estado**: Filtrar por Nuevo, Visto, En Progreso, Resuelto
- **Filtros de Tipo**: Filtrar por Reportes de errores, Ideas, o Feedback general
- **Búsqueda**: Encontrar feedback específico por descripción o usuario

#### Acciones de Feedback
Para cada elemento de feedback, puedes:

1. **Ver Detalles**: Haz clic en cualquier feedback para ver:
   - Descripción completa e información del usuario
   - Capturas de pantalla (si están adjuntas)
   - Información del navegador y técnica
   - Línea de tiempo de actividad con comentarios

2. **Actualizar Estado**:
   - **Nuevo** → **En Progreso** (cuando empiezas a trabajar en ello)
   - **En Progreso** → **Resuelto** (cuando está arreglado/implementado)
   - **Resuelto** → **Cerrado** (estado final)

3. **Agregar Comentarios**:
   - Usa el sistema de comentarios para comunicarte con tu equipo
   - Documenta soluciones o pide aclaraciones
   - Los comentarios aparecen en la línea de tiempo de actividad

### Sistema de Notificaciones

Los administradores reciben automáticamente notificaciones cuando:
- Se envía nuevo feedback
- Ocurren cambios de estado
- Se agregan comentarios

Revisa el ícono de campana de notificaciones en el encabezado para actualizaciones.

## 📧 Detalles Técnicos

### Categorías de Feedback

| Tipo | Descripción | Ícono | Color |
|------|-------------|-------|-------|
| **bug** | Problemas de plataforma, errores, funciones rotas | ⚠️ AlertCircle | Rojo |
| **idea** | Solicitudes de funciones, mejoras, sugerencias | 💡 Lightbulb | Azul |
| **feedback** | Comentarios generales, preguntas | 💬 MessageSquare | Gris |

### Flujo de Estados

```
Nuevo → Visto → En Progreso → Resuelto → Cerrado
```

- **Nuevo**: Recién enviado, necesita revisión inicial
- **Visto**: El administrador ha visto el feedback
- **En Progreso**: Se ha comenzado a trabajar en el problema
- **Resuelto**: Problema arreglado o sugerencia implementada
- **Cerrado**: Estado final, feedback completamente procesado

### Almacenamiento y Datos

- **Capturas**: Almacenadas de forma segura en Supabase storage con URLs automáticas
- **Info del Navegador**: Capturada automáticamente para depuración técnica
- **Datos del Usuario**: Vinculados a perfiles de usuario para contexto
- **Registro de Actividad**: Rastro de auditoría completo de todas las acciones

## 🔧 Solución de Problemas

### Problemas Comunes

**"No puedo ver el botón de feedback"**
- Verifica si estás logueado
- Refresca la página
- Limpia la caché del navegador

**"Falla la subida de imagen"**
- Tamaño máximo de archivo: 5MB
- Formatos soportados: JPG, PNG, WebP, GIF
- Verifica tu conexión a internet

**"Error al enviar feedback"**
- Verifica tu conexión a internet
- Asegúrate de haber escrito una descripción
- Intenta refrescar y enviar de nuevo

### Para Desarrolladores

**Comandos de Prueba**
```bash
# Ejecutar pruebas del sistema de feedback
npm test -- __tests__/components/feedback/ --run

# Modo observación para desarrollo
npm test -- __tests__/components/feedback/ --watch
```

**Tablas de Base de Datos**
- `platform_feedback` - Entradas principales de feedback
- `feedback_activity` - Comentarios y cambios de estado
- `notifications` - Notificaciones de administrador

## 📞 Soporte

Si encuentras problemas con el sistema de feedback:

**Soporte Técnico**: Brent Curtis  
📱 **Teléfono**: +56941623577  
📧 **Email**: bcurtis@nuevaeducacion.org

---

*Generado con ❤️ para la plataforma FNE LMS*