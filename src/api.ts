import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { demoAdvanceOrder, demoClaimStation, demoCreateStation, demoGetOrders, demoGetProducts, demoGetProfile, demoGetStations, demoLogout, demoPlaceOrder, demoRotateStation, demoSaveProduct, demoWatch } from './demo';
import type { LineItem, OrderStatus, Product, Profile, Station, TeaOrder } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isDemo = !url || !anonKey;
const supabase: SupabaseClient | null = !isDemo ? createClient(url!, anonKey!, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
}) : null;

function failure(error: { message: string } | null) { if (error) throw new Error(error.message); }
function db() { if (!supabase) throw new Error('Veritabanı bağlantısı yapılandırılmamış.'); return supabase; }

export async function getProfile(): Promise<Profile | null> {
  if (isDemo) return demoGetProfile();
  const { data: { user }, error } = await db().auth.getUser(); failure(error);
  if (!user) return null;
  const { data, error: profileError } = await db().from('profiles').select('id,role,station_id,stations(name)').eq('id', user.id).maybeSingle();
  failure(profileError);
  if (!data) return null;
  const station = data.stations as unknown as { name: string } | null;
  return { id: data.id, role: data.role as Profile['role'], station_id: data.station_id, station_name: station?.name };
}
export async function claimStation(token: string): Promise<Profile> {
  if (isDemo) return demoClaimStation(token);
  const { data: { session }, error: sessionError } = await db().auth.getSession(); failure(sessionError);
  if (!session) { const { error } = await db().auth.signInAnonymously(); failure(error); }
  const { error } = await db().rpc('claim_station', { p_token: token }); failure(error);
  const profile = await getProfile();
  if (!profile) throw new Error('QR koduyla giriş tamamlanamadı.');
  return profile;
}
export async function staffLogin(email: string, password: string): Promise<Profile> {
  if (isDemo) return { id: 'demo-staff', role: 'staff', station_id: null };
  const { error } = await db().auth.signInWithPassword({ email, password }); failure(error);
  const profile = await getProfile();
  if (profile?.role !== 'staff') { await db().auth.signOut(); throw new Error('Bu hesap için çay ocağı yetkisi tanımlı değil.'); }
  return profile;
}
export async function logout() { if (isDemo) demoLogout(); else { const { error } = await db().auth.signOut(); failure(error); } }
export async function getProducts(): Promise<Product[]> {
  if (isDemo) return demoGetProducts();
  const { data, error } = await db().from('products').select('id,name,icon,category,sort_order,is_available').order('sort_order'); failure(error);
  return (data || []) as Product[];
}
export async function getStations(): Promise<Station[]> {
  if (isDemo) return demoGetStations();
  const { data, error } = await db().from('stations').select('id,name,active').order('name'); failure(error);
  return (data || []) as Station[];
}
export async function getOrders(stationId?: string | null): Promise<TeaOrder[]> {
  if (isDemo) return demoGetOrders(stationId);
  let query = db().from('orders').select('id,station_id,status,created_at,stations(name),order_items(quantity,products(id,name,icon))').order('created_at', { ascending: false }).limit(100);
  if (stationId) query = query.eq('station_id', stationId);
  const { data, error } = await query; failure(error);
  type Raw = { id: string; station_id: string; status: OrderStatus; created_at: string; stations: { name: string } | null; order_items: { quantity: number; products: { id: string; name: string; icon: string } | null }[] };
  return ((data || []) as unknown as Raw[]).map(row => ({
    id: row.id, station_id: row.station_id, station_name: row.stations?.name || 'Bilinmeyen bölüm',
    status: row.status, created_at: row.created_at,
    items: row.order_items.map(item => ({ product_id: item.products?.id, name: item.products?.name || 'Silinmiş ürün', icon: item.products?.icon || 'mug', quantity: item.quantity }))
  }));
}
export async function placeOrder(stationId: string, items: LineItem[]): Promise<string> {
  if (isDemo) return demoPlaceOrder(stationId, items);
  const { data, error } = await db().rpc('place_order', { p_items: items }); failure(error);
  return data as string;
}
export async function advanceOrder(id: string, status: OrderStatus) {
  if (isDemo) return demoAdvanceOrder(id, status);
  const { error } = await db().rpc('advance_order', { p_order_id: id, p_new_status: status }); failure(error);
}
export async function createStation(name: string): Promise<{ station_id: string; token: string }> {
  if (isDemo) return demoCreateStation(name);
  const { data, error } = await db().rpc('create_station', { p_name: name }); failure(error);
  const row = data?.[0]; if (!row) throw new Error('Bölüm oluşturulamadı.');
  return row;
}
export async function rotateStation(id: string): Promise<{ station_id: string; token: string }> {
  if (isDemo) return demoRotateStation(id);
  const { data, error } = await db().rpc('rotate_station_token', { p_station_id: id }); failure(error);
  const row = data?.[0]; if (!row) throw new Error('QR kodu üretilemedi.');
  return row;
}
export async function saveProduct(product: Partial<Product> & { name: string }) {
  if (isDemo) return demoSaveProduct(product);
  const payload = {
    name: product.name, icon: product.icon || 'mug', category: product.category || 'Diğer',
    is_available: product.is_available ?? true,
    ...(product.id ? { id: product.id, sort_order: product.sort_order } : {})
  };
  const { error } = await db().from('products').upsert(payload); failure(error);
}
export function watchOrders(onChange: (kind: 'INSERT' | 'UPDATE') => void) {
  if (isDemo) return demoWatch(() => onChange('UPDATE'));
  const channel = db().channel(`orders-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => onChange(payload.eventType === 'INSERT' ? 'INSERT' : 'UPDATE'))
    .subscribe();
  return () => { void db().removeChannel(channel); };
}
