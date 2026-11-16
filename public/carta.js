// Carta virtual: lógica de la página del cliente
const $ = (s) => document.querySelector(s);
const pesos = (n) => '$' + Number(n).toLocaleString('es-CO');
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const slug = new URLSearchParams(location.search).get('r');
let carta = null;
let entrega = 'domicilio';
let textoPagar = 'Continuar';
let metodoPago = null; // 'transferencia' | 'efectivo'
// Cada línea del carrito es un producto con su personalización:
// { clave, id, cantidad, sin: [nombres], adicionales: { idAdicional: cantidad }, nota }
let carrito = [];
const claveCarrito = `carrito2:${slug}`;
const claveCliente = 'cliente';

// Guardado ligero en el navegador (si falla, no pasa nada)
const guardarLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const leerLocal = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

// ---------- ayudas sobre la carta ----------
const productos = () => carta.categorias.flatMap((c) => c.productos);
const producto = (id) => productos().find((p) => p.id === id);
const adicional = (id) => carta.adicionales.find((a) => a.id === id);
const visibles = (p) => (p.ingredientes || []).filter((i) => !i.oculto);
const removibles = (p) => visibles(p).filter((i) => !i.fijo);
const adicionalesDe = (p) =>
  p.adicionales === false ? [] : p.adicionales ? carta.adicionales.filter((a) => p.adicionales.includes(a.id)) : carta.adicionales;
const personalizable = (p) => removibles(p).length > 0 || adicionalesDe(p).length > 0;

const precioLinea = (l) => {
  const p = producto(l.id);
  const extras = Object.entries(l.adicionales || {}).reduce((s, [id, n]) => s + (adicional(id)?.precio || 0) * n, 0);
  return (p.precio + extras) * l.cantidad;
};
const subtotal = () => carrito.reduce((s, l) => s + precioLinea(l), 0);
const totalFinal = () => subtotal() + (entrega === 'domicilio' && !carta.domicilioAparte ? carta.costoDomicilio : 0);
const unidades = () => carrito.reduce((s, l) => s + l.cantidad, 0);
const unidadesDe = (id) => carrito.filter((l) => l.id === id).reduce((s, l) => s + l.cantidad, 0);

const claveDe = (l) =>
  [l.id, [...l.sin].sort().join(','), Object.entries(l.adicionales).sort().map(([k, v]) => k + v).join(','), l.nota].join('|');

function detalleLinea(l) {
  const partes = [];
  if (l.sin.length) partes.push('Sin ' + l.sin.join(', ').toLowerCase());
  for (const [id, n] of Object.entries(l.adicionales)) partes.push(`+ ${n > 1 ? n + ' ' : ''}${(adicional(id)?.nombre || id).toLowerCase()}`);
  if (l.nota) partes.push(`“${l.nota}”`);
  return partes.join(' · ');
}

// ---------- inicio ----------
async function iniciar() {
  if (!slug) { location.href = '/'; return; }
  const r = await fetch(`/api/restaurantes/${encodeURIComponent(slug)}`);
  if (!r.ok) { $('#nombre').textContent = 'Restaurante no encontrado'; return; }
  carta = await r.json();

  const color = carta.colorPrimario || '#E4572E';
  document.title = `${carta.nombre} · Carta`;
  document.documentElement.style.setProperty('--color', color);
  document.querySelector('meta[name=theme-color]').content = color;
  if (carta.logo && carta.logoAncho) {
    // Logo horizontal (tipo letrero): reemplaza al nombre
    $('#cabecera-fila').innerHTML = `<div class="logo-ancho"><img src="${esc(carta.logo)}" alt="${esc(carta.nombre)}"><p>${esc(carta.eslogan || '')}</p></div>`;
  } else {
    $('#nombre').textContent = carta.nombre;
    $('#eslogan').textContent = carta.eslogan || '';
    $('#logo').innerHTML = carta.logo ? `<img src="${esc(carta.logo)}" alt="">` : esc(carta.nombre[0]);
  }
  if (!carta.pago?.efectivo) {
    document.querySelector('[data-metodo="efectivo"]').remove();
    elegirMetodo('transferencia');
  }
  $('#estado-local').textContent = !carta.abierto
    ? '● Cerrado en este momento'
    : carta.horarioTexto ? `🕓 Horario: ${carta.horarioTexto}` : '● Abierto · recibiendo pedidos';
  if (carta.soloDomicilio) {
    entrega = 'domicilio';
    $('#bloque-entrega').classList.add('oculto');
    $('#solo-domicilio').textContent = carta.domicilioAparte
      ? '🛵 Entrega solo a domicilio'
      : `🛵 Solo domicilio${carta.costoDomicilio ? ' · ' + pesos(carta.costoDomicilio) : ''}`;
    $('#solo-domicilio').classList.remove('oculto');
  }

  // Recuperar carrito y datos del cliente si vuelve a entrar
  const guardado = leerLocal(claveCarrito);
  if (Array.isArray(guardado)) {
    carrito = guardado.filter((l) => producto(l.id)?.disponible && l.cantidad > 0);
  }
  const cli = leerLocal(claveCliente) || {};
  $('#f-nombre').value = cli.nombre || '';
  $('#f-tel').value = cli.telefono || '';
  $('#f-dir').value = cli.direccion || '';
  $('#f-barrio').value = cli.barrio || '';

  pintarMenu();
  actualizar();
}

function pintarMenu() {
  $('#chips').innerHTML = carta.categorias
    .map((c, i) => `<button class="chip${i === 0 ? ' activo' : ''}" data-ir="${esc(c.id)}">${esc(c.nombre)}</button>`)
    .join('');

  $('#menu').innerHTML = carta.categorias.map((c) => `
    <section class="seccion" id="cat-${esc(c.id)}">
      <h2>${esc(c.nombre)}</h2>
      ${c.productos.map((p) => {
        const desc = p.descripcion || visibles(p).map((i, n) => (n ? i.nombre[0].toLowerCase() + i.nombre.slice(1) : i.nombre)).join(', ');
        return `
        <article data-producto="${esc(p.id)}" class="producto${p.disponible ? '' : ' agotado'}" ${p.disponible && personalizable(p) ? `data-abrir="${esc(p.id)}"` : ''}>
          ${p.imagen ? `<img class="foto" src="${esc(p.imagen)}" alt="" loading="lazy">` : ''}
          <div class="info">
            <h3>${esc(p.nombre)}</h3>
            <p>${esc(desc)}</p>
            <span class="precio">${pesos(p.precio)}</span>
            ${p.disponible && personalizable(p) ? '<span class="personalizable">Personalizable</span>' : ''}
          </div>
          ${!p.disponible
            ? '<span class="agotado-txt">Agotado</span>'
            : personalizable(p)
              ? `<div class="agregar-wrap"><span class="insignia oculto" data-insignia="${esc(p.id)}"></span><button class="mas-solo" data-abrir="${esc(p.id)}" aria-label="Agregar">+</button></div>`
              : `<div class="contador" data-simple="${esc(p.id)}">
                   <button class="menos oculto" data-paso="-1" aria-label="Quitar">−</button>
                   <span class="oculto">0</span>
                   <button data-paso="1" aria-label="Agregar">+</button>
                 </div>`}
        </article>`;
      }).join('')}
    </section>`).join('');

  if (!carta.abierto) document.querySelectorAll('#menu button').forEach((b) => (b.disabled = true));
}

// ---------- buscador ----------
const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function filtrar() {
  const q = normalizar($('#buscar').value.trim());
  let hay = 0;
  carta.categorias.forEach((c) => {
    let visiblesCat = 0;
    c.productos.forEach((p) => {
      const texto = normalizar([p.nombre, p.descripcion, ...visibles(p).map((i) => i.nombre)].join(' '));
      const ok = !q || q.split(/\s+/).every((w) => texto.includes(w));
      document.querySelector(`[data-producto="${CSS.escape(p.id)}"]`).classList.toggle('oculto', !ok);
      if (ok) visiblesCat++;
    });
    document.getElementById('cat-' + c.id).classList.toggle('oculto', !visiblesCat);
    hay += visiblesCat;
  });
  $('#chips').classList.toggle('oculto', Boolean(q));
  $('#sin-resultados').classList.toggle('oculto', hay > 0);
}

// ---------- medio de pago ----------
function elegirMetodo(m) {
  metodoPago = m;
  document.querySelectorAll('[data-metodo]').forEach((b) => b.classList.toggle('activa', b.dataset.metodo === m));
  $('#campo-paga-con').classList.toggle('oculto', m !== 'efectivo');
  $('#aviso-pago').textContent = m === 'efectivo'
    ? 'Pagas en efectivo al recibir. En el siguiente paso envías tu pedido por WhatsApp.'
    : 'En el siguiente paso verás el QR y el número para pagar. Luego envías tu pedido y la captura por WhatsApp.';
}

// ---------- carrito ----------
function agregarLinea(nueva) {
  nueva.clave = claveDe(nueva);
  const igual = carrito.find((l) => l.clave === nueva.clave);
  if (igual) igual.cantidad = Math.min(50, igual.cantidad + nueva.cantidad);
  else carrito.push(nueva);
  guardarYActualizar();
}

function cambiarLinea(clave, delta) {
  const l = carrito.find((x) => x.clave === clave);
  if (!l) return;
  l.cantidad = Math.max(0, Math.min(50, l.cantidad + delta));
  carrito = carrito.filter((x) => x.cantidad > 0);
  guardarYActualizar();
}

// Productos sin personalización: una sola línea por producto
function cambiarSimple(id, delta) {
  const l = carrito.find((x) => x.id === id);
  if (l) cambiarLinea(l.clave, delta);
  else if (delta > 0) agregarLinea({ id, cantidad: 1, sin: [], adicionales: {}, nota: '' });
}

function guardarYActualizar() {
  guardarLocal(claveCarrito, carrito);
  actualizar();
}

function actualizar() {
  document.querySelectorAll('[data-simple]').forEach((el) => {
    const n = unidadesDe(el.dataset.simple);
    el.querySelector('.menos').classList.toggle('oculto', !n);
    const s = el.querySelector('span');
    s.textContent = n;
    s.classList.toggle('oculto', !n);
  });
  document.querySelectorAll('[data-insignia]').forEach((el) => {
    const n = unidadesDe(el.dataset.insignia);
    el.textContent = n;
    el.classList.toggle('oculto', !n);
  });

  const u = unidades();
  $('#barra').classList.toggle('oculto', !u);
  $('#cant-total').textContent = u;
  $('#total-barra').textContent = pesos(subtotal());
  if (!u && !$('#hoja').classList.contains('oculto')) cerrarHojas();
  pintarLineas();
}

function pintarLineas() {
  if (!carta) return;
  const filas = carrito.map((l) => {
    const p = producto(l.id);
    const det = detalleLinea(l);
    return `<div class="linea">
      <div>${esc(p.nombre)}${det ? `<small>${esc(det)}</small>` : ''}<small>${pesos(precioLinea(l))}</small></div>
      <div class="contador" data-linea="${esc(l.clave)}">
        <button class="menos" data-paso="-1" aria-label="Quitar">−</button>
        <span>${l.cantidad}</span>
        <button data-paso="1" aria-label="Agregar">+</button>
      </div>
    </div>`;
  });
  const dom = entrega === 'domicilio' ? carta.costoDomicilio : 0;
  if (carta.domicilioAparte && entrega === 'domicilio') {
    filas.push(`<div class="linea total"><span>Total productos</span><span>${pesos(totalFinal())}</span></div>`);
    filas.push(`<p class="nota-dom">🛵 El domicilio <b>no está incluido</b>: se cobra aparte según tu zona.</p>`);
  } else {
    filas.push(`<div class="linea"><span>Subtotal</span><span>${pesos(subtotal())}</span></div>`);
    if (entrega === 'domicilio') filas.push(`<div class="linea"><span>Domicilio</span><span>${dom ? pesos(dom) : 'Gratis'}</span></div>`);
    filas.push(`<div class="linea total"><span>Total</span><span>${pesos(totalFinal())}</span></div>`);
  }
  if (carta.pedidoMinimo && subtotal() < carta.pedidoMinimo) {
    filas.push(`<p class="error-txt">Pedido mínimo ${pesos(carta.pedidoMinimo)}. Te faltan ${pesos(carta.pedidoMinimo - subtotal())}.</p>`);
  }
  $('#lineas').innerHTML = filas.join('');
  $('#total-pagar').textContent = pesos(totalFinal());
  $('#pagar').disabled = !carta.abierto || !carrito.length || subtotal() < (carta.pedidoMinimo || 0);
}

// ---------- ventana de producto (quitar ingredientes / adicionales) ----------
let editando = null; // { id, cantidad, sin:Set, adicionales:{} }

function abrirProducto(id) {
  const p = producto(id);
  editando = { id, cantidad: 1, sin: new Set(), adicionales: {} };
  $('#p-nombre').textContent = p.nombre;
  $('#p-precio').textContent = pesos(p.precio);
  $('#p-nota').value = '';

  const ing = visibles(p);
  $('#p-ingredientes-bloque').classList.toggle('oculto', !ing.length);
  $('#p-ingredientes').innerHTML = ing.map((i) => i.fijo
    ? `<div class="ing fijo"><span class="check si">✓</span>${esc(i.nombre)}<em>Incluido</em></div>`
    : `<label class="ing"><input type="checkbox" checked data-ing="${esc(i.nombre)}"><span class="check"></span>${esc(i.nombre)}</label>`).join('');

  const ads = adicionalesDe(p);
  $('#p-adicionales-bloque').classList.toggle('oculto', !ads.length);
  $('#p-adicionales').innerHTML = ads.map((a) => `
    <div class="ad">
      <div>${esc(a.nombre)}<small>+ ${pesos(a.precio)}</small></div>
      <div class="contador" data-ad="${esc(a.id)}">
        <button class="menos oculto" data-paso="-1" aria-label="Quitar">−</button>
        <span class="oculto">0</span>
        <button data-paso="1" aria-label="Agregar">+</button>
      </div>
    </div>`).join('');

  pintarProducto();
  abrir('#hoja-producto');
}

function pintarProducto() {
  const p = producto(editando.id);
  document.querySelectorAll('[data-ad]').forEach((el) => {
    const n = editando.adicionales[el.dataset.ad] || 0;
    el.querySelector('.menos').classList.toggle('oculto', !n);
    const s = el.querySelector('span');
    s.textContent = n;
    s.classList.toggle('oculto', !n);
    el.querySelector('[data-paso="1"]').disabled = n >= carta.maxPorAdicional;
  });
  const extras = Object.entries(editando.adicionales).reduce((s, [id, n]) => s + adicional(id).precio * n, 0);
  $('#p-cant').textContent = editando.cantidad;
  $('#p-menos').disabled = editando.cantidad <= 1;
  $('#p-total').textContent = pesos((p.precio + extras) * editando.cantidad);
}

function confirmarProducto() {
  agregarLinea({
    id: editando.id,
    cantidad: editando.cantidad,
    sin: [...editando.sin],
    adicionales: Object.fromEntries(Object.entries(editando.adicionales).filter(([, n]) => n > 0)),
    nota: $('#p-nota').value.replace(/\s+/g, ' ').trim().slice(0, 140),
  });
  cerrarHojas();
}

// ---------- hojas ----------
function abrir(sel) {
  document.querySelectorAll('.hoja').forEach((h) => h.classList.add('oculto'));
  $('#velo').classList.remove('oculto');
  $(sel).classList.remove('oculto');
  $(sel).scrollTop = 0;
  document.body.style.overflow = 'hidden';
}
function cerrarHojas() {
  $('#velo').classList.add('oculto');
  document.querySelectorAll('.hoja').forEach((h) => h.classList.add('oculto'));
  document.body.style.overflow = '';
}
function mostrarError(t) { const e = $('#error'); e.textContent = t; e.classList.toggle('oculto', !t); }

// ---------- eventos ----------
document.addEventListener('click', (e) => {
  const paso = e.target.closest('[data-paso]');
  if (paso) {
    const d = Number(paso.dataset.paso);
    const cont = paso.closest('.contador');
    if (cont.dataset.simple) cambiarSimple(cont.dataset.simple, d);
    else if (cont.dataset.linea) cambiarLinea(cont.dataset.linea, d);
    else if (cont.dataset.ad) {
      const id = cont.dataset.ad;
      editando.adicionales[id] = Math.max(0, Math.min(carta.maxPorAdicional, (editando.adicionales[id] || 0) + d));
      if (!editando.adicionales[id]) delete editando.adicionales[id];
      pintarProducto();
    }
    return;
  }

  const abrirP = e.target.closest('[data-abrir]');
  if (abrirP && carta.abierto) return abrirProducto(abrirP.dataset.abrir);

  if (e.target.closest('[data-cerrar]')) return cerrarHojas();

  const chip = e.target.closest('[data-ir]');
  if (chip) {
    document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('activo', c === chip));
    document.getElementById('cat-' + chip.dataset.ir).scrollIntoView({ behavior: 'smooth' });
  }

  const met = e.target.closest('[data-metodo]');
  if (met) { elegirMetodo(met.dataset.metodo); mostrarError(''); return; }

  const op = e.target.closest('[data-entrega]');
  if (op) {
    entrega = op.dataset.entrega;
    document.querySelectorAll('[data-entrega]').forEach((o) => o.classList.toggle('activa', o === op));
    $('#campos-domicilio').classList.toggle('oculto', entrega !== 'domicilio');
    pintarLineas();
  }
});

document.addEventListener('change', (e) => {
  const ing = e.target.closest('[data-ing]');
  if (ing && editando) {
    ing.checked ? editando.sin.delete(ing.dataset.ing) : editando.sin.add(ing.dataset.ing);
  }
});

$('#p-mas').addEventListener('click', () => { editando.cantidad = Math.min(50, editando.cantidad + 1); pintarProducto(); });
$('#p-menos').addEventListener('click', () => { editando.cantidad = Math.max(1, editando.cantidad - 1); pintarProducto(); });
$('#p-agregar').addEventListener('click', confirmarProducto);
$('#ver-carrito').addEventListener('click', () => abrir('#hoja'));
$('#buscar').addEventListener('input', filtrar);
$('#f-paga-con').addEventListener('input', (e) => {
  const n = e.target.value.replace(/\D/g, '');
  e.target.value = n ? Number(n).toLocaleString('es-CO') : '';
});
$('#velo').addEventListener('click', cerrarHojas);

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarError('');
  const cliente = {
    nombre: $('#f-nombre').value.trim(),
    telefono: $('#f-tel').value.replace(/\D/g, ''),
    direccion: $('#f-dir').value.trim(),
    notas: $('#f-notas').value.trim(),
  };
  const barrio = $('#f-barrio').value.trim();
  if (cliente.nombre.length < 2) return mostrarError('Escribe tu nombre');
  if (!/^3\d{9}$/.test(cliente.telefono.replace(/^57/, ''))) return mostrarError('Escribe un celular válido de 10 dígitos');
  if (entrega === 'domicilio' && cliente.direccion.length < 5) return mostrarError('Escribe la dirección de entrega');
  if (!metodoPago) return mostrarError('Elige cómo vas a pagar');
  const pagaCon = Number($('#f-paga-con').value.replace(/\D/g, '')) || null;
  if (metodoPago === 'efectivo' && pagaCon && pagaCon < totalFinal()) return mostrarError(`El valor con el que pagas es menor al valor del pedido (${pesos(totalFinal())})`);

  guardarLocal(claveCliente, { nombre: cliente.nombre, telefono: cliente.telefono, direccion: cliente.direccion, barrio });
  if (barrio && entrega === 'domicilio') cliente.direccion = `${cliente.direccion}, ${barrio}`;

  const boton = $('#pagar');
  boton.disabled = true;
  boton.firstElementChild.textContent = 'Un momento…';
  try {
    const r = await fetch('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurante: slug,
        entrega,
        cliente,
        metodoPago,
        pagaCon: metodoPago === 'efectivo' ? pagaCon : null,
        items: carrito.map(({ id, cantidad, sin, adicionales, nota }) => ({ id, cantidad, sin, adicionales, nota })),
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'No se pudo crear el pedido');
    try { localStorage.removeItem(claveCarrito); } catch {}
    try { sessionStorage.setItem(`mensaje:${data.referencia}`, data.mensajeWhatsapp); } catch {}
    location.href = data.urlPago;
  } catch (err) {
    mostrarError(err.message);
    boton.disabled = false;
    boton.firstElementChild.textContent = textoPagar;
  }
});

iniciar();
