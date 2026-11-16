// Texto corto de un item: "2x The Smash (sin Pepinillos; +1 Tocineta)"
export function describirItem(i) {
  const cambios = [
    ...(i.sin?.length ? [`sin ${i.sin.join(', ')}`] : []),
    ...(i.adicionales || []).map((a) => `+${a.cantidad} ${a.nombre}`),
    ...(i.nota ? [`nota: ${i.nota}`] : []),
  ];
  return `${i.cantidad}x ${i.nombre}${cambios.length ? ` (${cambios.join('; ')})` : ''}`;
}

const pesos = (n) => '$' + Number(n).toLocaleString('es-CO');

// Mensaje completo del pedido para mandarlo al WhatsApp del restaurante.
// Formato de WhatsApp: *negrilla*, _cursiva_, > cita.
export function mensajePedido(p, r) {
  const fecha = new Date(p.creado || Date.now()).toLocaleString('es-CO', {
    timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const raya = '━━━━━━━━━━━━━━━━';
  const tel = p.cliente.telefono.replace(/^57/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
  const unidades = p.items.reduce((s, i) => s + i.cantidad, 0);
  const L = [];

  L.push(`🍔 *${r.nombre.toUpperCase()}*`);
  L.push(`*Nuevo pedido* · N.º ${p.referencia}`);
  L.push(`_${fecha}_`);
  L.push(raya);

  L.push('🧾 *DETALLE DEL PEDIDO*');
  L.push('');
  for (const i of p.items) {
    L.push(`▪️ *${i.cantidad} × ${i.nombre}* — ${pesos(i.precio * i.cantidad)}`);
    if (i.sin?.length) L.push(`     ✖️ Sin ${i.sin.join(', ').toLowerCase()}`);
    for (const a of i.adicionales || [])
      L.push(`     ➕ ${a.cantidad > 1 ? a.cantidad + ' × ' : ''}${a.nombre} (+${pesos(a.precio * a.cantidad)})`);
    if (i.nota) L.push(`     📝 _${i.nota}_`);
  }
  L.push(raya);

  if (p.domicilio) {
    L.push(`Productos (${unidades}): ${pesos(p.subtotal)}`);
    L.push(`Domicilio: ${pesos(p.domicilio)}`);
  }
  L.push(`💰 *TOTAL: ${pesos(p.total)}*${p.domicilioAparte ? ` _(${unidades} producto${unidades > 1 ? 's' : ''})_` : ''}`);
  if (p.domicilioAparte) L.push('🛵 _Domicilio no incluido: se cobra aparte según la zona_');
  L.push(raya);

  L.push('👤 *DATOS DE ENTREGA*');
  L.push(`Nombre: ${p.cliente.nombre}`);
  L.push(`Celular: ${tel}`);
  L.push(p.entrega === 'domicilio' ? `Dirección: ${p.cliente.direccion}` : 'Entrega: recoge en el local');
  if (p.cliente.notas) L.push(`Indicaciones: _${p.cliente.notas}_`);
  L.push(raya);

  L.push('💳 *FORMA DE PAGO*');
  if (p.metodoPago === 'efectivo') {
    L.push(`Efectivo contra entrega${p.pagaCon ? ` · paga con ${pesos(p.pagaCon)}` : ''}`);
  } else {
    L.push(`Transferencia / QR Nequi · ${pesos(p.total)}`);
    L.push('✅ _Adjunto el comprobante de pago_');
  }
  L.push('');
  L.push('_Pedido realizado desde la carta virtual_');
  return L.join('\n');
}
