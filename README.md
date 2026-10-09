# Unidos en oración

Aplicación web en español para recibir, organizar y compartir pedidos de oración de una comunidad. Ofrece una interfaz adaptada a teléfonos y computadoras, un panel de administración y resúmenes con Gemini listos para compartir en WhatsApp.

[Abrir la aplicación](https://pedidos-de-oracion-sur.web.app) · [Reportar un problema](https://github.com/CristSoft/Pedidos-de-oracion/issues) · [Licencia Apache 2.0](LICENSE)

## Contenido

- [Características](#características)
- [Tecnologías y arquitectura](#tecnologías-y-arquitectura)
- [Instalación local](#instalación-local)
- [Configuración](#configuración)
- [Uso de la aplicación](#uso-de-la-aplicación)
- [Resúmenes con Gemini y WhatsApp](#resúmenes-con-gemini-y-whatsapp)
- [Firebase y despliegue](#firebase-y-despliegue)
- [Servicio de resúmenes en Cloudflare](#servicio-de-resúmenes-en-cloudflare)
- [Datos y privacidad](#datos-y-privacidad)
- [Pruebas y mantenimiento](#pruebas-y-mantenimiento)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Contribuciones](#contribuciones)
- [Licencia y atribuciones](#licencia-y-atribuciones)

## Características

### Para la comunidad

- Envío de un motivo por pedido, con nombre y apellido.
- Nombre recordado en el navegador y opción de modificarlo.
- Posibilidad de ocultar el nombre antes de enviar.
- Consulta de los pedidos propios y de todos los pedidos compartidos.
- Numeración consecutiva que se conserva al ordenar o eliminar registros.
- Botón «Orar por esto» / «Estoy orando», con manos de oración en el estado activo.
- Contador compartido de personas orando por cada pedido, con una participación por navegador y opción de desmarcar.
- Eliminación de pedidos propios desde el navegador que los envió.
- Conservación del borrador al cambiar de pantalla.
- Consulta de las reglas del culto de oración.
- Manifiesto e íconos para instalar la aplicación en dispositivos compatibles.

### Para administración

- Inicio de sesión y acceso al panel administrativo.
- Recepción abierta, cerrada o programada por días y horarios semanales.
- Búsqueda por nombre o motivo, filtros por estado y ordenamiento.
- Marcación administrativa de pedidos como pendientes u orados.
- Impresión y descarga CSV, con una fila por motivo.
- Eliminación individual o de todos los pedidos, con confirmación.
- Resúmenes con IA, agrupación por nombre y vista previa editable.
- Compartir texto mediante las opciones del sistema o copiarlo para WhatsApp.

## Tecnologías y arquitectura

La interfaz utiliza HTML, CSS y JavaScript con módulos ES, sin una etapa de compilación. El proyecto tiene dos modos de almacenamiento:

| Modo | Interfaz | Datos | Administración |
| --- | --- | --- | --- |
| Local | Servida por Node.js | Archivo JSON | Contraseña y sesión temporal del servidor |
| Firebase | Firebase Hosting | Cloud Firestore | Firebase Authentication y atributo `prayerAdmin` |

`public/backend.js` selecciona el proveedor según el dominio. En `localhost`, `127.0.0.1` y `::1` utiliza la API local; en otros dominios utiliza Firebase. El parámetro `?firebase=1` fuerza Firebase desde un servidor local.

El servidor local usa los módulos nativos de Node.js. Las dependencias de desarrollo permiten ejecutar las pruebas de Firestore, las herramientas administrativas y gestionar los íconos. En la versión publicada, los módulos del SDK de Firebase se importan desde el CDN de Google.

En la versión publicada, un Cloudflare Worker genera los resúmenes con Gemini. El navegador envía los pedidos agrupados y el token de la sesión de Firebase; el Worker verifica su firma, vencimiento, proyecto y permiso `prayerAdmin` antes de llamar a Gemini. La API key queda guardada como secreto del Worker y nunca se entrega al navegador. Esta arquitectura no utiliza Firebase Functions ni requiere cambiar Firebase a Blaze.

En modo local, Node.js genera los resúmenes mediante la misma integración de Gemini y una clave configurada en el entorno del servidor.

## Instalación local

### Requisitos

- Node.js 22 o superior y npm.
- Git para clonar el repositorio.
- Conexión a Internet para Gemini y para el modo Firebase.
- Firebase CLI y Java 21 o superior únicamente para las pruebas con emulador.

### Inicio rápido

```sh
git clone https://github.com/CristSoft/Pedidos-de-oracion.git
cd Pedidos-de-oracion
npm ci
npm start
```

Abrir [http://localhost:3000](http://localhost:3000). En el modo local de demostración, la contraseña de Administración es `oracion`.

Para usar una contraseña propia en PowerShell:

```powershell
$env:ADMIN_PASSWORD = 'reemplazar-por-una-contraseña-propia'
npm start
```

En una terminal compatible con POSIX:

```sh
ADMIN_PASSWORD='reemplazar-por-una-contraseña-propia' npm start
```

## Configuración

### Variables del servidor local

| Variable | Valor predeterminado | Uso |
| --- | --- | --- |
| `PORT` | `3000` | Puerto del servidor HTTP. |
| `ADMIN_PASSWORD` | `oracion` | Contraseña del panel local. Configurar una propia para uso real. |
| `DATA_FILE` | `data/store.json` | Ubicación del archivo de pedidos y configuración. |
| `GEMINI_API_KEY` | Sin configurar | Clave de Gemini para generar resúmenes en el servidor local. |
| `NODE_EXTRA_CA_CERTS` | Sin configurar | Archivo de certificados adicionales cuando el entorno los requiere. |

El proyecto no carga archivos `.env` automáticamente. Las variables deben estar disponibles en el entorno del proceso que inicia Node.js.

El servidor guarda cambios en el archivo definido por `DATA_FILE`. Para uso persistente, esa ubicación necesita permisos de escritura, almacenamiento duradero y copias de seguridad. Las sesiones administrativas locales duran ocho horas y se invalidan al reiniciar el servidor.

### Configuración de Firebase

La configuración de cliente está en `public/firebase-config.js`; incluye el proyecto, la aplicación, el dominio de autenticación y el correo de la cuenta administrativa. Es la misma configuración que recibe el navegador al abrir la aplicación. Las credenciales privadas de administración y Gemini se mantienen fuera de ese archivo.

Los destinos de Hosting y Firestore se definen en `firebase.json` y `.firebaserc`. Los comandos de despliegue y algunos scripts operativos incluyen el proyecto y la cuenta del despliegue actual. Para instalar en otro proyecto, adaptar también `package.json` y los scripts correspondientes antes de ejecutarlos.

`public/summary-config.js` contiene únicamente la URL pública del servicio de resúmenes. La clave privada se configura en Cloudflare, como se explica en [Servicio de resúmenes en Cloudflare](#servicio-de-resúmenes-en-cloudflare).

## Uso de la aplicación

### Enviar y consultar pedidos

1. Ingresar nombre y apellido al abrir la aplicación.
2. Elegir **Nuevo Pedido** y escribir un motivo.
3. Si corresponde, activar **Ocultar mi nombre**.
4. Enviar el pedido dentro del horario de recepción.
5. Consultar el registro en **Mis pedidos** o la lista compartida en **Todos los pedidos**.

Para enviar otro motivo, crear un nuevo pedido. Cada envío conserva su número, incluso si otros pedidos se eliminan.

**Marcar que ya oré** guarda un registro personal en ese navegador. Esta marca se puede deshacer y es independiente del estado que administra el equipo de oración.

### Administrar la recepción

Desde **Administración → Horarios**, elegir:

- **Abierta sin horario**: permite enviar pedidos continuamente.
- **Según días y horarios**: permite seleccionar días semanales y una franja común, o recepción durante todo el día.
- **Cerrada**: suspende nuevos envíos.

Los horarios se interpretan en hora de Argentina, UTC−3. La hora de cierre es exclusiva y las franjas corresponden al mismo día. El servidor local y las reglas de Firestore verifican el horario al guardar, aunque el formulario se haya abierto antes del cierre.

### Eliminar pedidos

Cada eliminación solicita confirmación y es definitiva. En Firebase se eliminan juntos el comprobante original, su copia compartida y el vínculo privado de propiedad.

**Eliminar todos los pedidos** opera sobre todos los registros actuales, incluidos los ocultos por los filtros. La confirmación congela los identificadores: los pedidos que lleguen después permanecen en la aplicación. El contador de numeración se conserva para evitar reutilizar números.

Firebase procesa grupos de cinco pedidos. Si una operación falla después de completar algunos grupos, la interfaz informa el avance y vuelve a consultar la lista.

### Instalar en el dispositivo

En Chrome o Edge, utilizar la opción de instalar del navegador. En Safari para iPhone o iPad, elegir **Compartir → Agregar a inicio**. El manifiesto incluye íconos de aplicación y una variante adaptable para Android.

La aplicación requiere conexión para consultar o enviar pedidos en Firebase; no incluye un modo sin conexión gestionado por un service worker.

## Resúmenes con Gemini y WhatsApp

1. Entrar en **Administración → Pedidos**.
2. Presionar **Compartir todos los pedidos**.
3. Esperar la generación automática del resumen.
4. Revisar o editar el texto en la vista previa.
5. Presionar **Compartir** para abrir las opciones del sistema, o **Copiar texto** para pegarlo en WhatsApp.

Los administradores no necesitan ingresar ni conocer la API key. El responsable de la instalación la configura una sola vez como secreto de Cloudflare; continúa disponible después de cerrar sesión o recargar la aplicación. Los nombres visibles y los motivos se envían mediante HTTPS al Worker y a Gemini para generar el resumen. La clave no se guarda en `localStorage`, `sessionStorage` ni Firestore.

Las entradas del mismo nombre se agrupan, ignorando mayúsculas y espacios repetidos. Los pedidos anónimos se muestran separados porque no es posible atribuirlos a una misma persona.

El formato utiliza los modificadores de WhatsApp: `*texto*` para negrita y `_texto_` para cursiva. Por ejemplo:

```text
*Cristian Sánchez Esquivel:*
_Tiene 2 pedidos de oración._
Pide que Dios acompañe al conjunto Tiempo de Alabar en su evento de este fin de semana en Santa Fe, dándoles salud y energía para ser herramientas útiles en sus manos.
Pide por su salud.

*Ana:*
Pide por su familia.
```

El modelo se define en la constante `GEMINI_MODEL`, dentro de `shared/gemini-summary.js`. La integración utiliza respuestas estructuradas, procesa hasta veinte pedidos por lote y valida que cada entrada tenga su resumen. Las claves privadas de los comprobantes no se envían al servicio de resúmenes ni a Gemini. Revisar el texto antes de compartir: el contenido generado por IA puede requerir correcciones.

El segundo botón **Compartir**, dentro de la vista previa, invoca `navigator.share()` directamente desde la pulsación, después de completar la generación. La disponibilidad de esta función y las aplicaciones ofrecidas dependen del navegador y el dispositivo. Compartir y copiar requieren HTTPS o `localhost`. Si el sistema no permite compartir el texto, queda disponible la opción de copiarlo.

## Firebase y despliegue

El despliegue actual utiliza el proyecto `pedidos-de-oracion-sur`, con Firebase Hosting, Cloud Firestore y Firebase Authentication. La aplicación publicada no utiliza el servidor Node.js ni su archivo JSON.

### Preparar un proyecto

1. Registrar una aplicación web en Firebase y actualizar `public/firebase-config.js`.
2. Crear la base de Firestore y habilitar autenticación por correo y contraseña.
3. Configurar el sitio de Hosting y el proyecto en `firebase.json` y `.firebaserc`.
4. Crear la cuenta administrativa y asignarle el atributo personalizado `prayerAdmin: true` mediante Firebase Admin SDK o una herramienta administrativa autorizada.
5. Inicializar `prayerSettings/reception` con una configuración válida y `prayerCounters/requests` con `lastNumber: 0` y `publicId: ""` si la base no tiene pedidos.
6. Publicar Hosting y las reglas de Firestore.

`scheduleFields()` en `public/schedule.js` genera los campos válidos de recepción. El script `scripts/provision-firebase.mjs` prepara la cuenta administrativa y la configuración inicial del proyecto indicado en su código; requiere la cuenta correspondiente autenticada en Google Cloud CLI. Si crea una cuenta nueva, guarda su acceso en `.secrets/admin-access.json`.

En una base con pedidos existentes, inicializar o actualizar el contador mediante `scripts/number-prayer-requests.mjs`, que conserva los números ya asignados. No reiniciar el contador de una base en uso.

### Publicar

Instalar Firebase CLI y autenticarse con una cuenta autorizada:

```sh
npm install --global firebase-tools
firebase login
npm run deploy:firebase
```

El comando del repositorio publica Hosting y las reglas de Firestore en el proyecto actual. Para publicar solo archivos estáticos:

```sh
firebase deploy --only hosting --project pedidos-de-oracion-sur
```

Para comprobar Firebase desde el servidor local, abrir [http://localhost:3000/?firebase=1](http://localhost:3000/?firebase=1). Esta dirección se conecta con la base configurada, incluidos sus datos reales; las pruebas automatizadas de reglas utilizan un proyecto de demostración separado.

## Servicio de resúmenes en Cloudflare

El servicio actual está publicado en `https://unidos-oracion-resumen.controlstock.workers.dev`. Solo acepta solicitudes de los dominios indicados en `ALLOWED_ORIGINS` y requiere una sesión administrativa válida de Firebase. La autenticación se comprueba en el servidor; restringir los dominios por sí solo no reemplaza ese control.

### Preparar y publicar el Worker

1. Disponer de una cuenta de Cloudflare y ejecutar `npm ci` con Node.js 22 o superior.
2. Autenticarse con `npx wrangler login`.
3. Adaptar `name`, `account_id`, `FIREBASE_PROJECT_ID` y `ALLOWED_ORIGINS` en `wrangler.jsonc` si se utiliza otra instalación.
4. Publicar el código y cargar el secreto:

```sh
npm run deploy:summary
npx wrangler secret put GEMINI_API_KEY
```

El segundo comando solicita la clave de forma interactiva. No escribirla en `wrangler.jsonc`, archivos públicos, argumentos de comandos ni Git. Para cambiarla posteriormente, ejecutar de nuevo `npx wrangler secret put GEMINI_API_KEY`; los administradores continúan usando la aplicación sin configurar nada.

5. Colocar la URL del Worker publicada en `public/summary-config.js`.
6. Publicar Firebase Hosting y comprobar el resumen desde una sesión administrativa.

El plan de Firebase permanece independiente del servicio de Cloudflare. Las cuotas y condiciones de Cloudflare y Gemini deben revisarse en las cuentas correspondientes; la instalación no garantiza uso ilimitado ni modifica la facturación de Gemini. Consultar la documentación oficial de [secretos de Workers](https://developers.cloudflare.com/workers/configuration/secrets/) y [planes y cuotas de Workers](https://developers.cloudflare.com/workers/platform/pricing/).

### Desarrollo y límites

Para probar el Worker localmente, copiar `.dev.vars.example` a `.dev.vars`, completar la clave y ejecutar `npm run dev:summary`. Ese archivo está excluido de Git. El Worker sigue requiriendo un token administrativo real del proyecto configurado. Para probar la interfaz contra él, actualizar temporalmente `public/summary-config.js` con la URL local que informa Wrangler y abrir la aplicación con `?firebase=1` desde un origen permitido.

Para el modo local habitual de Node.js, configurar `GEMINI_API_KEY` en el entorno antes de `npm start`; no se utiliza el Worker ni se necesita una sesión de Firebase. Sin esa variable, las demás funciones continúan disponibles y la generación muestra un mensaje de configuración pendiente.

El Worker limita las solicitudes por IP y por administrador a 60 y 30 por minuto, respectivamente. Estos límites se aplican por ubicación de Cloudflare, no representan un tope global de gasto. Además valida el tamaño del cuerpo, la cantidad de entradas y el contenido de cada lote. La observabilidad registra estados, cantidades y duración, sin registrar nombres, motivos, claves ni tokens. El servicio no almacena los pedidos.

## Datos y privacidad

| Ubicación | Contenido |
| --- | --- |
| `prayerRequests` | Comprobantes originales, con identificadores privados aleatorios. |
| `prayerFeed` | Copias compartidas, sin claves de comprobantes ni nombres ocultos. |
| `prayerOwners` | Vínculos privados para verificar eliminaciones coordinadas. |
| `prayerSettings/reception` | Estado y horario de recepción. |
| `prayerCounters/requests` | Contador de numeración consecutiva. |
| `prayerFeed/{id}/participants` | Participaciones anónimas para contar personas orando. |
| `prayerFeed/{id}/participationKeys` y `participantOwners` | Comprobantes privados para conservar y desmarcar cada participación. |

Los motivos de oración son visibles para quienes acceden a la aplicación. **Ocultar mi nombre** oculta la identidad del remitente, pero el motivo continúa siendo público; el texto del pedido puede contener otros datos personales.

Cada navegador conserva las claves de sus propios comprobantes. Estas claves permiten consultar y eliminar esos pedidos. El listado completo de originales y la lectura de los vínculos privados requieren administración. Las reglas verifican además el horario de recepción, la estructura de los envíos y las actualizaciones de estado.

El nombre recordado, las claves de pedidos propios y una clave aleatoria de participación se guardan en el navegador. Las participaciones se conservan también en la base para mostrar el contador compartido, sin publicar nombres ni claves privadas. Cada navegador cuenta una vez por pedido; al desmarcar se resta su participación. Las marcas personales anteriores se incorporan al abrir los pedidos. Borrar los datos del navegador elimina el acceso a los comprobantes y la posibilidad de desmarcar las participaciones anteriores. Evitar compartir el navegador cuando se necesite proteger ese acceso.

Al eliminar un pedido, sus subcolecciones de participación dejan de ser accesibles por las reglas; Firestore no las elimina automáticamente junto con el documento padre.

Las carpetas `.secrets/`, `data/`, `.firebase/`, `.wrangler/` y `output/`, los archivos de entorno y los registros de ejecución están excluidos de Git. Las credenciales y los pedidos reales no forman parte del repositorio. Al generar un resumen, los datos seleccionados se procesan en Cloudflare y Gemini; revisar sus condiciones de tratamiento de datos antes de usar la función con información sensible.

## Pruebas y mantenimiento

### Pruebas de la aplicación

```sh
npm test
```

Las pruebas cubren la API local, los horarios, la numeración, el registro personal de oración, la privacidad de los registros compartidos, los resúmenes con Gemini y el borrado por lotes. También verifican firmas y permisos de tokens de Firebase, orígenes permitidos, límites del Worker y errores del proveedor. Las pruebas automatizadas de Gemini utilizan respuestas simuladas y no requieren una API key ni consumen cuota.

### Reglas de Firestore

Con Firebase CLI y Java 21 o superior disponibles:

```sh
npm run test:rules
```

Se ejecutan en el emulador de Firestore con el proyecto `demo-prayer-rules`, sin modificar la base publicada. Comprueban permisos, recepción, integridad de registros, numeración y eliminación de copias relacionadas.

### Scripts operativos

| Script | Función | Efecto sobre los datos |
| --- | --- | --- |
| `scripts/verify-firebase.mjs` | Verificar la publicación y permisos. | Consulta, sin modificar pedidos. |
| `scripts/verify-deletion.mjs` | Comprobar borrado propio y administrativo. | Crea dos pedidos de prueba y elimina esos registros; requiere recepción abierta y credenciales administrativas locales. |
| `scripts/provision-firebase.mjs` | Preparar la cuenta administrativa y recepción. | Puede crear la cuenta, asignar permisos e inicializar la recepción. |
| `scripts/backfill-prayer-feed.mjs` | Preparar copias públicas y vínculos de pedidos históricos. | Modifica Firestore al ejecutarse; conserva los motivos y oculta los nombres privados. |
| `scripts/number-prayer-requests.mjs` | Preparar numeración histórica y contador. | Muestra un diagnóstico; escribe únicamente con `--apply`. |

Revisar el proyecto y la cuenta indicados en cada script antes de ejecutarlo. Las migraciones y el aprovisionamiento requieren Google Cloud CLI autenticada y permisos sobre el proyecto. Realizar una copia de seguridad antes de migrar datos existentes.

## Estructura del proyecto

```text
Pedidos-de-oracion/
├── public/
│   ├── index.html                 # Documento principal
│   ├── styles.css                 # Estilos y adaptación a dispositivos
│   ├── app.js                     # Navegación, formularios y administración
│   ├── backend.js                 # Selección del proveedor de datos
│   ├── firebase-backend.js        # Authentication y Firestore
│   ├── firebase-config.js         # Configuración pública del cliente
│   ├── summary-config.js          # URL pública del servicio de resúmenes
│   ├── admin-actions.js           # Borrado total y flujo de compartir
│   ├── prayer-summary.js          # Agrupación, lotes y formato WhatsApp
│   ├── bulk-delete.js             # Eliminación de registros por lotes
│   ├── schedule.js                # Reglas de horarios
│   ├── numbered-transaction.js    # Reintentos de numeración
│   ├── prayer-progress.js         # Registro personal de oración
│   ├── group-rules.js             # Reglas del culto de oración
│   ├── manifest.webmanifest      # Instalación de la aplicación
│   └── icons/                     # Íconos y licencias de terceros
├── scripts/                       # Verificación y mantenimiento
├── shared/gemini-summary.js        # Integración de Gemini para el servidor
├── worker/
│   ├── index.js                   # API, validación y límites de solicitudes
│   └── auth.js                    # Verificación de tokens de Firebase
├── tests/firestore-rules.mjs       # Pruebas del emulador
├── *.test.mjs                     # Pruebas de la aplicación
├── server.mjs                     # Servidor y API locales
├── firestore.rules                # Permisos y validaciones de Firestore
├── firebase.json                  # Hosting y emulador
├── wrangler.jsonc                 # Configuración del Worker, sin secretos
├── .dev.vars.example              # Plantilla para desarrollo del Worker
├── package.json
├── package-lock.json
├── LICENSE
└── NOTICE
```

## Contribuciones

Las mejoras y correcciones se pueden proponer mediante un issue o pull request. Describir el problema, el comportamiento esperado y los pasos para reproducirlo; incluir capturas con datos de ejemplo cuando ayuden a comprender un cambio visual.

Antes de proponer cambios, ejecutar `npm test` y, si afectan Firestore, `npm run test:rules`. No incluir credenciales, claves de comprobantes, pedidos reales ni capturas con datos personales.

## Licencia y atribuciones

Copyright © 2026 CristSoft. El código propio de este proyecto se distribuye bajo la [licencia Apache 2.0](LICENSE). Las atribuciones del proyecto se encuentran en [NOTICE](NOTICE).

Los recursos de terceros conservan sus licencias originales:

- Íconos de Lucide: licencia ISC y, para los derivados de Feather, MIT. Ver [public/icons/LICENSE](public/icons/LICENSE).
- Símbolo de manos orando e íconos de aplicación derivados de Phosphor Icons: licencia MIT. Ver [public/icons/PHOSPHOR-LICENSE](public/icons/PHOSPHOR-LICENSE).
- Las dependencias de npm y Firebase conservan sus respectivas licencias.
