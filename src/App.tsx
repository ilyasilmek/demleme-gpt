import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, ArrowRight, Bell, BellOff, Check, CheckCheck, ChevronRight, CircleHelp, Clock3, Coffee, CupSoda, Download, GlassWater, LayoutDashboard, LogOut, Minus, Plus, Printer, QrCode, RefreshCw, Settings2, ShoppingBag, Volume2, X } from 'lucide-react';
import { advanceOrder, claimStation, createStation, getOrders, getProducts, getProfile, getStations, isDemo, logout, placeOrder, rotateStation, saveProduct, staffLogin, watchOrders } from './api';
import type { OrderStatus, Product, Profile, Station, TeaOrder } from './types';
import { nextStatus, nextStatusButtons, statusNames } from './types';

const baseUrl = () => new URL(import.meta.env.BASE_URL, window.location.origin).href;
const panelUrl = () => `${baseUrl()}?panel=ocak`;
const formatTime = (date: string) => new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(date));
const formatDate = (date: string) => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
function friendlyError(error: unknown) { return error instanceof Error ? error.message : 'İşlem tamamlanamadı. Tekrar deneyin.'; }

function DrinkIcon({ icon, large = false }: { icon: string; large?: boolean }) {
  if (icon === 'tea' || icon === 'tea-light') return <span className={`tea-icon ${large ? 'large' : ''} ${icon === 'tea-light' ? 'light-tea' : ''}`} aria-hidden="true"><span className="tea-rim"/><span className="tea-fill"/><span className="tea-foot"/></span>;
  const size = large ? 34 : 23;
  if (icon === 'coffee') return <Coffee size={size} strokeWidth={1.6} />;
  if (icon === 'water') return <GlassWater size={size} strokeWidth={1.6} />;
  if (icon === 'herbal') return <CupSoda size={size} strokeWidth={1.6} />;
  return <Coffee size={size} strokeWidth={1.6} />;
}
function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="brand"><span className="brand-icon"><DrinkIcon icon="tea" /></span>{!compact && <span>demleme<span className="brand-period">.</span></span>}</span>;
}
function DemoRibbon() { return isDemo ? <div className="demo-ribbon">Demo modu <span className="ribbon-sep">·</span> Siparişler yalnızca bu tarayıcıda saklanır. Canlı kullanım için veritabanını bağlayın.</div> : null; }
function InlineError({ message }: { message: string }) { return message ? <p className="error-message" role="alert">{message}</p> : null; }
function Loading() { return <div className="loading-page"><Brand /><div className="small-spinner"/><p>Demleme açılıyor…</p></div>; }

function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mode, setMode] = useState<'customer' | 'staff'>(() => new URLSearchParams(location.search).get('panel') === 'ocak' ? 'staff' : 'customer');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [staffLoggedIn, setStaffLoggedIn] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const query = new URLSearchParams(location.search);
        const token = query.get('join') || (isDemo ? query.get('demoStation') : null);
        let p = token ? await claimStation(token) : await getProfile();
        if (!active) return;
        if (token) {
          const clean = new URL(location.href);
          clean.searchParams.delete('join'); clean.searchParams.delete('demoStation');
          history.replaceState({}, '', clean.toString());
        }
        if (p?.role === 'staff') setStaffLoggedIn(true);
        if (p?.role === 'staff' && mode === 'customer') {
          // Staff account is not also a customer QR identity.
          p = null;
        }
        setProfile(p);
      } catch (e) { if (active) setError(friendlyError(e)); }
      finally { if (active) setLoading(false); }
    }
    void init();
    return () => { active = false; };
  }, [mode, refreshKey]);

  const changeMode = (next: 'customer' | 'staff') => {
    const url = new URL(location.href);
    if (next === 'staff') url.searchParams.set('panel', 'ocak'); else url.searchParams.delete('panel');
    history.pushState({}, '', url.toString()); setMode(next); setError('');
  };
  const exit = async () => {
    try { await logout(); setProfile(null); setStaffLoggedIn(false); setRefreshKey(x => x + 1); }
    catch(e) { setError(friendlyError(e)); }
  };
  if (loading) return <Loading />;
  if (mode === 'staff') return <StaffShell profile={staffLoggedIn ? profile : null} onAuthenticated={p => { setStaffLoggedIn(true); setProfile(p); }} onExit={exit} onBack={() => changeMode('customer')} />;
  if (!profile) return <Welcome error={error} onDemo={async () => { try { setLoading(true); const p = await claimStation('muhasebe'); setProfile(p); } catch (e) { setError(friendlyError(e)); } finally { setLoading(false); } }} onStaff={() => changeMode('staff')} />;
  return <CustomerScreen key={profile.id} profile={profile} onExit={exit} />;
}

function Welcome({ error, onDemo, onStaff }: { error: string; onDemo: () => void; onStaff: () => void }) {
  return <><DemoRibbon /><div className="welcome-layout"><header className="welcome-header"><Brand /><button className="text-button" onClick={onStaff}>Çay ocağı girişi <ArrowRight size={16}/></button></header>
    <main className="welcome-content"><div className="welcome-mark"><QrCode size={36} strokeWidth={1.45}/></div><p className="eyebrow">BİR YUDUM KADAR KOLAY</p><h1>Çay söylemenin<br/>daha kısa yolu.</h1><p className="welcome-description">Size verilen QR kodu telefonunuzla okutun. İçeceğinizi seçin, gerisini çay ocağına bırakın.</p><div className="welcome-steps"><span><b>01</b> QR kodunu okut</span><span><b>02</b> Sipariş ver</span><span><b>03</b> Durumunu takip et</span></div><InlineError message={error} />{isDemo && <button className="primary-button welcome-demo" onClick={onDemo}>Muhasebe olarak demoyu dene <ArrowRight size={18}/></button>}<p className="muted hint-text">QR kodunuz yoksa çay ocağı sorumlusundan isteyebilirsiniz.</p></main>
    <footer className="welcome-footer">Demleme · Çay ocağı sipariş sistemi</footer>
  </div></>;
}

function CustomerScreen({ profile, onExit }: { profile: Profile; onExit: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [orders, setOrders] = useState<TeaOrder[]>([]);
  const [tab, setTab] = useState<'menu' | 'orders'>('menu');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const load = useCallback(async () => {
    try {
      const [p, o] = await Promise.all([getProducts(), getOrders(profile.station_id)]);
      setProducts(p.filter(item => item.is_available)); setOrders(o);
    } catch (e) { setError(friendlyError(e)); }
  }, [profile.station_id]);
  useEffect(() => { void load(); return watchOrders(() => void load()); }, [load]);
  useEffect(() => { const f = () => void load(); window.addEventListener('focus', f); return () => window.removeEventListener('focus', f); }, [load]);
  const setQuantity = (id: string, amount: number) => setCart(prev => ({ ...prev, [id]: Math.max(0, Math.min(20, (prev[id] || 0) + amount)) }));
  const total = Object.values(cart).reduce((a,b) => a+b,0);
  const send = async () => {
    if (!profile.station_id || !total || busy) return;
    setBusy(true); setError('');
    try {
      const items = Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([product_id, quantity]) => ({ product_id, quantity }));
      await placeOrder(profile.station_id, items);
      setCart({}); setTab('orders'); setToast('Siparişiniz çay ocağına iletildi.');
      await load();
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };
  return <><DemoRibbon /><div className="customer-shell"><header className="customer-header"><Brand /><div className="customer-header-right"><span className="station-label">{profile.station_name || 'Bölümüm'}</span><button className="icon-button" title="Çıkış yap" aria-label="Çıkış yap" onClick={onExit}><LogOut size={18}/></button></div></header>
    <main className="customer-main"><div className="page-intro"><p className="eyebrow">{profile.station_name?.toLocaleUpperCase('tr-TR') || 'HOŞ GELDİNİZ'}</p><h1>{tab === 'menu' ? 'Ne içmek istersiniz?' : 'Siparişlerim'}</h1><p>{tab === 'menu' ? 'İçecekleri seçin, adetlerini belirleyin.' : 'Siparişinizin her aşamasını buradan takip edin.'}</p></div>
      <nav className="customer-tabs" aria-label="Sayfa bölümleri"><button className={tab === 'menu' ? 'active' : ''} onClick={() => setTab('menu')}><ShoppingBag size={17}/> Sipariş ver</button><button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}><Clock3 size={17}/> Siparişlerim {orders.some(o => o.status !== 'delivered') && <span className="tiny-indicator"/>}</button></nav>
      <InlineError message={error} />
      {tab === 'menu' ? <><div className="drinks-grid">{products.map(product => <div key={product.id} className={`drink-card ${cart[product.id] ? 'selected' : ''}`}><button className="drink-select" onClick={() => setQuantity(product.id,1)} aria-label={`${product.name}, ${cart[product.id] || 0} adet, eklemek için dokunun`}><div className="drink-icon-wrap"><DrinkIcon icon={product.icon} large/></div><span className="drink-name">{product.name}</span></button>{cart[product.id] ? <div className="quantity-control"><button type="button" aria-label={`${product.name} azalt`} onClick={() => setQuantity(product.id,-1)}><Minus size={15}/></button><strong>{cart[product.id]}</strong><button type="button" aria-label={`${product.name} artır`} onClick={() => setQuantity(product.id,1)}><Plus size={15}/></button></div> : <span className="add-circle"><Plus size={17}/></span>}</div>)}</div>{!products.length && <div className="empty-state">Şu anda menüde içecek bulunmuyor.</div>}
        <div className="cart-area"><div className="cart-caption"><span>Sepetiniz</span><strong>{total} içecek</strong></div>{total > 0 && <div className="cart-items">{products.filter(p => cart[p.id]).map(p => <div key={p.id}><span>{p.name}</span><strong>{cart[p.id]} adet</strong></div>)}</div>}<button className="primary-button send-button" disabled={!total || busy} onClick={() => void send()}>{busy ? 'Sipariş gönderiliyor…' : 'Siparişi gönder'} <ArrowRight size={18}/></button><p className="tiny-note">Siparişiniz doğrudan çay ocağının ekranına düşer.</p></div></> : <div className="customer-orders">{toast && <div className="success-note"><Check size={17}/>{toast}<button onClick={() => setToast('')} aria-label="Bildirimi kapat"><X size={15}/></button></div>}{orders.length ? orders.map(order => <OrderProgress key={order.id} order={order}/>) : <div className="empty-state"><ShoppingBag size={30}/><h3>Henüz siparişiniz yok.</h3><p>İlk çayınızı söylemeye ne dersiniz?</p><button className="secondary-button" onClick={() => setTab('menu')}>Sipariş ver</button></div>}<button className="secondary-button full-width" onClick={() => setTab('menu')}><Plus size={18}/> Yeni sipariş oluştur</button></div>}
    </main><footer className="customer-footer">Demleme ile hazırlandı. ☕</footer></div></>;
}
const progressStatuses: OrderStatus[] = ['new','preparing','on_the_way','delivered'];
function OrderProgress({ order }: { order: TeaOrder }) {
  const current = progressStatuses.indexOf(order.status);
  return <article className="progress-card"><div className="progress-card-header"><div><span className="order-ref">SİPARİŞ · {order.id.slice(0,6).toUpperCase()}</span><p className="order-time">{formatDate(order.created_at)}</p></div><span className={`status-pill status-${order.status}`}>{statusNames[order.status]}</span></div>
    <div className="progress-items">{order.items.map((item,i) => <div key={i} className="progress-item"><span className="progress-icon"><DrinkIcon icon={item.icon}/></span><span>{item.name}</span><strong>{item.quantity} adet</strong></div>)}</div>
    <div className="steps-track">{progressStatuses.map((state, index) => <div key={state} className={`step ${index <= current ? 'done' : ''} ${index === current ? 'current' : ''}`}><div className="step-dot">{index <= current ? <Check size={13} strokeWidth={3}/> : null}</div><span>{statusNames[state]}</span></div>)}</div>
    <div className={`progress-summary ${order.status === 'on_the_way' ? 'on-the-way' : ''}`}>{order.status === 'delivered' ? <CheckCheck size={20}/> : order.status === 'on_the_way' ? <ArrowRight size={20}/> : <Clock3 size={20}/>}<div><strong>{order.status === 'new' ? 'Siparişiniz alındı' : order.status === 'preparing' ? 'İçecekleriniz hazırlanıyor' : order.status === 'on_the_way' ? 'Siparişiniz yolda' : 'Afiyet olsun!'}</strong><p>{order.status === 'new' ? 'Çay ocağı siparişinizi görüyor.' : order.status === 'preparing' ? 'Çaylar az sonra hazır.' : order.status === 'on_the_way' ? 'Çay ocağından çıktı, size geliyor.' : 'Siparişiniz teslim edildi.'}</p></div></div>
  </article>;
}

function ring(ctx: AudioContext) {
  if (ctx.state === 'suspended') void ctx.resume();
  const t = ctx.currentTime;
  for (const [i, frequency] of [880, 1175].entries()) {
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, t+i*.19);
    gain.gain.setValueAtTime(0.0001, t+i*.19);
    gain.gain.exponentialRampToValueAtTime(.18, t+i*.19+.025);
    gain.gain.exponentialRampToValueAtTime(.0001, t+i*.19+.31);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t+i*.19); osc.stop(t+i*.19+.32);
  }
}
function StaffShell({ profile, onAuthenticated, onExit, onBack }: { profile: Profile | null; onAuthenticated: (p: Profile) => void; onExit: () => void; onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [section, setSection] = useState<'orders' | 'settings'>('orders');
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const [orders, setOrders] = useState<TeaOrder[]>([]);
  const [showDelivered, setShowDelivered] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const prevIds = useRef<Set<string> | null>(null);
  const soundEnabledRef = useRef(false);
  const load = useCallback(async (notify = false) => {
    try {
      const data = await getOrders();
      if (notify && prevIds.current && data.some(o => !prevIds.current!.has(o.id) && o.status === 'new') && soundEnabledRef.current && audioRef.current) ring(audioRef.current);
      prevIds.current = new Set(data.map(o => o.id));
      setOrders(data); setError('');
    } catch (e) { setError(friendlyError(e)); }
  }, []);
  useEffect(() => { if (!profile || profile.role !== 'staff') return; void load(); return watchOrders(() => void load(true)); }, [load, profile]);
  useEffect(() => { if (!profile || profile.role !== 'staff') return; const f = () => void load(); window.addEventListener('focus', f); return () => window.removeEventListener('focus', f); }, [load, profile]);
  useEffect(() => () => { if(audioRef.current) void audioRef.current.close(); }, []);
  const login = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { onAuthenticated(await staffLogin(email, password)); } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  const enableSound = () => {
    if (soundEnabled) { setSoundEnabled(false); soundEnabledRef.current = false; return; }
    try { if (!audioRef.current) audioRef.current = new AudioContext(); void audioRef.current.resume(); ring(audioRef.current); setSoundEnabled(true); soundEnabledRef.current = true; }
    catch { setError('Bu tarayıcı sesli bildirimleri desteklemiyor.'); }
  };
  const advance = async (order: TeaOrder) => {
    const next = nextStatus[order.status]; if (!next) return;
    setActionBusy(order.id); setError('');
    try { await advanceOrder(order.id, next); await load(); } catch (e) { setError(friendlyError(e)); }
    finally { setActionBusy(null); }
  };
  if (!profile || profile.role !== 'staff') return <><DemoRibbon /><div className="staff-login"><header className="welcome-header"><Brand/><button onClick={onBack} className="text-button"><ArrowLeft size={16}/> Kullanıcı ekranı</button></header><form className="login-card" onSubmit={e => void login(e)}><span className="login-mark"><LayoutDashboard size={26}/></span><p className="eyebrow">ÇAY OCAĞI PANELİ</p><h1>Hoş geldiniz.</h1><p>Siparişleri yönetmek için giriş yapın.</p>{!isDemo && <><label>E-posta<input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="ornek@isletme.com"/></label><label>Şifre<input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"/></label></>}<InlineError message={error}/><button className="primary-button full-width" disabled={busy} type="submit">{isDemo ? 'Demo çay ocağı panelini aç' : busy ? 'Giriş yapılıyor…' : 'Giriş yap'} <ArrowRight size={18}/></button>{isDemo && <p className="tiny-note">Bu giriş yalnızca tanıtım içindir.</p>}</form></div></>;
  const active = orders.filter(o => o.status !== 'delivered');
  const visible = showDelivered ? orders.filter(o => o.status === 'delivered') : active;
  const newCount = active.filter(o => o.status === 'new').length;
  return <><DemoRibbon /><div className="dashboard"><aside className="dashboard-sidebar"><div className="sidebar-top"><Brand /><p>Çay ocağı yönetimi</p></div><nav><button className={section === 'orders' ? 'selected' : ''} onClick={() => setSection('orders')}><LayoutDashboard size={19}/> Siparişler <span className="nav-count">{active.length}</span></button><button className={section === 'settings' ? 'selected' : ''} onClick={() => setSection('settings')}><Settings2 size={19}/> Yönetim</button></nav><div className="sidebar-bottom"><div className="sidebar-flourish">İyi çay,<br/>iyi çalışma.</div><button className="sidebar-signout" onClick={onExit}><LogOut size={18}/> Çıkış yap</button></div></aside>
    <main className="dashboard-main"><div className="dashboard-topbar"><div className="dashboard-mobile-brand"><Brand/></div><span className="online"><span/> Panel açık</span><div className="dashboard-mobile-actions"><button className={section === 'orders' ? 'mobile-active' : ''} onClick={() => setSection('orders')}>Siparişler</button><button className={section === 'settings' ? 'mobile-active' : ''} onClick={() => setSection('settings')}>Yönetim</button></div><button className="icon-button dashboard-exit" onClick={onExit} title="Çıkış yap"><LogOut size={18}/></button></div>
      {section === 'orders' ? <><div className="dashboard-heading"><div><p className="eyebrow">SİPARİŞ TAKİBİ</p><h1>Gelen siparişler</h1><p>Yeni siparişler burada anında görünür.</p></div><button className={`sound-button ${soundEnabled ? 'sound-on' : ''}`} onClick={enableSound}>{soundEnabled ? <Volume2 size={18}/> : <BellOff size={18}/>} {soundEnabled ? 'Bildirim sesi açık' : 'Bildirim sesini aç'}</button></div><div className="stats-row"><div className="stat-card"><span>Aktif sipariş</span><strong>{active.length}</strong></div><div className="stat-card"><span>Yeni gelen</span><strong>{newCount}</strong></div><div className="stat-card"><span>Yolda</span><strong>{active.filter(o => o.status === 'on_the_way').length}</strong></div></div><div className="orders-toolbar"><div className="section-tabs"><button className={!showDelivered ? 'active' : ''} onClick={() => setShowDelivered(false)}>Aktif siparişler <span>{active.length}</span></button><button className={showDelivered ? 'active' : ''} onClick={() => setShowDelivered(true)}>Teslim edilenler</button></div><button className="refresh-button" onClick={() => void load()} title="Yenile"><RefreshCw size={17}/> Yenile</button></div><InlineError message={error}/>{visible.length ? <div className="orders-list">{visible.map(order => <article key={order.id} className={`operator-order ${order.status === 'new' ? 'is-new' : ''}`}><div className="operator-order-top"><div className="operator-title"><span className="operator-time">{formatTime(order.created_at)}</span><h3>{order.station_name}</h3></div><span className={`status-pill status-${order.status}`}>{statusNames[order.status]}</span></div><div className="operator-order-items">{order.items.map((item,i) => <div key={i}><span className="operator-item-icon"><DrinkIcon icon={item.icon}/></span><span>{item.name}</span><strong>{item.quantity} adet</strong></div>)}</div><div className="operator-order-footer"><span>#{order.id.slice(0,6).toUpperCase()}</span>{nextStatus[order.status] && <button className="operator-action" disabled={actionBusy === order.id} onClick={() => void advance(order)}>{actionBusy === order.id ? 'Kaydediliyor…' : nextStatusButtons[order.status]} <ChevronRight size={18}/></button>}</div></article>)}</div> : <div className="empty-state dashboard-empty"><Bell size={32}/><h3>{showDelivered ? 'Henüz teslim edilmiş sipariş yok.' : 'Şimdilik sipariş yok.'}</h3><p>{showDelivered ? 'Teslim edilenler burada listelenecek.' : 'Yeni bir sipariş geldiğinde burada görünecek.'}</p></div>}{!soundEnabled && <p className="sound-help"><CircleHelp size={16}/> Sesli uyarı için önce “Bildirim sesini aç”a basın. Tarayıcı kısıtlamaları nedeniyle panel kapalıyken ses çalınmaz.</p>}</> : <AdminSettings/>}
    </main></div></>;
}

function AdminSettings() {
  const [stations, setStations] = useState<Station[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState('');
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('Diğer');
  const [icon, setIcon] = useState('mug');
  const [qr, setQr] = useState<{ station_id: string; token: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const [s,p] = await Promise.all([getStations(), getProducts()]); setStations(s); setProducts(p); }
    catch(e) { setError(friendlyError(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const create = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { const created = await createStation(name); setQr({ ...created, name }); setName(''); await load(); }
    catch(e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  const rotate = async (station: Station) => {
    if (!confirm(`${station.name} için yeni QR kodu üretilecek. Önceden basılmış QR kodları artık çalışmayacak. Devam edilsin mi?`)) return;
    setError('');
    try { const result = await rotateStation(station.id); setQr({ ...result, name: station.name }); }
    catch(e) { setError(friendlyError(e)); }
  };
  const addDrink = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { await saveProduct({ name: productName, category, icon }); setProductName(''); await load(); }
    catch(e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  const toggleProduct = async (product: Product) => {
    try { await saveProduct({ ...product, is_available: !product.is_available }); await load(); }
    catch(e) { setError(friendlyError(e)); }
  };
  const joinUrl = qr ? `${baseUrl()}${isDemo ? `?demoStation=${encodeURIComponent(qr.token)}` : `?join=${encodeURIComponent(qr.token)}`}` : '';
  const downloadQr = () => {
    const svg = document.getElementById('station-qr-svg'); if (!svg || !qr) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `demleme-${qr.name.toLocaleLowerCase('tr-TR').replace(/\s+/g,'-')}-qr.svg`; link.click(); URL.revokeObjectURL(url);
  };
  return <div className="settings-page"><div className="dashboard-heading"><div><p className="eyebrow">İŞLETME AYARLARI</p><h1>Yönetim</h1><p>Bölümleri ve içecek menüsünü buradan yönetin.</p></div></div><InlineError message={error}/><div className="settings-sections"><section className="settings-box"><div className="settings-box-header"><div><h2>Bölümler ve QR kodları</h2><p>Her ofise veya bölüme özel bir QR kodu oluşturun.</p></div><QrCode size={23}/></div><form onSubmit={e => void create(e)} className="inline-form"><input required maxLength={60} placeholder="Örn. Muhasebe, Atölye, Ofis 3" value={name} onChange={e => setName(e.target.value)}/><button className="primary-button" disabled={busy} type="submit"><Plus size={17}/> Bölüm ekle</button></form><div className="settings-list">{stations.map(s => <div key={s.id}><span className="settings-list-title"><span className="station-dot"/>{s.name}</span><button className="outline-small" onClick={() => void rotate(s)}><QrCode size={16}/> QR oluştur / yenile</button></div>)}</div><p className="tiny-note">Güvenlik için QR bağlantısı yalnızca oluşturulduğu anda gösterilir. Yenilemek eski QR bağlantısını geçersiz kılar.</p></section>
    <section className="settings-box"><div className="settings-box-header"><div><h2>İçecek menüsü</h2><p>Ürün ekleyin veya geçici olarak satıştan kaldırın.</p></div><Coffee size={23}/></div><form className="drink-add-form" onSubmit={e => void addDrink(e)}><label>İçecek adı<input required maxLength={70} placeholder="Örn. Ada çayı" value={productName} onChange={e => setProductName(e.target.value)}/></label><label>Kategori<select value={category} onChange={e => setCategory(e.target.value)}><option>Çay</option><option>Kahve</option><option>Diğer</option></select></label><label>Simge<select value={icon} onChange={e => setIcon(e.target.value)}><option value="tea">Çay</option><option value="tea-light">Açık çay</option><option value="coffee">Kahve</option><option value="mug">Fincan</option><option value="herbal">Bitki çayı</option><option value="water">Su</option></select></label><button className="primary-button" disabled={busy} type="submit"><Plus size={17}/> İçecek ekle</button></form><div className="settings-list product-settings-list">{products.map(p => <div key={p.id}><span className="settings-list-title"><span className="settings-product-icon"><DrinkIcon icon={p.icon}/></span>{p.name}</span><button className={`availability-switch ${p.is_available ? 'available' : ''}`} aria-label={`${p.name}: ${p.is_available ? 'Menüden kaldır' : 'Menüye ekle'}`} onClick={() => void toggleProduct(p)}>{p.is_available ? 'Menüde' : 'Gizli'} <span className="switch-track"><span/></span></button></div>)}</div></section></div>
    {qr && <div className="modal-backdrop" role="presentation" onClick={() => setQr(null)}><div className="qr-modal" role="dialog" aria-modal="true" aria-label="Bölüm QR kodu" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setQr(null)} aria-label="Kapat"><X size={20}/></button><div className="qr-print-area"><Brand/><h2>{qr.name}</h2><p>Sipariş vermek için QR kodu okutun.</p><div className="qr-image"><QRCodeSVG id="station-qr-svg" value={joinUrl} size={220} marginSize={0} bgColor="#ffffff" fgColor="#204d3b"/></div><p className="qr-link">{joinUrl}</p></div><div className="qr-actions"><button className="secondary-button" onClick={downloadQr}><Download size={17}/> SVG indir</button><button className="primary-button" onClick={() => window.print()}><Printer size={17}/> Yazdır</button></div><p className="tiny-note">QR kodunu şimdi indirin veya yazdırın; güvenlik nedeniyle sonra yeniden gösterilemez.</p></div></div>}
  </div>;
}
export default App;
