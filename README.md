# Demleme ☕

Eski çay ocağı diafonunun dijital karşılığı. **Tek işletme için** hazırlanmış, telefonlara yüklenebilen bir PWA.

- **Kullanıcı:** Bölümünün QR kodunu okutur, istediği kadar farklı içecek ve adet seçer, sipariş verir, anlık durumunu izler.
- **Çay ocağı:** Yeni siparişleri ve hangi bölümden geldiklerini görür. **Alındı → Hazırlanıyor → Yolda → Teslim edildi** durumlarını yönetir.
- **Ses:** Çaycı panelinde kullanıcı etkileşimiyle açılan, yeni siparişlerde çalan bir uyarı sesi vardır. Panel ve tarayıcı açık olmalıdır. Kapalı uygulamaya Web Push **henüz yoktur**.
- **Yönetim:** Yeni bölümler ve QR kodları oluşturur, içecek menüsünü yönetir.
- **PWA:** Uygulama iOS/Android/masaüstüne kurulabilir. İnternet olmadan canlı sipariş gönderilemez.

## Tasarım ve teknoloji

React, TypeScript, Vite, Supabase Auth/Postgres/Realtime, GitHub Pages, vite-plugin-pwa. Harici font ya da zorunlu görsel servisi yoktur.

## Çalıştırma (demo modu)

```bash
npm install
npm run dev
```

`http://localhost:5173` adresini açın. Supabase ayarlanmadıysa üstte **Demo modu** uyarısı bulunur. “Muhasebe olarak demoyu dene” ile sipariş verebilir, “Çay ocağı girişi” ile yönetim panelini açabilirsiniz. **Demo verileri sadece aynı tarayıcının localStorage alanında saklanır; başka cihazlara aktarılmaz ve gerçek sipariş için kullanılmamalıdır.**

## Gerçek zamanlı kullanıma geçiş (Supabase)

1. Supabase'de bir proje oluşturun. Authentication bölümünden **Email** ve **Anonymous Sign-Ins** seçeneklerini etkinleştirin.
2. SQL Editor'de [`supabase/schema.sql`](supabase/schema.sql) dosyasını **yeni/boş projede bir kez** çalıştırın. Bu işlem tabloları, politikaları, sunucu fonksiyonlarını, başlangıç menüsünü ve Realtime yayınını kurar.
3. Supabase > Authentication > Users bölümünden bir çay ocağı çalışanı için e-posta/şifre hesabı oluşturun. SQL Editor'de aşağıdaki sorguyu e-posta adresini değiştirerek çalıştırın:

   ```sql
   insert into public.profiles (id, role)
   select id, 'staff' from auth.users where email = 'CALISAN@ISLETME.COM'
   on conflict (id) do update set role = 'staff', station_id = null;
   ```

4. `.env.example` dosyasını `.env` olarak kopyalayın ve Supabase **Project URL** ile **anon / publishable key** bilgilerini girin. **`service_role` anahtarını hiçbir zaman tarayıcıya veya GitHub deposuna koymayın.**
5. `npm run dev` ile yerelde açın. `?panel=ocak` adresinden personel hesabıyla oturum açın, “Yönetim” kısmından bölüm oluşturup QR kodunu yazdırın. Kullanıcılar kodu okutarak sipariş verebilir.

## GitHub Pages (PWA yayını)

1. GitHub repository > **Settings > Pages** > Source: **GitHub Actions** olarak seçin.
2. Repository > **Settings > Secrets and variables > Actions > Variables** bölümüne `VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` ekleyin. (İkisi de istemcide kullanılan **public** değerlerdir.)
3. `main` dalına gönderimle `.github/workflows/deploy.yml` otomatik derleyip yayınlar.
4. Yayın adresi: `https://ilyasilmek.github.io/demleme-gpt/` (Pages etkinleştirildikten ve dağıtım başarılı olduktan sonra).
5. Android Chrome'da “Ana ekrana ekle/uygulamayı yükle”, iPhone Safari'de Paylaş > Ana Ekrana Ekle ile kurun.

**Önemli:** Henüz Supabase URL/anahtar girilmemişse dağıtılan site yalnızca **Demo modu** çalıştırır. GitHub Pages sadece statik dosya sunar. Farklı cihazlar arasında gerçek sipariş akışı için Supabase gereklidir.

## QR kodunun güvenliği

Her bölüm için uzun, rastgele bir erişim tokenı oluşturulur. Veritabanında yalnızca SHA-256 özeti tutulur. Kullanıcı QR kodunu okuttuğunda Supabase Anonymous Auth üzerinden kendi oturumu açılır; sipariş verirken bölüm bilgisi kullanıcının gönderdiği isme göre değil, sunucudaki doğrulanmış profiline göre belirlenir. QR bağlantısına erişen herkes o bölüm adına sipariş verebilir: kodları yalnızca ilgili çalışanlara dağıtın. QR kodu yenilenince eski bağlantı çalışmaz. QR kodu oluşturulduğunda indirin/yazdırın; sonradan aynı token tekrar görüntülenmez.

## Bilinen ilk sürüm sınırları

- Tek işletme ve tek merkezi çay ocağı.
- QR kodu bölüm/ofisi tanımlar, aynı bölümdeki **hangi kişinin** sipariş verdiğini ayrı ayrı tanımlamaz. İstenirse sonraki sürüme kullanıcı adı eklenebilir.
- Sesli bildirim için panelin açık olması ve önce “Bildirim sesini aç” düğmesine basılması gerekir. Tarayıcılar arka planda sesi kısıtlayabilir.
- Ürünler fiyatlandırılmaz; ödeme sistemi yoktur.
- Çevrimdışıyken sipariş kuyruğa alınmaz; bağlantı olmalıdır.
- Servis anahtarları, kurulum şifreleri veya SQL yetkileri front-end'e konmaz.

## Komutlar

```bash
npm run dev       # yerel geliştirme
npm run build     # TypeScript kontrolü + PWA dağıtımı
npm run preview   # üretim çıktısını yerelde görüntüle
```
