# Guía de Conversión: XLSX a Markdown para Vías de Transformación

Este documento describe el proceso de conversión de las pestañas del archivo `PROGRESION.xlsx` a archivos Markdown (`.md`) para su uso en el sistema de evaluación de Vías de Transformación.

## Estructura del Archivo XLSX

### Pestañas Disponibles
| Pestaña | Estado | Archivo MD |
|---------|--------|------------|
| APRENDIZAJE | ✅ Convertido | `PROGRESION-APRENDIZAJE.md` |
| PERSONALIZACION | ✅ Convertido | `PROGRESION-PERSONALIZACION.md` |
| EVALUACION | ✅ Convertido | `PROGRESION-EVALUACION.md` |
| PROPOSITO | ⏳ Pendiente | - |
| FAMILIAS | ⏳ Pendiente | - |
| TRABAJO DOCENTE | ⏳ Pendiente | - |
| LIDERAZGO | ⏳ Pendiente | - |

### Columnas del XLSX
| Columna | Contenido |
|---------|-----------|
| **A (OBJETIVOS)** | Texto del objetivo (solo aparece en la primera fila de cada objetivo) |
| **B (ACCION)** | Alternancia: Descripción de acción / Preguntas abiertas |
| **C (REFERENTE)** | Escuelas de referencia (se ignora en la conversión) |
| **D (COBERTURA)** | Alternancia: Niveles de rúbrica / Preguntas abiertas |
| **E (FRECUENCIA)** | Alternancia: Niveles de rúbrica / Preguntas abiertas |
| **F (PROFUNDIDAD)** | Alternancia: Niveles de rúbrica / Preguntas abiertas |

### Patrón de Filas
- **Filas pares** (2, 4, 6...): Contienen texto de Acción + Descriptores de rúbrica (4 niveles)
- **Filas impares** (3, 5, 7...): Contienen Preguntas para cada dimensión

## Estructura del Archivo MD de Salida

```
OBJETIVO X: [texto del objetivo]

    ACCIÓN X: [texto de la acción]
        PREGUNTAS ABIERTAS:
            [pregunta general de la acción]
            [otra pregunta si existe]
        COBERTURA:
            PREGUNTAS ABIERTAS:
                [preguntas específicas de cobertura]
            AUTOEVALUACIÓN:
                Incipiente: [descriptor nivel 1]
                En desarrollo: [descriptor nivel 2]
                Avanzado: [descriptor nivel 3]
                Consolidado: [descriptor nivel 4]
        FRECUENCIA:
            PREGUNTAS ABIERTAS:
                [preguntas específicas de frecuencia]
            AUTOEVALUACIÓN:
                Incipiente: [descriptor nivel 1]
                En desarrollo: [descriptor nivel 2]
                Avanzado: [descriptor nivel 3]
                Consolidado: [descriptor nivel 4]
        PROFUNDIDAD:
            PREGUNTAS ABIERTAS:
                [preguntas específicas de profundidad]
            AUTOEVALUACIÓN:
                Incipiente: [descriptor nivel 1]
                En desarrollo: [descriptor nivel 2]
                Avanzado: [descriptor nivel 3]
                Consolidado: [descriptor nivel 4]

    ACCIÓN X: [siguiente acción...]
```

## Reglas de Conversión

### 1. Numeración
- **OBJETIVOS**: Numerados secuencialmente (1, 2, 3...)
- **ACCIONES**: Numeradas por objetivo (se reinicia a 1 para cada nuevo objetivo)

### 2. Indentación
- Usar **4 espacios** por nivel de jerarquía
- Niveles:
  - Nivel 0: `OBJETIVO`
  - Nivel 1: `ACCIÓN` (4 espacios)
  - Nivel 2: `PREGUNTAS ABIERTAS`, `COBERTURA`, `FRECUENCIA`, `PROFUNDIDAD` (8 espacios)
  - Nivel 3: `PREGUNTAS ABIERTAS` (dentro de dimensión), `AUTOEVALUACIÓN` (12 espacios)
  - Nivel 4: Preguntas individuales, niveles de rúbrica (16 espacios)

### 3. Parsing de Niveles de Rúbrica
El texto de rúbrica viene en un solo bloque, separado por marcadores:
```
Incipiente: [texto]
En desarrollo: [texto]
Avanzado: [texto]
Consolidado: [texto]
```

Dividir por estos marcadores para extraer cada nivel.

### 4. Parsing de Preguntas
Las preguntas vienen separadas por saltos de línea (`\n`). Dividir y crear una línea por cada pregunta.

### 5. Columna REFERENTE
La columna C (REFERENTE) contiene nombres de escuelas de referencia. **Se ignora completamente** en la conversión al MD.

## Script de Conversión (Python)

```python
import openpyxl

def parse_rubric_levels(text):
    """Extrae los 4 niveles de rúbrica del texto."""
    if not text:
        return {}

    levels = {}
    parts = text.split('Incipiente:')
    if len(parts) > 1:
        rest = parts[1]

        if 'En desarrollo:' in rest:
            incipiente, rest = rest.split('En desarrollo:', 1)
            levels['Incipiente'] = incipiente.strip()

        if 'Avanzado:' in rest:
            en_desarrollo, rest = rest.split('Avanzado:', 1)
            levels['En desarrollo'] = en_desarrollo.strip()

        if 'Consolidado:' in rest:
            avanzado, rest = rest.split('Consolidado:', 1)
            levels['Avanzado'] = avanzado.strip()
            levels['Consolidado'] = rest.strip()

    return levels

def format_questions(text):
    """Divide preguntas por saltos de línea."""
    if not text:
        return []
    return [q.strip() for q in text.split('\n') if q.strip()]

def convert_tab_to_md(xlsx_path, tab_name, output_path):
    """Convierte una pestaña del XLSX a formato MD."""
    wb = openpyxl.load_workbook(xlsx_path)
    sheet = wb[tab_name]

    output = []
    objective_num = 0
    action_num = 0

    row = 2  # Saltar encabezado
    while row <= sheet.max_row:
        obj_text = sheet.cell(row=row, column=1).value
        action_text = sheet.cell(row=row, column=2).value

        if not action_text:
            row += 1
            continue

        # Nuevo objetivo
        if obj_text:
            objective_num += 1
            action_num = 0
            output.append(f"OBJETIVO {objective_num}: {obj_text}")
            output.append("")

        # Fila de acción (no empieza con ¿)
        if action_text and not action_text.strip().startswith('¿'):
            action_num += 1

            # Obtener rúbricas de columnas 4, 5, 6
            cob_rubric = sheet.cell(row=row, column=4).value
            frec_rubric = sheet.cell(row=row, column=5).value
            prof_rubric = sheet.cell(row=row, column=6).value

            # Obtener preguntas de la siguiente fila
            next_row = row + 1
            action_questions = sheet.cell(row=next_row, column=2).value
            cob_questions = sheet.cell(row=next_row, column=4).value
            frec_questions = sheet.cell(row=next_row, column=5).value
            prof_questions = sheet.cell(row=next_row, column=6).value

            # Formatear salida
            output.append(f"    ACCIÓN {action_num}: {action_text}")

            if action_questions:
                output.append("        PREGUNTAS ABIERTAS:")
                for q in format_questions(action_questions):
                    output.append(f"            {q}")

            # COBERTURA
            output.append("        COBERTURA:")
            if cob_questions:
                output.append("            PREGUNTAS ABIERTAS:")
                for q in format_questions(cob_questions):
                    output.append(f"                {q}")
            output.append("            AUTOEVALUACIÓN:")
            for level in ['Incipiente', 'En desarrollo', 'Avanzado', 'Consolidado']:
                levels = parse_rubric_levels(cob_rubric)
                if level in levels:
                    output.append(f"                {level}: {levels[level]}")

            # FRECUENCIA
            output.append("        FRECUENCIA:")
            if frec_questions:
                output.append("            PREGUNTAS ABIERTAS:")
                for q in format_questions(frec_questions):
                    output.append(f"                {q}")
            output.append("            AUTOEVALUACIÓN:")
            for level in ['Incipiente', 'En desarrollo', 'Avanzado', 'Consolidado']:
                levels = parse_rubric_levels(frec_rubric)
                if level in levels:
                    output.append(f"                {level}: {levels[level]}")

            # PROFUNDIDAD
            output.append("        PROFUNDIDAD:")
            if prof_questions:
                output.append("            PREGUNTAS ABIERTAS:")
                for q in format_questions(prof_questions):
                    output.append(f"                {q}")
            output.append("            AUTOEVALUACIÓN:")
            for level in ['Incipiente', 'En desarrollo', 'Avanzado', 'Consolidado']:
                levels = parse_rubric_levels(prof_rubric)
                if level in levels:
                    output.append(f"                {level}: {levels[level]}")

            output.append("")
            row += 2  # Saltar fila de preguntas
        else:
            row += 1

    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(output))

# Uso:
# convert_tab_to_md('PROGRESION.xlsx', 'EVALUACION', 'PROGRESION-EVALUACION.md')
```

## Validación

Después de la conversión, verificar:

1. **Conteo de elementos**:
   ```bash
   grep -c "^OBJETIVO" archivo.md      # Número de objetivos
   grep -c "ACCIÓN" archivo.md         # Número de acciones
   grep -c "AUTOEVALUACIÓN" archivo.md # Debe ser acciones × 3
   ```

2. **Estructura consistente**: Cada ACCIÓN debe tener exactamente 3 secciones de dimensión (COBERTURA, FRECUENCIA, PROFUNDIDAD)

3. **Niveles de rúbrica**: Cada AUTOEVALUACIÓN debe tener 4 niveles (Incipiente, En desarrollo, Avanzado, Consolidado)

## Notas Importantes

- Los archivos MD generados son consumidos por el parser en `lib/transformation/rubricData.ts`
- El sistema de evaluación usa estos archivos para generar las preguntas secuenciales
- Mantener la consistencia en el formato es crítico para el funcionamiento del assessment
