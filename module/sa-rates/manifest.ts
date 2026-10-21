// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Aidan Koetaan / Setout (setout.co.za)
import { lazy } from 'react';
import { MapPin } from 'lucide-react';
import type { ModuleManifest } from '../_types';

const SaRatesModule = lazy(() => import('./SaRatesModule'));

/**
 * South African rates and build-ups (Setout rate pack).
 *
 * Loads a `setout.za.ratepack/1` JSON pack and installs it through the
 * existing Costs and Assemblies endpoints: materials, labour and plant as
 * ZAR cost items in region ZA, build-ups as assemblies with profit as the bid
 * factor and small-town / rural uplifts as regional factors. Complements the
 * backend `oe_sa_pack` (standards, CIDB, PPPFA, VAT), which carries no prices.
 *
 * Nav wiring: the id, the route path and the second segment of the nav
 * labelKey are all `sa-rates`. The sidebar resolves a dynamic row's module
 * from `labelKey.split('.')[1]` and its moduleKey from `to.slice(1)`, so the
 * three have to agree or the row never shows. The row lands in the static
 * `grp_cost_data` group next to Costs and Assemblies.
 */
export const manifest: ModuleManifest = {
  id: 'sa-rates',
  name: 'modules.sa_rates.name',
  description: 'modules.sa_rates.description',
  version: '0.2.0',
  icon: MapPin,
  category: 'estimation',
  defaultEnabled: false,
  depends: ['assemblies'],
  routes: [
    {
      path: '/sa-rates',
      title: 'modules.sa_rates.name',
      component: SaRatesModule,
    },
  ],
  navItems: [
    {
      labelKey: 'nav.sa-rates',
      to: '/sa-rates',
      icon: MapPin,
      group: 'grp_cost_data',
      advancedOnly: true,
    },
  ],
  translations: {
    en: {
      'modules.sa_rates.name': "SA Rates & Build-ups",
      'modules.sa_rates.description':
        "South African material, labour and plant prices with build-up rates, installed as ZAR cost items and assemblies and refreshed monthly from the Setout rate pack.",
    },
    de: {
      'modules.sa_rates.name': "Südafrika: Preise & Kalkulationen",
      'modules.sa_rates.description':
        "Südafrikanische Material-, Lohn- und Gerätepreise mit Positionskalkulationen, als ZAR-Kostenpositionen und Bausteine installiert und monatlich aus dem Setout-Preispaket aktualisiert.",
    },
    fr: {
      'modules.sa_rates.name': "Afrique du Sud : prix et sous-détails",
      'modules.sa_rates.description':
        "Prix sud-africains des matériaux, de la main-d'œuvre et du matériel avec sous-détails de prix, installés comme articles de coût et assemblages en ZAR et mis à jour chaque mois depuis le pack de prix Setout.",
    },
    es: {
      'modules.sa_rates.name': "Sudáfrica: precios y descompuestos",
      'modules.sa_rates.description':
        "Precios sudafricanos de materiales, mano de obra y maquinaria con precios descompuestos, instalados como partidas de coste y ensamblajes en ZAR y actualizados cada mes desde el paquete de precios de Setout.",
    },
    'es-MX': {
      'modules.sa_rates.name': "Sudáfrica: precios y análisis de precios unitarios",
      'modules.sa_rates.description':
        "Precios sudafricanos de materiales, mano de obra y maquinaria con análisis de precios unitarios, instalados como conceptos de costo y ensambles en ZAR y actualizados cada mes desde el paquete de precios de Setout.",
    },
    'es-CL': {
      'modules.sa_rates.name': "Sudáfrica: precios y análisis de precios unitarios",
      'modules.sa_rates.description':
        "Precios sudafricanos de materiales, mano de obra y maquinaria con análisis de precios unitarios, instalados como partidas de costo y ensambles en ZAR y actualizados cada mes desde el paquete de precios de Setout.",
    },
    'es-CO': {
      'modules.sa_rates.name': "Sudáfrica: precios y APU",
      'modules.sa_rates.description':
        "Precios sudafricanos de materiales, mano de obra y equipo con análisis de precios unitarios, instalados como ítems de costo y ensambles en ZAR y actualizados cada mes desde el paquete de precios de Setout.",
    },
    pt: {
      'modules.sa_rates.name': "África do Sul: preços e composições",
      'modules.sa_rates.description':
        "Preços sul-africanos de materiais, mão de obra e equipamento com composições de preço, instalados como itens de custo e composições em ZAR e atualizados mensalmente a partir do pacote de preços Setout.",
    },
    'pt-BR': {
      'modules.sa_rates.name': "África do Sul: preços e composições",
      'modules.sa_rates.description':
        "Preços sul-africanos de materiais, mão de obra e equipamentos com composições de custo unitário, instalados como insumos e composições em ZAR e atualizados mensalmente a partir do pacote de preços Setout.",
    },
    ru: {
      'modules.sa_rates.name': "ЮАР: цены и калькуляции",
      'modules.sa_rates.description':
        "Цены ЮАР на материалы, труд и технику с калькуляциями расценок, устанавливаются как позиции затрат и сборные расценки в ZAR и ежемесячно обновляются из ценового пакета Setout.",
    },
    zh: {
      'modules.sa_rates.name': "南非价格与综合单价",
      'modules.sa_rates.description':
        "南非材料、人工和机械价格及综合单价分析，作为以兰特（ZAR）计价的成本项和组合单价安装，并每月从 Setout 价格包更新。",
    },
    ar: {
      'modules.sa_rates.name': "جنوب أفريقيا: الأسعار وتحليل الأسعار",
      'modules.sa_rates.description':
        "أسعار المواد والعمالة والمعدات في جنوب أفريقيا مع تحليل أسعار البنود، تُثبَّت كبنود تكلفة وبنود مركبة بالراند (ZAR) وتُحدَّث شهريًا من حزمة أسعار Setout.",
    },
    hi: {
      'modules.sa_rates.name': "दक्षिण अफ़्रीका: दरें और दर विश्लेषण",
      'modules.sa_rates.description':
        "दक्षिण अफ़्रीकी सामग्री, श्रम और उपकरण की कीमतें दर विश्लेषण के साथ, ZAR लागत मदों और संयुक्त दरों के रूप में स्थापित, और Setout दर पैक से हर महीने अद्यतन।",
    },
    tr: {
      'modules.sa_rates.name': "Güney Afrika: fiyatlar ve birim fiyat analizleri",
      'modules.sa_rates.description':
        "Güney Afrika malzeme, işçilik ve ekipman fiyatları ile birim fiyat analizleri; ZAR maliyet kalemleri ve imalat analizleri olarak kurulur ve Setout fiyat paketinden her ay güncellenir.",
    },
    it: {
      'modules.sa_rates.name': "Sudafrica: prezzi e analisi prezzi",
      'modules.sa_rates.description':
        "Prezzi sudafricani di materiali, manodopera e noli con analisi dei prezzi, installati come voci di costo e assemblaggi in ZAR e aggiornati ogni mese dal pacchetto prezzi Setout.",
    },
    nl: {
      'modules.sa_rates.name': "Zuid-Afrika: prijzen en calculaties",
      'modules.sa_rates.description':
        "Zuid-Afrikaanse prijzen voor materiaal, arbeid en materieel met eenheidsprijscalculaties, geïnstalleerd als kostenposten en samenstellingen in ZAR en maandelijks bijgewerkt vanuit het Setout-prijspakket.",
    },
    pl: {
      'modules.sa_rates.name': "RPA: ceny i kalkulacje",
      'modules.sa_rates.description':
        "Ceny materiałów, robocizny i sprzętu z RPA wraz z kalkulacjami cen jednostkowych, instalowane jako pozycje kosztowe i zestawy w ZAR i aktualizowane co miesiąc z pakietu cen Setout.",
    },
    cs: {
      'modules.sa_rates.name': "Jihoafrická republika: ceny a kalkulace",
      'modules.sa_rates.description':
        "Jihoafrické ceny materiálu, práce a mechanizace s kalkulacemi jednotkových cen, instalované jako nákladové položky a sestavy v ZAR a měsíčně aktualizované z cenového balíčku Setout.",
    },
    ja: {
      'modules.sa_rates.name': "南アフリカ：単価と複合単価",
      'modules.sa_rates.description':
        "南アフリカの材料・労務・機械の価格と複合単価の内訳。ZAR建ての費目と複合単価として取り込み、Setout 価格パックから毎月更新します。",
    },
    ko: {
      'modules.sa_rates.name': "남아프리카공화국: 단가 및 일위대가",
      'modules.sa_rates.description':
        "남아프리카공화국 자재·노무·장비 가격과 일위대가를 ZAR 원가 항목과 조합 단가로 설치하고 Setout 가격 팩으로 매월 갱신합니다.",
    },
    sv: {
      'modules.sa_rates.name': "Sydafrika: priser och kalkyler",
      'modules.sa_rates.description':
        "Sydafrikanska priser på material, arbete och maskiner med á-priskalkyler, installerade som kostnadsposter och sammansättningar i ZAR och uppdaterade varje månad från Setouts prispaket.",
    },
    no: {
      'modules.sa_rates.name': "Sør-Afrika: priser og kalkyler",
      'modules.sa_rates.description':
        "Sørafrikanske priser på materialer, arbeid og maskiner med enhetspriskalkyler, installert som kostnadsposter og sammenstillinger i ZAR og oppdatert hver måned fra Setouts prispakke.",
    },
    da: {
      'modules.sa_rates.name': "Sydafrika: priser og kalkulationer",
      'modules.sa_rates.description':
        "Sydafrikanske priser på materialer, arbejdsløn og materiel med enhedsprisberegninger, installeret som omkostningsposter og sammensætninger i ZAR og opdateret hver måned fra Setouts prispakke.",
    },
    fi: {
      'modules.sa_rates.name': "Etelä-Afrikka: hinnat ja laskelmat",
      'modules.sa_rates.description':
        "Etelä-Afrikan materiaali-, työ- ja konehinnat yksikköhintalaskelmineen, asennettuina ZAR-kustannusnimikkeiksi ja kokoonpanoiksi ja päivitettyinä kuukausittain Setoutin hintapaketista.",
    },
    bg: {
      'modules.sa_rates.name': "Южна Африка: цени и анализи",
      'modules.sa_rates.description':
        "Южноафрикански цени на материали, труд и механизация с анализи на единични цени, инсталирани като разходни позиции и сглобки в ZAR и обновявани всеки месец от ценовия пакет на Setout.",
    },
    hr: {
      'modules.sa_rates.name': "Južna Afrika: cijene i analize",
      'modules.sa_rates.description':
        "Južnoafričke cijene materijala, rada i mehanizacije s analizama jediničnih cijena, instalirane kao troškovne stavke i sklopovi u ZAR-u i mjesečno ažurirane iz Setout paketa cijena.",
    },
    id: {
      'modules.sa_rates.name': "Afrika Selatan: harga dan analisa harga satuan",
      'modules.sa_rates.description':
        "Harga material, upah, dan alat Afrika Selatan dengan analisa harga satuan, dipasang sebagai item biaya dan rakitan dalam ZAR dan diperbarui setiap bulan dari paket harga Setout.",
    },
    ro: {
      'modules.sa_rates.name': "Africa de Sud: prețuri și analize de preț",
      'modules.sa_rates.description':
        "Prețuri sud-africane pentru materiale, manoperă și utilaje cu analize de preț unitar, instalate ca articole de cost și ansambluri în ZAR și actualizate lunar din pachetul de prețuri Setout.",
    },
    th: {
      'modules.sa_rates.name': "แอฟริกาใต้: ราคาและการวิเคราะห์ราคาต่อหน่วย",
      'modules.sa_rates.description':
        "ราคาวัสดุ ค่าแรง และเครื่องจักรของแอฟริกาใต้ พร้อมการวิเคราะห์ราคาต่อหน่วย ติดตั้งเป็นรายการต้นทุนและชุดรายการในสกุล ZAR และอัปเดตทุกเดือนจากแพ็กราคา Setout",
    },
    vi: {
      'modules.sa_rates.name': "Nam Phi: đơn giá và phân tích đơn giá",
      'modules.sa_rates.description':
        "Giá vật liệu, nhân công và máy thi công của Nam Phi kèm phân tích đơn giá, được cài đặt thành hạng mục chi phí và tổ hợp bằng ZAR và cập nhật hằng tháng từ gói giá Setout.",
    },
    ky: {
      'modules.sa_rates.name': "Түштүк Африка: баалар жана эсептөөлөр",
      'modules.sa_rates.description':
        "Түштүк Африкадагы материал, эмгек жана техника баалары бирдик баа эсептөөлөрү менен, ZAR чыгым позициялары жана жыйындылары катары орнотулуп, Setout баа пакетинен ай сайын жаңыланат.",
    },
    et: {
      'modules.sa_rates.name': "Lõuna-Aafrika: hinnad ja kalkulatsioonid",
      'modules.sa_rates.description':
        "Lõuna-Aafrika materjali-, töö- ja masinahinnad koos ühikuhinna kalkulatsioonidega, paigaldatud ZAR-kulukirjete ja koostetena ning uuendatud iga kuu Setouti hinnapaketist.",
    },
    bn: {
      'modules.sa_rates.name': "দক্ষিণ আফ্রিকা: দর ও দর বিশ্লেষণ",
      'modules.sa_rates.description':
        "দক্ষিণ আফ্রিকার উপকরণ, শ্রম ও যন্ত্রপাতির দাম দর বিশ্লেষণসহ, ZAR খরচের আইটেম ও সমন্বিত দর হিসেবে ইনস্টল করা এবং Setout দর প্যাক থেকে প্রতি মাসে হালনাগাদ করা।",
    },
    kk: {
      'modules.sa_rates.name': "Оңтүстік Африка: бағалар мен есептеулер",
      'modules.sa_rates.description':
        "Оңтүстік Африкадағы материал, еңбек және техника бағалары бірлік баға есептеулерімен бірге ZAR шығын позициялары мен жиынтықтары ретінде орнатылып, Setout баға пакетінен ай сайын жаңартылады.",
    },
    fil: {
      'modules.sa_rates.name': "Timog Aprika: mga presyo at pagsusuri ng presyo",
      'modules.sa_rates.description':
        "Mga presyo ng materyales, paggawa at kagamitan sa Timog Aprika na may pagsusuri ng unit rate, naka-install bilang mga cost item at assembly sa ZAR at ina-update buwan-buwan mula sa Setout rate pack.",
    },
    ur: {
      'modules.sa_rates.name': "جنوبی افریقہ: نرخ اور نرخ تجزیہ",
      'modules.sa_rates.description':
        "جنوبی افریقہ کے مواد، مزدوری اور مشینری کے نرخ مع نرخ تجزیہ، ZAR لاگت آئٹمز اور مرکب نرخوں کے طور پر نصب اور Setout ریٹ پیک سے ہر ماہ تازہ کیے جاتے ہیں۔",
    },
    fa: {
      'modules.sa_rates.name': "آفریقای جنوبی: قیمت‌ها و تجزیه بها",
      'modules.sa_rates.description':
        "قیمت مصالح، دستمزد و ماشین‌آلات آفریقای جنوبی همراه با تجزیه بهای واحد، نصب‌شده به‌صورت اقلام هزینه و فهرست‌های ترکیبی به ZAR و به‌روزرسانی ماهانه از بسته قیمت Setout.",
    },
    he: {
      'modules.sa_rates.name': "דרום אפריקה: מחירים וניתוחי מחיר",
      'modules.sa_rates.description':
        "מחירי חומרים, עבודה וציוד בדרום אפריקה עם ניתוחי מחיר ליחידה, מותקנים כפריטי עלות ומכלולים ב-ZAR ומתעדכנים מדי חודש מחבילת המחירים של Setout.",
    },
    el: {
      'modules.sa_rates.name': "Νότια Αφρική: τιμές και αναλύσεις τιμών",
      'modules.sa_rates.description':
        "Τιμές υλικών, εργασίας και μηχανημάτων της Νότιας Αφρικής με αναλύσεις τιμών μονάδας, εγκατεστημένες ως είδη κόστους και συναρμολογήσεις σε ZAR και ενημερωμένες κάθε μήνα από το πακέτο τιμών της Setout.",
    },
    hu: {
      'modules.sa_rates.name': "Dél-Afrika: árak és kalkulációk",
      'modules.sa_rates.description':
        "Dél-afrikai anyag-, munkadíj- és gépárak egységár-kalkulációkkal, ZAR költségtételekként és összetett tételekként telepítve, és havonta frissítve a Setout árcsomagjából.",
    },
    uk: {
      'modules.sa_rates.name': "ПАР: ціни та калькуляції",
      'modules.sa_rates.description':
        "Ціни ПАР на матеріали, працю та техніку з калькуляціями розцінок, встановлюються як позиції витрат і збірні розцінки в ZAR та щомісяця оновлюються з цінового пакета Setout.",
    },
    uz: {
      'modules.sa_rates.name': "Janubiy Afrika: narxlar va hisob-kitoblar",
      'modules.sa_rates.description':
        "Janubiy Afrika material, mehnat va texnika narxlari birlik narxi hisob-kitoblari bilan, ZAR xarajat moddalari va yig‘ma narxlar sifatida o‘rnatiladi hamda Setout narx paketidan har oy yangilanadi.",
    },
  },
};
