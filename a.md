Claro. He integrado las 5 acciones, incluyendo el clic izquierdo mantenido durante 3 segundos, y añadí que ESC cancele la selección/cambios en curso. También dejé claro que Enter principal y Enter numérico deben tratarse por separado cuando técnicamente sea posible.

Quiero que desarrolles una extensión para Google Chrome, compatible con Chrome Web Store y Manifest V3, que funcione como un automatizador de acciones sobre páginas web.

OBJETIVO

La extensión debe permitir al usuario seleccionar una zona de una página web y, después de configurar un intervalo de tiempo, ejecutar automáticamente una acción en esa zona.

Las acciones disponibles serán exactamente estas:

🖱️ Click izquierdo del mouse
🖱️ Click izquierdo del mouse mantenido durante 3 segundos
␣ Presionar la tecla ESPACIO
↵ Presionar ENTER principal
⌨️ Presionar ENTER del teclado numérico

La extensión debe tener una interfaz sencilla, moderna, oscura y fácil de usar.

FLUJO DE USO
PASO 1 — SELECCIONAR ZONA

El usuario abre la extensión y pulsa:

"Seleccionar zona"

Después:

La extensión debe permitir seleccionar visualmente una zona de la página.
El usuario debe poder hacer clic y arrastrar para dibujar un rectángulo.
El rectángulo debe mostrarse visualmente mientras se selecciona.
Al terminar, guardar las coordenadas de la zona.
Mostrar visualmente la zona seleccionada.
Para las acciones de mouse, utilizar preferiblemente el centro del rectángulo como punto de acción.
Mostrar claramente qué zona fue seleccionada.
Debe existir un botón "Cambiar zona".
CANCELAR CON ESC

Esto es MUY IMPORTANTE:

Si el usuario está seleccionando una zona y presiona la tecla:

ESC

debe:

Cancelar inmediatamente la selección actual.
No modificar la zona que ya estaba guardada.
Cerrar el modo de selección.
Volver a la configuración anterior.

También quiero que ESC pueda cancelar cualquier configuración temporal que todavía no haya sido confirmada.

Por ejemplo:

Zona anterior:
[████████████]

Usuario pulsa "Cambiar zona"

Usuario comienza a dibujar:

[       ┌───────────────┐
         │ nueva zona    │
         └───────────────┘

Usuario pulsa ESC

Resultado:

Se cancela la nueva selección.
Se mantiene la zona anterior.


Si no existía una zona anterior, simplemente debe cancelarse la selección y volver al estado inicial.

PASO 2 — CONFIGURAR INTERVALO

Después de seleccionar la zona, el usuario debe elegir cada cuánto tiempo se ejecutará la acción.

Opciones rápidas:

30 segundos
1 minuto
2 minutos
3 minutos
5 minutos
10 minutos

También debe existir una opción:

"Personalizado"

que permita introducir una cantidad y seleccionar:

segundos
minutos
horas

Ejemplos:

Cada: [ 3 ] [ minutos ▼ ]


o:

Cada: [ 45 ] [ segundos ▼ ]


Validar que:

El valor sea numérico.
Sea mayor que 0.
No permita valores inválidos.
No permita intervalos absurdamente pequeños que puedan causar problemas de rendimiento.
PASO 3 — ELEGIR ACCIÓN

Mostrar exactamente estas cinco opciones:

ACCIÓN

○ 🖱️ Click izquierdo del mouse

○ 🖱️ Click izquierdo del mouse
   mantenido durante 3 segundos

○ ␣ Presionar ESPACIO

○ ↵ Presionar ENTER principal

○ ⌨️ Presionar ENTER del teclado numérico

OPCIÓN 1 — CLICK IZQUIERDO

Si el usuario selecciona:

🖱️ Click izquierdo del mouse

debe realizarse un clic izquierdo en el centro de la zona seleccionada.

El comportamiento debe equivaler conceptualmente a:

mousedown
mouseup


con una duración normal de click.

OPCIÓN 2 — CLICK IZQUIERDO MANTENIDO 3 SEGUNDOS

Si el usuario selecciona:

🖱️ Click izquierdo del mouse mantenido durante 3 segundos

debe:

Presionar el botón izquierdo.
Mantenerlo presionado durante exactamente 3 segundos.
Soltar el botón izquierdo.

Conceptualmente:

mousedown
↓
esperar 3 segundos
↓
mouseup


Ejemplo:

12:00:00 → botón izquierdo presionado
12:00:03 → botón izquierdo liberado


El intervalo debe comenzar nuevamente después de completar la acción.

IMPORTANTE:

No quiero que se interprete como tres clicks separados.

Debe ser un único click con el botón izquierdo mantenido durante aproximadamente 3 segundos.

OPCIÓN 3 — ESPACIO

Si el usuario selecciona:

␣ Presionar ESPACIO

debe intentar enviar una pulsación de la tecla Space a la página activa.

Conceptualmente:

keydown Space
keyup Space

OPCIÓN 4 — ENTER PRINCIPAL

Si el usuario selecciona:

↵ Presionar ENTER principal

debe intentar enviar la tecla Enter correspondiente al Enter principal del teclado.

Debe utilizar los eventos/códigos de teclado apropiados para diferenciarla del Enter del teclado numérico cuando Chrome lo permita.

OPCIÓN 5 — ENTER TECLADO NUMÉRICO

Si el usuario selecciona:

⌨️ Presionar ENTER del teclado numérico

debe intentar enviar específicamente la tecla Enter del teclado numérico.

Quiero que investigues y utilices la identificación correcta de teclado disponible en eventos de teclado del navegador, por ejemplo KeyboardEvent.code, key, location u otro mecanismo permitido.

No inventes una API.

Si Chrome no permite generar artificialmente una diferencia real entre ambas teclas, explícame claramente la limitación y utiliza la alternativa técnicamente más correcta.

IMPORTANTE SOBRE LAS ACCIONES AUTOMÁTICAS

Antes de implementar las acciones, analiza las limitaciones reales de:

Chrome Manifest V3.
Content Scripts.
DOM events.
MouseEvent.
KeyboardEvent.
chrome.scripting.
APIs oficiales de Chrome.
Restricciones de seguridad del navegador.

No inventes funciones como:

chrome.mouse.click()
chrome.keyboard.press()


si esas APIs no existen.

Si una extensión de Chrome no puede controlar físicamente el mouse o teclado del sistema operativo, no finjas que puede hacerlo.

Explica claramente qué se puede simular dentro de una página web y qué no.

Si alguna de las cinco acciones no puede realizarse exactamente como se solicita mediante una extensión Chrome pura, implementa la mejor alternativa posible y explica la limitación.

PASO 4 — INICIAR

Debe existir un botón grande:

▶ INICIAR

Cuando el usuario lo pulse:

Comenzar la cuenta regresiva.
Mostrar el estado como ACTIVO.
Mostrar cuánto falta para la próxima acción.
Cuando llegue el momento, ejecutar la acción seleccionada.
Reiniciar automáticamente el temporizador.
Continuar indefinidamente hasta que el usuario pulse detener.

Ejemplo:

Estado: 🟢 ACTIVO

Próxima acción:
02:43

Acción:
🖱️ Click izquierdo

Intervalo:
3 minutos

PASO 5 — DETENER

Debe existir un botón:

■ DETENER

Al pulsarlo:

Detener completamente el temporizador.
Cancelar cualquier acción pendiente.
Si se está realizando una acción de click mantenido, liberar/cancelar correctamente la acción cuando sea técnicamente posible.
No ejecutar más acciones.
Cambiar el estado a:

⚪ DETENIDO

El usuario debe poder volver a pulsar "Iniciar" posteriormente.

TECLA ESC

La tecla ESC debe tener un comportamiento especial.

Cuando el usuario esté:

Seleccionando una zona.
Cambiando la zona.
Realizando una configuración temporal que todavía no confirmó.

Al presionar:

ESC

debe cancelar la operación actual.

Debe conservarse la configuración anterior.

Ejemplo:

Configuración actual:
Zona A
Intervalo: 3 minutos
Acción: Click izquierdo

Usuario pulsa "Cambiar zona"

Selecciona parcialmente una nueva zona.

Pulsa ESC.

Resultado:
Zona A sigue siendo la zona activa.
No se guarda la selección nueva.


No quiero que ESC detenga automáticamente una automatización que ya está activa, salvo que exista una opción específica para ello.

INTERFAZ

Quiero una interfaz moderna y limpia.

Preferencias:

Diseño oscuro.
Bordes redondeados.
Botones grandes.
Buena separación entre elementos.
Iconos simples.
Interfaz responsive.
Popup de aproximadamente 350–400 px de ancho.
Estados visuales claros.
Colores diferentes para activo, detenido y error.

Ejemplo:

┌───────────────────────────────────┐
│       ⚡ AUTO ACTION               │
│                                   │
│  ZONA                              │
│  ┌─────────────────────────────┐  │
│  │ Zona seleccionada ✓         │  │
│  └─────────────────────────────┘  │
│                                   │
│  [ Cambiar zona ]                 │
│                                   │
│  INTERVALO                         │
│  [ 3 ] [ minutos ▼ ]             │
│                                   │
│  ACCIÓN                            │
│                                   │
│  ○ 🖱️ Click izquierdo             │
│                                   │
│  ○ 🖱️ Click izquierdo             │
│    mantenido 3 segundos           │
│                                   │
│  ○ ␣ Espacio                      │
│                                   │
│  ○ ↵ Enter principal              │
│                                   │
│  ○ ⌨️ Enter teclado numérico      │
│                                   │
│  ┌─────────────────────────────┐  │
│  │       ▶ INICIAR             │  │
│  └─────────────────────────────┘  │
│                                   │
│  ┌─────────────────────────────┐  │
│  │       ■ DETENER             │  │
│  └─────────────────────────────┘  │
│                                   │
│  🟢 ACTIVO                        │
│  Próxima acción: 02:43            │
└───────────────────────────────────┘

REQUISITOS TÉCNICOS

Utiliza:

Manifest V3.
JavaScript puro, si no es necesario utilizar frameworks.
HTML.
CSS.
APIs oficiales de Chrome.
chrome.storage para guardar configuración.
Service Worker/background cuando sea necesario.
Content scripts cuando sea necesario.

Quiero que la extensión sea lo más sencilla posible de instalar y mantener.

NO quiero depender de ningún servidor externo.

PERSISTENCIA

La extensión debe recordar:

Zona seleccionada.
Coordenadas de la zona.
Intervalo.
Unidad de tiempo.
Acción seleccionada.

Si cierro y vuelvo a abrir Chrome, la configuración debería permanecer guardada.

Si es técnicamente posible y seguro, también quiero que el estado del temporizador pueda recuperarse después de cerrar/reabrir el popup.

IMPORTANTE:

El popup de Chrome puede cerrarse cuando el usuario hace clic fuera de él.

Por eso, el temporizador principal no debe depender exclusivamente de setInterval() dentro del popup.

Utiliza el Service Worker/background y/o chrome.alarms cuando sea apropiado para que la automatización pueda continuar aunque el popup se cierre.

PERMISOS

Utiliza solamente los permisos estrictamente necesarios.

Explícame:

Qué permisos necesita la extensión.
Para qué sirve cada permiso.
Por qué son necesarios.
Si existe alguna limitación de Chrome para hacer clicks automáticamente.
Si existe alguna limitación de Chrome para enviar teclas automáticamente.
Qué páginas no pueden ser controladas.

No solicites permisos innecesarios.

COMPATIBILIDAD

Debe funcionar en páginas web normales de Chrome.

Ten en cuenta que existen páginas especiales donde Chrome no permite ejecutar extensiones, como:

chrome://
Chrome Web Store
páginas internas del navegador.
páginas restringidas por Chrome.
otras páginas donde los Content Scripts no pueden ejecutarse.

Si una página no permite ejecutar la extensión, muestra un mensaje claro al usuario.

SEGURIDAD Y ESTABILIDAD

Implementa:

Validación de todos los valores introducidos.
Evitar múltiples temporizadores simultáneos.
Limpieza correcta de timers.
Manejo de errores.
Evitar que la extensión se quede ejecutándose accidentalmente varias veces.
Estado visual claro.
No bloquear la página.
No consumir CPU innecesariamente.
Evitar loops innecesarios.
Evitar múltiples acciones simultáneas.
Cancelación segura con ESC durante la selección.
Restauración correcta de la configuración anterior si se cancela una operación.
Manejo correcto de pestañas cerradas o cambiadas.
Verificación de que la pestaña activa sigue siendo válida antes de ejecutar una acción.
ESTRUCTURA DEL PROYECTO

Quiero que me entregues el proyecto completo con una estructura similar a:

auto-action-extension/
│
├── manifest.json
├── popup.html
├── popup.css
├── popup.js
├── background.js
├── content.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png


Si consideras que otra estructura es técnicamente mejor, puedes modificarla.

MUY IMPORTANTE

No quiero solamente una explicación.

Quiero que escribas el código completo y funcional de todos los archivos necesarios.

Para cada archivo:

Indica el nombre del archivo.
Muestra el contenido completo.
No omitas partes con comentarios como:
// aquí va el resto

El código debe poder copiarse directamente a archivos.
Debe poder cargarse directamente mediante el modo desarrollador de Chrome.

Si necesitas generar iconos, proporciona una solución que no requiera un servidor externo o indica cómo crear iconos provisionales localmente.

INSTALACIÓN

Después del código explícame paso a paso cómo:

Crear la carpeta.
Crear cada archivo.
Pegar el código.
Abrir:
chrome://extensions

Activar Modo desarrollador.
Pulsar Cargar descomprimida.
Seleccionar la carpeta.
Probar la extensión.
PRUEBA

Incluye una prueba sencilla para verificar que funciona.

PRUEBA 1 — CLICK IZQUIERDO
Abrir una página web con un botón.
Seleccionar el botón.
Configurar 30 segundos.
Elegir Click izquierdo del mouse.
Pulsar iniciar.
Esperar 30 segundos.
Comprobar que se ejecutó el click.
PRUEBA 2 — CLICK MANTENIDO
Seleccionar un elemento que responda al mantener pulsado el botón.
Elegir Click izquierdo mantenido 3 segundos.
Configurar un intervalo apropiado.
Iniciar.
Verificar que el botón se mantiene presionado aproximadamente 3 segundos.
PRUEBA 3 — ESPACIO

Crear o utilizar una página donde la tecla Space produzca un resultado visible.

Elegir:

␣ Espacio

Iniciar y comprobar el resultado.

PRUEBA 4 — ENTER PRINCIPAL

Utilizar un campo o botón que responda a Enter.

Elegir:

↵ Enter principal

Comprobar el resultado.

PRUEBA 5 — ENTER NUMÉRICO

Utilizar una página de prueba que permita detectar:

event.key
event.code
event.location


y comprobar si Chrome permite diferenciar:

Enter principal

de:

Enter del teclado numérico

Si Chrome no permite simular correctamente esta diferencia mediante una extensión, explica la limitación.

PRUEBA 6 — ESC

Comprobar:

Seleccionar una zona.
Pulsar "Cambiar zona".
Comenzar una nueva selección.
Pulsar ESC.
Verificar que la nueva selección se cancela.
Verificar que la zona anterior permanece intacta.
POSIBLES MEJORAS PARA V2

Después de terminar la V1, indícame qué mejoras podríamos agregar, por ejemplo:

Atajo de teclado para iniciar/detener.
ESC configurable.
Sonido cuando se ejecuta una acción.
Contador de acciones realizadas.
Pausar/reanudar.
Múltiples zonas.
Diferentes intervalos para diferentes acciones.
Historial.
Perfiles de configuración.
Programar una hora de inicio.
Programar una hora de finalización.
Número máximo de repeticiones.
Mostrar la próxima hora exacta de ejecución.
Configuraciones guardadas.
Importar/exportar configuraciones.
Otras mejoras útiles.

Pero primero quiero que construyas una V1 funcional, sencilla y estable.

REQUISITO FINAL DE ANÁLISIS TÉCNICO

Antes de escribir el código, analiza las limitaciones reales de Chrome Manifest V3 para:

Seleccionar una zona visual de una página.
Ejecutar un click izquierdo automáticamente.
Mantener un click izquierdo durante 3 segundos.
Simular la tecla Space.
Simular Enter principal.
Diferenciar Enter principal y Enter del teclado numérico.
Mantener el temporizador funcionando aunque el popup esté cerrado.
Utilizar chrome.alarms.
Utilizar Content Scripts.
Utilizar chrome.scripting.
Utilizar chrome.storage.
Trabajar en diferentes pestañas.
Trabajar después de navegar a otra página.

No inventes APIs.

Si alguna función no puede implementarse exactamente como la describo debido a las restricciones de Chrome, indícalo claramente antes del código y propón la alternativa técnicamente correcta.

Quiero una solución realista y funcional, no una simulación de APIs que Chrome no proporciona.

Con esta versión Claude debería analizar primero qué puede hacer realmente Chrome antes de generar el código, especialmente con el click mantenido 3 segundos y los dos tipos de Enter, que son las partes técnicamente más delicadas.