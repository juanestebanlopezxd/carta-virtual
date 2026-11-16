# Empezar aquí (Visual Studio Code)

## Una sola vez
1. Instala **Node.js LTS** desde https://nodejs.org (versión 22.9 o mayor).
2. Instala **Visual Studio Code** desde https://code.visualstudio.com

## Abrir el proyecto
1. Descomprime `carta-virtual.zip` (clic derecho → *Extraer todo*).
2. En VS Code: **Archivo → Abrir carpeta…** y elige la carpeta `carta-virtual`, la que tiene `server.js` adentro.
3. Si VS Code pregunta *"¿Confía en los autores?"*, dale **Sí, confío**.
4. Si abajo a la derecha te recomienda extensiones (Prettier, ESLint, Thunder Client), dale **Instalar**.

## Arrancarlo
- Presiona **F5**, o ve a *Ejecutar y depurar* (icono de play con bicho) y elige **▶ Iniciar carta virtual**.
- También puedes abrir la terminal (**Ctrl + ñ**) y escribir `npm start`.

Abajo, en la terminal, aparecen los enlaces. Ábrelos en el navegador:

| Página | Dirección |
|---|---|
| Hard Burgers | http://localhost:3000/r/hard-burgers |
| Carta restaurante 2 | http://localhost:3000/r/demo-tipico |
| Panel de pedidos | http://localhost:3000/admin.html (clave: `admin123`, cámbiala en `.env`) |

Para detenerlo: **Shift + F5**, o **Ctrl + C** en la terminal.

## Qué archivo tocar para cada cosa

| Quiero cambiar… | Archivo |
|---|---|
| Productos, precios, adicionales, colores, domicilio, **número Nequi** | `data/restaurantes.json` |
| **QR de pago** | reemplaza `public/img/qr-hard-burgers.png` |
| Cómo se ve la carta | `public/styles.css` y `public/carta.html` |
| Lo que pasa al tocar + / − / Pagar | `public/carta.js` |
| Pantalla final (QR / Nequi / efectivo y botón de WhatsApp) | `public/pago.html` |
| Texto del pedido que llega por WhatsApp | `src/texto.js` (función `mensajePedido`) |
| Pantalla de estado del pedido | `public/estado.html` |
| Panel del restaurante | `public/admin.html` |
| Rutas del servidor y reglas del pedido | `server.js` |
| Mensaje de WhatsApp | `src/whatsapp.js` |
| Claves y configuración | `.env` |

Los cambios en `data/` y `public/` se ven recargando el navegador.
Si cambias `server.js` o `src/`, detén y vuelve a arrancar. Si arrancas con `npm run dev`, se reinicia solo.

## Probar un pedido completo
1. Abre la carta. Prueba el buscador (por ejemplo "tocineta").
2. Toca un producto, quita o agrega lo que quieras y toca **Agregar**.
3. **Ver pedido** → llena tus datos → elige **Transferencia / QR** o **Efectivo** → **Continuar**.
4. Verás el total y, si es transferencia, el número Nequi y el QR.
5. Toca **Enviar pedido por WhatsApp**: se abre WhatsApp con el pedido escrito, dirigido al número del restaurante (`whatsapp` en `data/restaurantes.json`; pon el tuyo para probar).
6. (Opcional) En el panel verás el pedido como *Transferencia por verificar* o *Efectivo por cobrar*.

Los pedidos de prueba quedan en `data/pedidos.json`. Bórralo cuando quieras empezar limpio.

## Siguiente paso
Pon el número Nequi y el QR reales, y sigue **"Pasar a producción"** en el `README.md`.
