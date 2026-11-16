# Carta virtual con pedido por WhatsApp (efectivo o transferencia/QR)

El cliente entra desde un enlace (perfil de WhatsApp, estado o mensaje), **busca y elige** sus productos (quitando ingredientes o sumando adicionales), escoge **efectivo** o **transferencia/QR Nequi**, y **envía el pedido completo por WhatsApp** al restaurante, ya escrito. Si pagó por transferencia, adjunta en ese mismo chat la captura del pago aprobado.

## Flujo

```
Cliente abre /r/<restaurante> → busca y elige productos → datos + medio de pago → Continuar
        ↓
pago.html
  · Transferencia/QR: ve el total, el número Nequi (Copiar) y el QR (Guardar) → paga → captura
  · Efectivo: ve el total y el cambio
        ↓
"Enviar pedido por WhatsApp" → se abre el chat del restaurante con el pedido escrito
        ↓ (si pagó por transferencia, adjunta la captura en el mismo chat)
El restaurante revisa en Nequi que llegó la plata y responde en el chat: "Pago confirmado"
```

> **Importante:** una captura de pantalla se puede falsificar. Antes de confirmar, revisen siempre en Nequi (o en el SMS de pago) que el dinero sí llegó.

El **panel** (`/admin.html`) es opcional: guarda todos los pedidos (transferencias por verificar, efectivo por cobrar, pagados) por si quieren llevar el control de ventas.

## Probarlo ya

Requisito: Node.js 22 o superior (versión 22.9 en adelante). No hay que instalar paquetes.

```bash
npm start        # o F5 en VS Code
```

- Hard Burgers: http://localhost:3000/r/hard-burgers
- Restaurante de ejemplo: http://localhost:3000/r/demo-tipico
- Panel de pedidos: http://localhost:3000/admin.html (clave = `ADMIN_KEY` del `.env`)

Sin la API de WhatsApp, al confirmar un pago el panel abre WhatsApp con el mensaje listo para el cliente (y en la terminal se ve lo que se enviaría automáticamente).

## Horario y solo domicilio

En cada restaurante de `data/restaurantes.json`:
- `"horarioTexto": "4:00 p. m. – 11:00 p. m."` → se muestra arriba, debajo del logo.
- `"soloDomicilio": true` → quita la opción de recoger (cocina oculta).
- `"abierto": false` → cierra la carta a mano (no deja pedir).

## Datos de pago (QR y Nequi)

En `data/restaurantes.json`, cada restaurante tiene:
```json
"pago": {
  "tipo": "transferencia",
  "efectivo": true,
  "qr": "/img/qr-hard-burgers.png",
  "cuentas": [
    { "tipo": "Nequi", "numero": "300 000 0000", "titular": "Nombre del titular" }
  ],
  "instrucciones": "En el mensaje o descripción de la transferencia escribe la referencia de tu pedido."
}
```
- **Efectivo:** `"efectivo": false` si ese restaurante no recibe efectivo.
- **QR:** guarda la imagen del QR del negocio en `public/img/` (reemplaza `qr-hard-burgers.png`, que es un ejemplo). Si no hay QR, borra la línea `"qr"`.
- **Cuentas:** puedes poner varias (Nequi, Bancolombia, Daviplata, llave Bre-B…). Cada una sale con botón *Copiar*.

## Editar la carta

Todo está en `data/restaurantes.json`. Cada restaurante tiene:

| Campo | Para qué |
|---|---|
| `slug` | Va en el enlace: `/r/<slug>` (sin espacios ni tildes) |
| `nombre`, `eslogan`, `logo` | Lo que se ve arriba. `logo` es una imagen en `public/img/` (opcional) |
| `logoAncho` | `true` si el logo es horizontal (tipo letrero): se muestra grande en lugar del nombre |
| `colorPrimario` | Color de la marca |
| `whatsapp` | Número del restaurante con 57 adelante: `573001234567` |
| `abierto` | `false` para dejar de recibir pedidos |
| `costoDomicilio`, `pedidoMinimo` | En pesos |
| `categorias[].productos[]` | `id`, `nombre`, `descripcion`, `precio`, `disponible`, `imagen` (URL, opcional) |

Los cambios se ven al recargar la página, sin reiniciar. Para marcar algo como agotado: `"disponible": false`.

### Ingredientes (para que el cliente quite lo que no quiera)
Cada producto puede tener una lista `ingredientes`:
```json
"ingredientes": [
  { "nombre": "Carne de res 150 g", "fijo": true },
  { "nombre": "Pan", "fijo": true, "oculto": true },
  { "nombre": "Pepinillos" }
]
```
- Sin nada extra: el cliente lo puede **quitar**.
- `"fijo": true`: se muestra como *Incluido* y no se puede quitar.
- `"oculto": true`: no se muestra (pan, rub, sazonador).

La descripción de la carta se arma sola con los ingredientes, salvo que el producto tenga `descripcion`.

### Adicionales (lo que el cliente puede sumar, con precio)
Se definen una vez por restaurante en `adicionales` y aplican a todos sus productos:
```json
"adicionales": [ { "id": "ad-tocineta", "nombre": "Tocineta", "precio": 3000 } ],
"maxPorAdicional": 3
```
Para limitar un producto a ciertos adicionales: `"adicionales": ["ad-tocineta", "ad-cheddar"]`. Para que no tenga ninguno: `"adicionales": false`.
El servidor recalcula el precio con los adicionales y no acepta quitar ingredientes fijos.

## Pasar a producción

### 1. Datos reales
Precios, adicionales, número Nequi, titular, QR, número de WhatsApp del restaurante (`whatsapp`), costo de domicilio y una `ADMIN_KEY` segura en `.env`.

### 2. (Opcional) WhatsApp Cloud API: confirmación 100 % automática
Sin esto el sistema igual funciona: el panel abre WhatsApp con el mensaje listo y el restaurante solo toca *Enviar*. Con la API, el mensaje sale solo al confirmar el pago.

1. Crear una app en https://developers.facebook.com, tipo **Business**, y agregar el producto **WhatsApp**.
2. Registrar el número del negocio. Ese número ya **no** se puede usar a la vez en la app normal de WhatsApp, salvo que se use la opción de coexistencia si Meta la ofrece para ese número.
3. Crear un **token permanente** (usuario del sistema en Business Manager) y copiar el **Phone number ID**.
4. Crear y mandar a aprobar las plantillas (categoría **Utilidad**, idioma Español):

   **pago_confirmado** (para el cliente)
   ```
   Hola {{1}}, recibimos tu pago de {{2}} en {{3}}. Tu pedido {{4}} ya está en preparación. ¡Gracias por tu compra!
   ```
   **nuevo_pedido** (para el restaurante, opcional)
   ```
   Nuevo pedido pagado {{1}}: {{2}}. Total {{3}}. Entrega: {{4}}. Cliente: {{5}}
   ```
5. Llenar `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y los nombres de plantilla en `.env`. Si Meta aprueba las plantillas con otro código de idioma (por ejemplo `es_MX`), cambiar `WHATSAPP_TEMPLATE_LANG`.
6. Si cada restaurante tiene su propio número de WhatsApp, poner `whatsappPhoneNumberId` en su entrada de `restaurantes.json`.

### 3. Publicar el servidor
Sirve cualquier hosting que corra Node.js con HTTPS (Render, Railway, Fly.io o un VPS). Hay que configurar las variables del `.env` en el hosting y poner `BASE_URL` con el dominio final.

> Los pedidos se guardan en `data/pedidos.json`. Para arrancar sirve, pero en hostings donde el disco se borra al reiniciar (o con muchos pedidos) hay que pasar a una base de datos. Todo el acceso a datos está en `src/datos.js`, así que solo hay que cambiar ese archivo.

### 4. Poner el enlace en WhatsApp Business
- **Perfil → Sitio web**: `https://TU-DOMINIO/r/hard-burgers`
- **Mensaje de bienvenida / respuestas rápidas**: "Haz tu pedido aquí 👉 https://TU-DOMINIO/r/hard-burgers"
- Con un código QR del mismo enlace para las mesas o el mostrador.

## Seguridad incluida
- Los precios y el total **se calculan en el servidor**: el cliente no puede cambiarlos desde el navegador.
- Un pedido solo pasa a *Pagado* cuando el restaurante lo confirma desde el panel (protegido con clave).
- Los comprobantes no son públicos: solo se ven en el panel.
- Un pedido ya confirmado no se puede volver a reportar ni confirmar dos veces.

## Estructura
```
server.js              Rutas y lógica de pedidos
src/config.js          Variables de entorno
src/datos.js           Guardado de restaurantes y pedidos (JSON)
src/wompi.js           (Opcional, sin uso) pasarela Wompi si algún día la quieren: "pago": {"tipo": "wompi"}
src/whatsapp.js        Envío de plantillas por Cloud API
data/restaurantes.json Cartas y datos de pago
data/comprobantes/     Fotos de comprobantes (se crea sola)
public/                Páginas: carta, pago (QR/Nequi), estado del pedido, panel
```

## Próximos pasos sugeridos
- Subir fotos de los productos (campo `imagen`).
- Horarios automáticos de apertura y cierre.
- Opciones por producto (tamaños, adiciones, salsas).
- Base de datos real y usuarios por restaurante en el panel.
#   c a r t a - v i r t u a l  
 