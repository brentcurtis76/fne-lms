# Protocolo de prueba de equipos y red — Videollamadas GENERA

> **Para quién es esto:** consultoras y consultores de FNE que visitan colegios.
> No necesitas saber nada técnico. Sigue los pasos, anota lo que ves y envía la
> planilla.
>
> **Para qué sirve:** decidir si las videollamadas pueden funcionar *dentro* de
> GENERA en los computadores que los colegios realmente tienen, o si conviene
> que la reunión se abra en la aplicación de Zoom aparte. Esa decisión depende
> de estos datos, no de una opinión.
>
> **Estado actual:** la **Parte A** (diagnóstico del equipo) se puede hacer hoy.
> La **Parte B** (entrar a una reunión de prueba) está **bloqueada** hasta que
> exista una reunión de prueba; se habilita en la etapa Z0B-2. No intentes
> hacer la Parte B todavía.
>
> Referencia técnica: `docs/planning/zoom-integration-plan.md` §17 ·
> Resultados: `docs/planning/zoom-spike-results.md` §7.

---

## Antes de salir a terreno

**Lleva contigo:**

- Tu cuenta de GENERA con sesión iniciada (o tus credenciales a mano).
- Esta planilla, impresa o en el teléfono.
- Audífonos con micrófono (por si el equipo del colegio no tiene).

**Coordina con el colegio:**

- Pide acceso a **los computadores que de verdad usan los equipos directivos y
  docentes**, no al mejor computador del colegio. El dato útil es el del
  computador cotidiano.
- Pregunta si hay una sala donde la señal de internet sea mala. Esa sala también
  nos interesa.
- Avisa que vas a pedir permiso de cámara y micrófono en el navegador.

**Regla de oro:** si algo falla, **eso también es un resultado**. Anótalo tal
como pasó. Un "no funcionó" bien descrito vale más que un "más o menos".

---

## Qué equipos y en qué navegadores probar

Prueba **todas las combinaciones que existan** en ese colegio. Si una no existe,
márcala "no disponible" y sigue. No hace falta conseguir equipos que el colegio
no tiene.

### Equipos

| Código | Equipo | Prioridad |
|---|---|---|
| **P0-a** | Windows 10, 4 GB de RAM, procesador de 2 núcleos, disco duro antiguo (no SSD) | Alta |
| **P0-b** | Windows 11, procesador i5 o similar | Alta |
| **P1-a** | Chromebook con 4 GB | Media |
| **P1-b** | Tablet Android | Media |

Los equipos **P0** son los que definen la decisión: son los más modestos que
esperamos encontrar. Si funciona en un P0, funciona en todo lo demás.

> ¿No sabes qué equipo es? No importa. La página de diagnóstico de la Parte A te
> lo dice sola: anota lo que aparece en "Núcleos de CPU" y "Memoria RAM".

### Navegadores

Prueba en los que estén instalados: **Chrome**, **Edge**, **Firefox**, **Safari**.
En Chromebook normalmente solo hay Chrome. En tablet Android, Chrome.

### Condiciones de red

| Código | Condición | Cómo conseguirla |
|---|---|---|
| **R1** | La red buena del colegio | Wi-Fi o cable de la sala de profesores / dirección |
| **R2** | Una red mala del colegio | Una sala lejana del router, o el rincón donde siempre se cae |
| **R3** | Datos móviles | Compartir internet desde tu teléfono |

No hay que simular velocidades exactas. Lo que interesa es **cómo se comporta en
la red real del colegio**, incluida la mala.

---

## Parte A — Diagnóstico del equipo (se puede hacer hoy)

Repite esto **por cada combinación** equipo × navegador × red.
Toma entre 3 y 5 minutos cada vez.

### Paso 1 — Abrir la página de diagnóstico

1. Abre el navegador que vas a probar.
2. Inicia sesión en GENERA.
3. Anda a la dirección:

   ```
   /meet/diag
   ```

   Es decir, la dirección de GENERA seguida de `/meet/diag`.

> Si te pide iniciar sesión, hazlo: la página te devuelve sola al diagnóstico
> después.

### Paso 2 — Leer la tabla de mediciones

La página se llena sola. Cada fila trae un estado:

| Estado | Qué significa | Qué haces |
|---|---|---|
| **OK** | Cumple con holgura | Nada |
| **Atención** | Está en el mínimo. Puede funcionar, pero justo | Anótalo en observaciones |
| **Falla** | No cumple | Anótalo y sigue igual con la prueba |
| **Dato** | Solo información, no se evalúa | Nada |

No te preocupes por entender cada fila. Lo importante es cuántas hay de cada
estado, y eso aparece resumido arriba de la tabla.

### Paso 3 — Probar cámara y micrófono

1. Presiona el botón **"Probar cámara y micrófono"**.
2. El navegador va a pedir permiso. **Acepta.** Si no aceptas, la prueba no
   sirve.
3. Espera el resultado en la fila "Cámara y micrófono".

**Este paso es el más importante de la Parte A.** Si aquí dice **Falla**, anota
exactamente el mensaje que aparece: distingue entre "no hay cámara conectada",
"otra aplicación la está usando" y "permiso denegado", y cada caso se arregla
distinto.

> La cámara se apaga sola apenas termina la medición. Es normal que la luz se
> encienda un segundo.

### Paso 4 — Copiar los resultados

1. Presiona **"Copiar resultados"**.
2. Pega el texto en la planilla, en un correo, o en un mensaje para ti.

Si el botón no funciona (pasa en algunos equipos antiguos), abajo hay un cuadro
de texto con lo mismo: selecciona todo y copia a mano.

**Pega el bloque completo tal cual.** No lo resumas ni lo edites: trae toda la
información técnica que necesitamos y no contiene ningún dato personal de
estudiantes.

### Paso 5 — Anotar en la planilla

Completa una fila de la planilla (más abajo) y pasa a la siguiente combinación.

---

## Parte B — Reunión de prueba (BLOQUEADA por ahora)

> ⛔ **Todavía no se puede hacer.** Requiere una reunión de prueba que aún no
> existe. Se habilita en la etapa **Z0B-2**. En la página de diagnóstico verás
> el aviso *"Prueba de conexión: disponible próximamente"* — mientras diga eso,
> salta esta parte completa.

Cuando se habilite, la Parte B mide cuatro cosas. Se describen aquí para que
sepas qué se viene y puedas coordinar el tiempo de la visita.

### B1 — Tiempo hasta entrar · umbral: **menos de 20 segundos**

Desde que presionas "Entrar a la reunión" hasta que **ves y escuchas**. Se
cronometra con el celular. No cuenta desde que la página carga: cuenta desde el
clic.

### B2 — Entrar 3 de 3 veces · umbral: **3/3**

Entra, sal, y repite tres veces seguidas. Las tres tienen que funcionar. Si una
falla, el resultado es 2/3 y eso reprueba, aunque las otras dos hayan sido
rápidas.

### B3 — Calidad de audio · umbral: **4 o más de 5**

Con alguien al otro lado, conversen un minuto y califica del 1 al 5:

| Nota | Cómo suena |
|---|---|
| 5 | Perfecto, como una llamada telefónica buena |
| 4 | Se entiende todo, algún corte mínimo |
| 3 | Se entiende, pero hay que repetir a veces |
| 2 | Cuesta seguir la conversación |
| 1 | No se puede trabajar así |

Califica el audio, no el video. En una sesión de acompañamiento el audio es lo
que importa.

### B4 — Uso de CPU · umbral: **bajo 90%**

Durante la llamada, en el mismo computador:

- **Windows:** `Ctrl + Shift + Esc` → pestaña "Rendimiento" → mira "CPU".
- **Chromebook:** menú de Chrome → "Más herramientas" → "Administrador de
  tareas".

Anota el porcentaje **más alto** que veas durante la llamada, no el promedio.
Si el computador queda inutilizable mientras está en la reunión, anótalo aunque
el número sea bajo.

---

## Planilla de resultados

Una fila por combinación equipo × navegador × red. Copia esta tabla.

| # | Colegio | Fecha | Equipo (P0-a/P0-b/P1-a/P1-b) | Navegador | Red (R1/R2/R3) | Diagnóstico: OK / Atención / Falla | Cámara+micrófono (OK/Falla + mensaje) | B1 tiempo (s) | B2 entradas (x/3) | B3 audio (1-5) | B4 CPU máx (%) | Observaciones |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 |  |  |  |  |  |  |  | *bloq.* | *bloq.* | *bloq.* | *bloq.* |  |
| 2 |  |  |  |  |  |  |  | *bloq.* | *bloq.* | *bloq.* | *bloq.* |  |
| 3 |  |  |  |  |  |  |  | *bloq.* | *bloq.* | *bloq.* | *bloq.* |  |

Marca *bloq.* en las columnas B1–B4 mientras la Parte B siga bloqueada.

**Además de la tabla**, envía el **bloque JSON copiado en el Paso 4 de cada
combinación**, identificando a cuál fila corresponde. Ese bloque es el dato
técnico; la tabla es el resumen.

### En observaciones, cuéntanos

- Cualquier cosa rara, aunque no sepas explicarla.
- Si el computador se puso lento, se calentó o el ventilador sonó fuerte.
- Si alguien del colegio comentó algo sobre el equipo o la conexión.
- Si tuviste que pedirle ayuda a alguien para hacer algún paso: eso nos dice que
  el flujo es muy difícil para el uso diario.

---

## Criterio de decisión (referencia, no lo evalúas tú)

La decisión se toma con todas las visitas juntas, no colegio por colegio.

**Aprueba** (la videollamada va dentro de GENERA) si en los equipos **P0**, en
la red buena del colegio (**R1**), se cumple todo:

- entrar toma menos de 20 segundos,
- las 3 entradas funcionan,
- el audio es 4 o más,
- la CPU se mantiene bajo 90%.

**Si no se cumple**, la reunión se abre en la aplicación de Zoom aparte. **Eso
no es una falla del proyecto:** es la razón por la que el enlace de plataforma
existe desde el principio y funciona igual. La única diferencia para las
personas es dónde se abre la ventana.

---

## Dudas frecuentes

**¿Necesita el colegio tener cuenta de Zoom?**
No. Nadie del colegio necesita cuenta ni instalar nada para participar.

**¿Se está grabando algo en esta prueba?**
No. La página de diagnóstico no graba ni guarda audio ni video. La prueba de
cámara y micrófono solo verifica que el navegador los entregue, y los libera de
inmediato.

**¿Puedo hacer esto con alguien del colegio mirando?**
Sí, y es recomendable. Si a la persona le parece complicado, esa reacción es
información valiosa: anótala.

**El diagnóstico dice "Atención" en varias filas. ¿Reprobamos?**
No. "Atención" significa que el equipo está en el mínimo previsto. Anótalo y
continúa: lo que decide es la Parte B, cuando se habilite.

**No hay internet en la sala donde estoy.**
Usa los datos de tu teléfono (condición **R3**) y anótalo. Un colegio sin
conexión utilizable también es un resultado que necesitamos saber.
