/**
 * Wspólna logika eksportu księgi: pobieranie wartości komórki z zlecenia (w tym pola obliczane).
 * Nagłówki kolumn pochodzą z UI (frontend przekazuje key + label).
 */

type OrderRecord = Record<string, unknown>

function buildClientNameAddress(o: OrderRecord): string {
  const name = (o.client_name as string) || (o.client_short_name as string) || ''
  const parts = [
    o.client_street,
    [o.client_building, o.client_local].filter(Boolean).join(' '),
    o.client_postal_code,
    o.client_city,
    o.client_country
  ].filter(Boolean) as string[]
  const addr = parts.join(', ')
  return addr ? `${name}, ${addr}` : name || '—'
}

/**
 * Zwraca wartość surową dla danej kolumny (do CSV/Excel).
 * Dla PDF wywołujący formatuje daty i liczby.
 */
export function getOrderValue(order: OrderRecord, key: string, vatRate: number): unknown {
  const hasExemption = order.order_vat_code != null && String(order.order_vat_code).trim() !== ''
  const orderVatRate = Number(order.order_vat_rate)
  const effectiveVatRate = hasExemption ? 0 : (Number.isFinite(orderVatRate) ? orderVatRate : vatRate)
  const isOral = order.translation_type === 'oral'
  const amount = Number(order.amount) || 0
  const oralNet = order.oral_net != null ? Number(order.oral_net) : null
  const oralGross = order.oral_gross != null ? Number(order.oral_gross) : null
  const net = isOral && oralNet != null ? oralNet : amount
  const vat = isOral ? (oralGross != null && oralNet != null ? oralGross - oralNet : net * effectiveVatRate / 100) : (amount * effectiveVatRate / 100)
  const gross = isOral && oralGross != null ? oralGross : (net + vat)

  switch (key) {
    case 'client_name_address':
      return buildClientNameAddress(order)
    case 'amount_net':
      return net
    case 'amount_vat':
      return vat
    case 'amount_gross':
      return gross
    case 'document_form_remarks':
      return order.document_form_remarks ?? order.repertorium_description ?? null
    default:
      return order[key]
  }
}

export type ExportColumn = { key: string; label: string }
