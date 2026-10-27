export type OrderStatus = 'new' | 'preparing' | 'on_the_way' | 'delivered';
export type Role = 'customer' | 'staff';
export interface Product {
  id: string;
  name: string;
  icon: string;
  category: string;
  sort_order: number;
  is_available: boolean;
}
export interface Station { id: string; name: string; active: boolean }
export interface Profile { id: string; role: Role; station_id: string | null; station_name?: string }
export interface LineItem { product_id: string; quantity: number }
export interface OrderItem { product_id?: string; name: string; icon: string; quantity: number }
export interface TeaOrder {
  id: string;
  station_id: string;
  station_name: string;
  status: OrderStatus;
  created_at: string;
  items: OrderItem[];
}
export const statusNames: Record<OrderStatus, string> = {
  new: 'Alındı', preparing: 'Hazırlanıyor', on_the_way: 'Yolda', delivered: 'Teslim edildi'
};
export const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  new: 'preparing', preparing: 'on_the_way', on_the_way: 'delivered'
};
export const nextStatusButtons: Partial<Record<OrderStatus, string>> = {
  new: 'Hazırlamaya başla', preparing: 'Yola çıktı', on_the_way: 'Teslim edildi'
};
