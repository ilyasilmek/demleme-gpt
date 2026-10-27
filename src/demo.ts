import type { LineItem, OrderStatus, Product, Profile, Station, TeaOrder } from './types';

const key = 'demleme-demo-v1';
const profileKey = 'demleme-demo-profile';
export const demoProducts: Product[] = [
  { id: 'cay', name: 'İnce belli çay', icon: 'tea', category: 'Çay', sort_order: 1, is_available: true },
  { id: 'acik', name: 'Açık çay', icon: 'tea-light', category: 'Çay', sort_order: 2, is_available: true },
  { id: 'kahve', name: 'Türk kahvesi', icon: 'coffee', category: 'Kahve', sort_order: 3, is_available: true },
  { id: 'nescafe', name: 'Nescafe', icon: 'mug', category: 'Kahve', sort_order: 4, is_available: true },
  { id: 'ihlamur', name: 'Ihlamur', icon: 'herbal', category: 'Diğer', sort_order: 5, is_available: true },
  { id: 'su', name: 'Su', icon: 'water', category: 'Diğer', sort_order: 6, is_available: true }
];
export const demoStations: Station[] = [
  { id: 'muhasebe', name: 'Muhasebe', active: true },
  { id: 'atolye', name: 'Atölye', active: true },
  { id: 'ofis3', name: 'Ofis 3', active: true }
];
interface DemoStore { products: Product[]; stations: Station[]; orders: TeaOrder[] }
function read(): DemoStore {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const data = JSON.parse(raw) as DemoStore;
      if (Array.isArray(data.products) && Array.isArray(data.stations) && Array.isArray(data.orders)) return data;
    }
  } catch { /* uninitialized storage */ }
  return { products: structuredClone(demoProducts), stations: structuredClone(demoStations), orders: [] };
}
function save(store: DemoStore) {
  localStorage.setItem(key, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent('demleme:change'));
}
export function demoGetProducts() { return read().products.sort((a,b) => a.sort_order - b.sort_order); }
export function demoGetStations() { return read().stations; }
export function demoGetProfile(): Profile | null {
  const stationId = sessionStorage.getItem(profileKey);
  if (!stationId) return null;
  const station = read().stations.find(s => s.id === stationId && s.active);
  return station ? { id: `demo-${stationId}`, role: 'customer', station_id: station.id, station_name: station.name } : null;
}
export function demoClaimStation(stationId: string): Profile {
  const station = read().stations.find(s => s.id === stationId && s.active);
  if (!station) throw new Error('Bu QR kodu geçersiz veya kullanım dışı.');
  sessionStorage.setItem(profileKey, station.id);
  return { id: `demo-${station.id}`, role: 'customer', station_id: station.id, station_name: station.name };
}
export function demoLogout() { sessionStorage.removeItem(profileKey); }
export function demoGetOrders(stationId?: string | null) {
  return read().orders.filter(order => !stationId || order.station_id === stationId).sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0, 100);
}
export function demoPlaceOrder(stationId: string, items: LineItem[]) {
  const db = read();
  const station = db.stations.find(s => s.id === stationId && s.active);
  if (!station) throw new Error('Sipariş noktası bulunamadı.');
  const order: TeaOrder = {
    id: crypto.randomUUID(), station_id: station.id, station_name: station.name, status: 'new',
    created_at: new Date().toISOString(),
    items: items.map(item => {
      const product = db.products.find(p => p.id === item.product_id && p.is_available);
      if (!product || item.quantity < 1 || item.quantity > 20) throw new Error('Sipariş içeriği geçersiz.');
      return { product_id: product.id, name: product.name, icon: product.icon, quantity: item.quantity };
    })
  };
  if (!order.items.length) throw new Error('Siparişinizde içecek bulunmuyor.');
  db.orders.unshift(order);
  save(db);
  return order.id;
}
export function demoAdvanceOrder(id: string, status: OrderStatus) {
  const db = read();
  const order = db.orders.find(o => o.id === id);
  if (!order) throw new Error('Sipariş bulunamadı.');
  const possible: Record<OrderStatus, OrderStatus | null> = { new: 'preparing', preparing: 'on_the_way', on_the_way: 'delivered', delivered: null };
  if (possible[order.status] !== status) throw new Error('Bu durum değişikliği mümkün değil.');
  order.status = status; save(db);
}
export function demoCreateStation(name: string) {
  const db = read();
  const station = { id: crypto.randomUUID(), name: name.trim(), active: true };
  if (!station.name) throw new Error('Bölüm adı gerekli.');
  db.stations.push(station); save(db);
  return { station_id: station.id, token: station.id };
}
export function demoRotateStation(id: string) {
  const station = read().stations.find(s => s.id === id);
  if (!station) throw new Error('Bölüm bulunamadı.');
  return { station_id: station.id, token: station.id };
}
export function demoSaveProduct(product: Partial<Product> & { name: string }) {
  const db = read();
  const previous = db.products.find(p => p.id === product.id);
  if (previous) Object.assign(previous, product);
  else db.products.push({ id: crypto.randomUUID(), name: product.name, icon: product.icon || 'mug', category: product.category || 'Diğer', sort_order: db.products.length + 1, is_available: true });
  save(db);
}
export function demoWatch(onChange: () => void) {
  const callback = () => onChange();
  window.addEventListener('storage', callback);
  window.addEventListener('demleme:change', callback);
  return () => { window.removeEventListener('storage', callback); window.removeEventListener('demleme:change', callback); };
}
