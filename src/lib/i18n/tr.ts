import type { MessageKey } from "./ar";

/**
 * Turkish. Deliberately partial — anything missing falls back to Arabic, so
 * the app never shows a raw key. Adding Turkish is a translation pass over
 * this file, not a code change.
 */
const tr: Partial<Record<MessageKey, string>> = {
  "app.name": "Dentec",
  "app.tagline": "Kaynak yönetim sistemi",

  "nav.group.overview": "Genel",
  "nav.group.catalog": "Katalog",
  "nav.group.stock": "Stok",
  "nav.group.sales": "Satış ve Satın Alma",
  "nav.group.finance": "Finans",
  "nav.group.system": "Sistem",

  "nav.dashboard": "Gösterge Paneli",
  "nav.categories": "Kategoriler",
  "nav.products": "Ürünler",
  "nav.spareParts": "Yedek Parçalar",
  "nav.inventory": "Envanter",
  "nav.moves": "Stok Hareketleri",
  "nav.warehouses": "Depolar",
  "nav.customers": "Müşteriler",
  "nav.suppliers": "Tedarikçiler",
  "nav.invoices": "Satış Faturaları",
  "nav.purchases": "Satın Alma Siparişleri",
  "nav.service": "Servis",
  "nav.accounting": "Muhasebe",
  "nav.reports": "Raporlar",
  "nav.settings": "Ayarlar",
  "nav.users": "Kullanıcılar",

  "action.new": "Yeni",
  "action.add": "Ekle",
  "action.edit": "Düzenle",
  "action.delete": "Sil",
  "action.save": "Kaydet",
  "action.cancel": "İptal",
  "action.close": "Kapat",
  "action.confirm": "Onayla",
  "action.search": "Ara",
  "action.print": "Yazdır",
  "action.back": "Geri",
  "action.view": "Görüntüle",

  "label.name": "Ad",
  "label.sku": "Stok Kodu",
  "label.category": "Kategori",
  "label.price": "Satış Fiyatı",
  "label.cost": "Maliyet",
  "label.quantity": "Miktar",
  "label.onHand": "Mevcut",
  "label.warehouse": "Depo",
  "label.date": "Tarih",
  "label.status": "Durum",
  "label.total": "Toplam",
  "label.balance": "Bakiye",
  "label.customer": "Müşteri",
  "label.supplier": "Tedarikçi",

  "dash.title": "Gösterge Paneli",
  "dash.salesThisMonth": "Bu Ayki Satışlar",
  "dash.receivables": "Alacaklar",
  "dash.stockValue": "Stok Değeri",
  "dash.lowStockCount": "Kritik Stok",

  "msg.searchPlaceholder": "Ara…",
  "empty.none": "Kayıt yok",
  "empty.noResults": "Eşleşen sonuç yok",
  "viewRole.label": "Görünüm",
  "viewRole.owner": "Sahip ve satış",
  "viewRole.accounting": "Muhasebe",
  "viewRole.service": "Servis",
  "tab.stock": "Stok",
  "tab.moves": "Hareketler",
  "tab.general": "Genel",
  "service.board": "Pano",
  "service.list": "Liste",
};

export default tr;
