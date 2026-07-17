import { getById, getRepairs, getOnce, addRecord, editRecord, normalizeText, formatDateTime, toArray } from "./database.js";
import { auth } from "./firebase.js";
import { DEFAULT_SETTINGS, getGeneralSettings, getMessageTemplate, buildMessage, replacePlaceholders } from "./settings-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

const THEME_KEY = "waasugePublicTheme";
const LANG_KEY = "waasugePublicLanguage";
const RATING_CACHE_KEY = "waasugePublicRatings";
const DEFAULT_THEME = "dark";
const DEFAULT_LANG = "en";

function getShopName() {
  return getGeneralSettings().shopName || DEFAULT_SETTINGS.general.shopName;
}

function getShopPhone() {
  return getGeneralSettings().phone || DEFAULT_SETTINGS.general.phone;
}

function getShopWhatsapp() {
  return getGeneralSettings().whatsapp || DEFAULT_SETTINGS.general.whatsapp;
}

function getShopEmail() {
  return "waasugeelectronics@gmail.com";
}

const STATUS_META = {
  "device received": { labelKey: "status.deviceReceived", label: "Device Received", className: "status-pending", icon: "bi-box-seam", progress: 0 },
  "inspection started": { labelKey: "status.inspectionStarted", label: "Inspection Started", className: "status-processing", icon: "bi-search", progress: 12 },
  "diagnosis completed": { labelKey: "status.diagnosisCompleted", label: "Diagnosis Completed", className: "status-processing", icon: "bi-clipboard2-pulse", progress: 24 },
  "waiting for approval": { labelKey: "status.waitingApproval", label: "Waiting for Approval", className: "status-waiting-for-parts", icon: "bi-person-check", progress: 36 },
  "waiting for parts": { labelKey: "status.waitingParts", label: "Waiting for Parts", className: "status-waiting-for-parts", icon: "bi-box-seam", progress: 48 },
  "repair in progress": { labelKey: "status.repairInProgress", label: "Repair in Progress", className: "status-in-repair", icon: "bi-tools", progress: 64 },
  "quality testing": { labelKey: "status.qualityTesting", label: "Quality Testing", className: "status-processing", icon: "bi-check2-circle", progress: 78 },
  "ready for pickup": { labelKey: "status.readyForPickup", label: "Ready for Pickup", className: "status-completed", icon: "bi-bag-check", progress: 90 },
  delivered: { labelKey: "status.delivered", label: "Delivered", className: "status-delivered", icon: "bi-truck", progress: 100 }
};

const STATUS_ALIASES = {
  pending: "device received",
  processing: "inspection started",
  "in repair": "repair in progress",
  "waiting for parts": "waiting for parts",
  completed: "quality testing",
  delivered: "delivered"
};

const STATUS_SOUND_MAP = {
  "device received": "assets/sound/device-received.mp3",
  "inspection started": "assets/sound/inspection-started.mp3",
  "diagnosis completed": "assets/sound/diagnosis-completed.mp3",
  "waiting for approval": "assets/sound/waiting-for-approval.mp3",
  "waiting for parts": "assets/sound/waiting-for-parts.mp3",
  "repair in progress": "assets/sound/repair-in-progress.mp3",
  "quality testing": "assets/sound/quality-testing.mp3",
  "ready for pickup": "assets/sound/ready-for-pickup.mp3",
  "delivered": "assets/sound/delivered.mp3"
};

const I18N = {
  en: {
    "brand.main": "Waasuge Electronics",
    "brand.sub": "Shop & Mobile Repairing",
    "nav.home": "Home",
    "nav.about": "About Us",
    "nav.services": "Services",
    "nav.tracking": "Tracking",
    "menu.title": "Menu",
    "menu.subtitle": "Quick links and tools",
    "actions.track": "Track",
    "actions.login": "Login",
    "actions.dashboard": "Dashboard",
    "actions.darkMode": "Dark mode",
    
    "status.deviceReceived": "Device Received",
    "status.inspectionStarted": "Inspection Started",
    "status.diagnosisCompleted": "Diagnosis Completed",
    "status.waitingApproval": "Waiting for Approval",
    "status.waitingParts": "Waiting for Parts",
    "status.repairInProgress": "Repair in Progress",
    "status.qualityTesting": "Quality Testing",
    "status.readyForPickup": "Ready for Pickup",
    "status.delivered": "Delivered",
    "status.pending": "Pending...",
    "record.repairTracking": "Repair Tracking",
    "record.currentRepairStatus": "Current Repair Status",
    "record.progressLabel": "Progress",
    "record.received": "Received",
    "record.deliveredLabel": "Delivered",
    "record.repairDetails": "Repair Details",
    "record.repairTimeline": "Repair Timeline",
    "record.pending": "Pending...",
    "hero.badge": "Trusted electronics and repair shop",
    "hero.title": "Premium electronics sales, fast repairs, and live tracking in one place.",
    "hero.lead": "We repair mobile phones and electronics, sell quality accessories, and let customers track repair progress instantly with a repair ID.",
    "hero.trackNow": "Track your repair",
    "hero.whatsapp": "WhatsApp us",
    "hero.badge1": "Mobile repairing",
    "hero.badge2": "Electronics sales",
    "hero.badge3": "Live status",
    "metrics.devices": "Phones & devices",
    "metrics.devicesText": "Repairs, accessories, and electronics support.",
    "metrics.speed": "Fast service",
    "metrics.speedValue": "Same-day",
    "metrics.speedText": "Quick diagnosis, clear updates, and smooth pickup.",
    "metrics.location": "Service area",
    "metrics.locationText": "Visit the shop or contact us on WhatsApp.",
    "tracking.quickTitle": "Quick tracking",
    "tracking.quickSubtitle": "Enter repair ID to view the full repair file",
    "tracking.label": "Enter repair ID",
    "tracking.title": "Repair tracking",
    "tracking.subtitle": "Check the full repair data for a customer, device, problem, parts, status, payment, and timeline.",
    "tracking.emptyTitle": "No result yet",
    "tracking.emptyText": "Enter a repair ID to see the full repair record.",
    "about.cardTitle": "Who we are",
    "about.cardSubtitle": "A trusted shop for mobile and electricity solutions.",
    "about.cardText": "Waasuge Electronics & Mobile Repairing helps customers buy quality devices, repair phones, and solve common electronics problems with clear updates and professional service.",
    "about.missionTitle": "Mission",
    "about.missionText": "Deliver fast, honest, and affordable repair service.",
    "about.visionTitle": "Vision",
    "about.visionText": "Become a clean, modern service center customers trust.",
    "about.goalTitle": "What we do",
    "about.goalText": "We handle diagnosis, repair, parts replacement, accessory sales, and after-service support for mobile and electronic devices.",
    "about.promiseTitle": "Why customers choose us",
    "about.promiseText": "Professional tracking, clear pricing, friendly support, and a neat premium look that matches your brand.",
    "about.highlightsTitle": "Highlights",
    "about.highlightsText": "Every visit feels clean, fast, and easy to use on mobile.",
    "about.rotator1Title": "Clean service",
    "about.rotator1Text": "Modern repairs, clear updates, and a tidy shop experience.",
    "about.rotator1Badge1": "Fast updates",
    "about.rotator1Badge2": "Premium look",
    "about.rotator2Title": "Tracking made easy",
    "about.rotator2Text": "A single repair ID shows live status, progress, and timelines.",
    "about.rotator2Badge1": "Live status",
    "about.rotator2Badge2": "Repair ID",
    "about.rotator3Title": "Friendly support",
    "about.rotator3Text": "Helpful staff, fair pricing, and service customers can trust.",
    "about.rotator3Badge1": "Support",
    "about.rotator3Badge2": "Fair price",
    "services.title": "Services and products",
    "services.subtitle": "We repair devices and sell useful electronics items for home, shop, and mobile use.",
    "services.mobileTitle": "Mobile phones",
    "services.mobileText": "Sales, setup, software help, and repair for smartphones and small phones.",
    "services.chargingTitle": "Fast charging accessories",
    "services.chargingText": "Super-fast chargers, adapters, USB cables, and charging ports.",
    "services.powerTitle": "Power banks & batteries",
    "services.powerText": "Power banks, batteries, battery replacement, and charging support.",
    "services.audioTitle": "Earphones and headsets",
    "services.audioText": "Earphones, headphones, earbuds, and audio accessories.",
    "services.electricTitle": "Electricity items",
    "services.electricText": "LED bulbs, switches, sockets, plugs, extension cords, and wiring accessories.",
    "services.repairTitle": "Repair services",
    "services.repairText": "Screen replacement, charging issues, signal issues, battery faults, and more.",
    "services.networkTitle": "Signal and network",
    "services.networkText": "Zero signal, network issues, SIM problems, and device troubleshooting.",
    "services.smartTitle": "Smart devices",
    "services.smartText": "Smart watches, speakers, chargers, and small smart accessories.",
    "services.partsTitle": "Parts & service",
    "services.partsText": "Original and compatible parts, service bundles, and repair updates.",
    "howto.title": "How to use the tracking",
    "howto.subtitle": "Type your repair ID, press track, and the page will scroll to the result automatically.",
    "howto.step1Title": "Enter your repair ID",
    "howto.step1Text": "Use the repair number you received from the shop.",
    "howto.step2Title": "Press the track button",
    "howto.step2Text": "A loading spinner appears while the system looks up your file.",
    "howto.step3Title": "Read the full repair file",
    "howto.step3Text": "See status, price, progress, notes, and rating options.",
    "contact.title": getShopName(),
    "contact.subtitle": "Service center and repair desk",
    "footer.text": "Contact us for repairs, device tracking, accessories, and fast support.",
    "footer.linksTitle": "Quick Links",
    "footer.supportTitle": "Support",
    "footer.supportText": "Visit our shop, call us, or send a WhatsApp message for quick help.",
    "placeholders.track": "R-123456789",
    "placeholders.comment": "Add a short comment",
    "rating.title": "Visitor rating",
    "rating.subtitle": "Rate this service and leave a short note.",
    "rating.submit": "Send rating",
    "rating.helper": "Your rating will be saved for this repair record.",
    "rating.none": "No rating yet",
    "rating.saved": "Your rating has been saved.",
    "rating.select": "Choose a star rating first.",
    "rating.comment": "Thank you for your feedback.",
    "status.pending": "Pending...",
    "status.processing": "Processing",
    "status.inRepair": "In Repair",
    "status.waiting": "Waiting For Parts",
    "status.completed": "Completed",
    "status.delivered": "Delivered",
    "status.deviceReceived": "Device Received",
    "status.inspectionStarted": "Inspection Started",
    "status.diagnosisCompleted": "Diagnosis Completed",
    "status.waitingApproval": "Waiting for Approval",
    "status.waitingParts": "Waiting for Parts",
    "status.repairInProgress": "Repair in Progress",
    "status.qualityTesting": "Quality Testing",
    "status.readyForPickup": "Ready for Pickup",
    "record.repairTracking": "Repair tracking",
    "record.currentRepairStatus": "Current repair status",
    "record.progressLabel": "Progress",
    "record.received": "Received",
    "record.deliveredLabel": "Delivered",
    "record.repairDetails": "Repair details",
    "record.repairTimeline": "Repair timeline",
    "record.pending": "Pending...",
    "record.repair": "Repair tracking",
    "record.customer": "Customer",
    "record.phone": "Phone",
    "record.device": "Device",
    "record.problem": "Problem",
    "record.parts": "Parts / Service",
    "record.status": "Status",
    "record.paid": "Paid",
    "record.balance": "Balance",
    "record.total": "Total",
    "record.created": "Created",
    "record.updated": "Updated",
    "record.email": "Shop email",
    "record.hours": "Business hours",
    "record.notes": "Repair notes",
    "record.progress": "Progress",
    "record.currentStage": "Current stage",
    "record.timeline": "Status timeline",
    "record.noRating": "No rating yet",
    "record.noNotes": "No notes recorded for this repair.",
    "record.noTimeline": "No timeline details yet.",
    "record.searching": "Searching repair record...",
    "record.notFound": "No repair record found for",
    "record.enter": "Please enter a repair ID first.",
    "record.found": "Repair record found for",
    "record.ratingAverage": "Average rating",
    "record.visitNote": "Customer tracking summary",
    "record.serviceCenter": "Service center and repair desk"
  },
  so: {
    "brand.main": "Waasuge Electronics",
    "brand.sub": "Dukaan & Dayactir Mobile",
    "nav.home": "Guriga",
    "nav.about": "Nagu Saabsan",
    "nav.services": "Adeegyada",
    "nav.tracking": "Raadraac",
    "menu.title": "Menu",
    "menu.subtitle": "Xiriirro iyo qalab degdeg ah",
    "actions.track": "Raadi",
    "actions.login": "Gal",
    "actions.dashboard": "Guddi",
    "actions.darkMode": "Qaabka madow",
    "hero.badge": "Dukaan lagu kalsoon yahay oo elektaroonik iyo dayactir ah",
    "hero.title": "Iibka electronics-ka, dayactir degdeg ah, iyo tracking toos ah hal meel.",
    "hero.lead": "Waxaan dayactirnaa mobaylka iyo electronics-ka, waxaan iibinnaa qalab tayo leh, sidoo kalena waxaan kuu oggolaaneynaa inaad si degdeg ah ula socoto repair ID-ga.",
    "hero.trackNow": "Raadi dayactirkaaga",
    "hero.whatsapp": "WhatsApp noo soo dir",
    "hero.badge1": "Dayactir mobile",
    "hero.badge2": "Iib electronics",
    "hero.badge3": "Xaalad toos ah",
    "metrics.devices": "Telefoonno & qalab",
    "metrics.devicesText": "Dayactir, accessories, iyo taageero electronics.",
    "metrics.speed": "Adeeg degdeg ah",
    "metrics.speedValue": "Isla maalintaas",
    "metrics.speedText": "Baadhitaan degdeg ah, warbixin cad, iyo soo qaadis fudud.",
    "metrics.location": "Aagga adeegga",
    "metrics.locationText": "Dukaan soo booqo ama WhatsApp nala soo xiriir.",
    "tracking.quickTitle": "Raadraac degdeg ah",
    "tracking.quickSubtitle": "Geli repair ID-ga si aad u aragto faylka oo dhan",
    "tracking.label": "Geli repair ID",
    "tracking.title": "Repair tracking",
    "tracking.subtitle": "Hubi xogta oo dhan: customer, device, problem, parts, status, payment, iyo timeline.",
    "tracking.emptyTitle": "Natiijo ma jirto",
    "tracking.emptyText": "Geli repair ID si aad u aragto repair-ka oo dhan.",
    "about.cardTitle": "Annaga waanu nahay",
    "about.cardSubtitle": "Dukaan lagu kalsoon yahay oo mobile iyo koronto ah.",
    "about.cardText": "Waasuge Electronics & Mobile Repairing waxay ka caawisaa macaamiisha inay iibsadaan qalab tayo leh, dayactiraan teleefoonada, isla markaana xalliyaan dhibaatooyinka electronics-ka si xirfad leh oo cad.",
    "about.missionTitle": "Hadaf",
    "about.missionText": "In la bixiyo adeeg degdeg ah, daacad ah, oo qiimo macquul ah.",
    "about.visionTitle": "Aragti",
    "about.visionText": "In aan noqono xarun casri ah oo macaamiishu ku kalsoonaadaan.",
    "about.goalTitle": "Waxaan qabannaa",
    "about.goalText": "Waxaan sameynaa diagnosis, dayactir, beddelka parts-ka, iibka accessories, iyo taageero kadib adeegga.",
    "about.promiseTitle": "Maxaa naloo doortaa",
    "about.promiseText": "Tracking xirfad leh, qiime cad, taageero saaxiibtinimo, iyo muuqaal premium ah.",
    "about.highlightsTitle": "Qodobo muhiim ah",
    "about.highlightsText": "Booqasho kasta waxay noqotaa nadiif, degdeg, oo mobile-ku fudud yahay.",
    "services.title": "Adeegyada iyo alaabta",
    "services.subtitle": "Waxaan dayactirnaa qalabka, waxaan iibinnaa electronics waxtar leh oo guriga, dukaan, iyo mobile-ka loogu isticmaalo.",
    "services.mobileTitle": "Telefoonno",
    "services.mobileText": "Iib, setup, software help, iyo dayactir smartphones iyo teleefoonno yaryar.",
    "services.chargingTitle": "Qalabka fast charging",
    "services.chargingText": "Charger super-fast, adapters, USB cables, iyo charging ports.",
    "services.powerTitle": "Power banks & baytariyo",
    "services.powerText": "Power banks, batteries, beddel baytari, iyo taageero charging.",
    "services.audioTitle": "Earphones iyo headset",
    "services.audioText": "Earphones, headphones, earbuds, iyo qalab maqal.",
    "services.electricTitle": "Alaabta korontada",
    "services.electricText": "LED bulbs, switches, sockets, plugs, extension cords, iyo qalabka wiring.",
    "services.repairTitle": "Adeegga dayactirka",
    "services.repairText": "Beddel screen, charging problems, signal problems, battery faults, iyo in ka badan.",
    "services.networkTitle": "Signal iyo network",
    "services.networkText": "Zero signal, network issues, SIM problems, iyo cilad-baaris qalab.",
    "services.smartTitle": "Qalabka smart-ka",
    "services.smartText": "Smart watches, speakers, chargers, iyo accessories smart ah.",
    "services.partsTitle": "Parts & adeeg",
    "services.partsText": "Parts original iyo compatible, bundles adeeg, iyo warbixin dayactir.",
    "howto.title": "Sida tracking loo isticmaalo",
    "howto.subtitle": "Qor repair ID-ga, taabo raadi, kadibna boggu si toos ah ayuu u soconayaa natiijada.",
    "howto.step1Title": "Geli repair ID-ga",
    "howto.step1Text": "Isticmaal lambarka repair-ka aad ka heshay dukaanka.",
    "howto.step2Title": "Taabo button-ka raadi",
    "howto.step2Text": "Spinner loading ayaa muuqanaya inta nidaamku raadinayo.",
    "howto.step3Title": "Akhriso faylka repair-ka",
    "howto.step3Text": "Eeg status, qiime, progress, notes, iyo rating.",
    "contact.title": getShopName(),
    "contact.subtitle": "Service center iyo repair desk",
    "footer.text": "Nala soo xiriir si aad u hesho dayactir, tracking, accessories, iyo taageero degdeg ah.",
    "footer.linksTitle": "Xiriirro degdeg ah",
    "footer.supportTitle": "Taageero",
    "footer.supportText": "Dukaan soo booqo, wac, ama WhatsApp soo dir si degdeg ah laguu caawiyo.",
    "placeholders.track": "R-123456789",
    "placeholders.comment": "Ku dar faallo gaaban",
    "rating.title": "Qiimeynta booqdaha",
    "rating.subtitle": "Qiimee adeeggan oo ku dar qoraal kooban.",
    "rating.submit": "Dir qiimeynta",
    "rating.helper": "Qiimeyntaada waxaa lagu kaydin doonaa repair-kan.",
    "rating.none": "Qiimeyn weli ma jirto",
    "rating.saved": "Qiimeyntaada waa la kaydiyay.",
    "rating.select": "Dooro stars-ka ka hor.",
    "rating.comment": "Waad ku mahadsan tahay faallooyinkaaga.",
    "status.pending": "Pending",
    "status.processing": "Processing",
    "status.inRepair": "In Repair",
    "status.waiting": "Waiting For Parts",
    "status.completed": "Completed",
    "status.delivered": "Delivered",
    "record.repair": "Repair tracking",
    "record.customer": "Customer",
    "record.phone": "Phone",
    "record.device": "Device",
    "record.problem": "Problem",
    "record.parts": "Parts / Service",
    "record.status": "Status",
    "record.paid": "Paid",
    "record.balance": "Balance",
    "record.total": "Total",
    "record.created": "Created",
    "record.updated": "Updated",
    "record.email": "Email-ka dukaanka",
    "record.hours": "Saacadaha shaqada",
    "record.notes": "Notes-ka dayactirka",
    "record.progress": "Horumarka",
    "record.currentStage": "Marxaladda hadda",
    "record.timeline": "Status timeline",
    "record.noRating": "Qiimeyn weli ma jirto",
    "record.noNotes": "Notes lama diiwaangelin repair-kan.",
    "record.noTimeline": "Timeline weli lama hayn.",
    "record.searching": "Raadinaya repair record...",
    "record.notFound": "Repair record lama helin",
    "record.enter": "Fadlan marka hore geli repair ID.",
    "record.found": "Repair record waa la helay",
    "record.ratingAverage": "Celceliska qiimeynta",
    "record.visitNote": "Customer tracking summary",
    "record.serviceCenter": "Service center iyo repair desk"
  }
};

let currentLang = getSavedLanguage();
let currentTheme = getSavedTheme();
let currentRepair = null;
let currentRepairId = "";
let currentRating = 0;
let lastRepairCollection = [];
let lastRenderedRepair = null;
let ratingStats = { average: 0, count: 0 };
let authUser = null;
let aboutRotatorIndex = 0;
let aboutRotatorTimer = null;

const ABOUT_ROTATOR_SLIDES = [
  {
    icon: "bi-award",
    titleKey: "about.rotator1Title",
    textKey: "about.rotator1Text",
    badges: ["about.rotator1Badge1", "about.rotator1Badge2"]
  },
  {
    icon: "bi-badge-tm",
    titleKey: "about.rotator2Title",
    textKey: "about.rotator2Text",
    badges: ["about.rotator2Badge1", "about.rotator2Badge2"]
  },
  {
    icon: "bi-people",
    titleKey: "about.rotator3Title",
    textKey: "about.rotator3Text",
    badges: ["about.rotator3Badge1", "about.rotator3Badge2"]
  }
];


function getSavedTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === "light" ? "light" : DEFAULT_THEME;
}

function getSavedLanguage() {
  const saved = localStorage.getItem(LANG_KEY);
  return saved === "so" ? "so" : DEFAULT_LANG;
}

function t(key, fallback = key) {
  if (key === "brand.main") return getShopName();
  if (key === "brand.sub") return "Shop & Mobile Repairing";
  return I18N[currentLang]?.[key] || I18N.en?.[key] || fallback;
}

function refreshTrackingView() {
  const repair = currentRepair || lastRenderedRepair;
  if (!repair) return false;
  try {
    renderRepair(repair, lastRepairCollection, { playStatusSound: false });
    window.requestAnimationFrame(() => observeRevealTargets(document));
    return true;
  } catch (error) {
    console.warn("Could not refresh tracking view:", error);
    return false;
  }
}

function applyTheme(theme) {
  currentTheme = theme === "light" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, currentTheme);
  const isDark = currentTheme === "dark";
  document.body.classList.toggle("dark-mode", isDark);
  document.body.setAttribute("data-bs-theme", isDark ? "dark" : "light");
  document.documentElement.setAttribute("data-bs-theme", isDark ? "dark" : "light");
  document.documentElement.classList.toggle("dark-mode", isDark);
  const iconClass = isDark ? "bi-moon-stars-fill" : "bi-sun-fill";
  [document.getElementById("themeToggleIcon"), document.getElementById("mobileThemeIcon")].forEach((icon) => {
    if (icon) icon.className = `bi ${iconClass}`;
  });
  if (currentRepair) refreshTrackingView();
}

function toggleTheme() {
  applyTheme(currentTheme === "dark" ? "light" : "dark");
}

function applyLanguage(lang) {
  currentLang = lang === "so" ? "so" : "en";
  localStorage.setItem(LANG_KEY, currentLang);
  document.documentElement.lang = currentLang;
  document.body.setAttribute("lang", currentLang);
  const textNodes = document.querySelectorAll("[data-i18n]");
  textNodes.forEach((node) => {
    const key = node.dataset.i18n;
    if (key && node.children.length === 0) node.textContent = t(key, node.textContent);
  });
  const htmlNodes = document.querySelectorAll("[data-i18n-html]");
  htmlNodes.forEach((node) => {
    const key = node.dataset.i18nHtml;
    if (key) node.innerHTML = t(key, node.innerHTML);
  });
  const placeholderNodes = document.querySelectorAll("[data-i18n-placeholder]");
  placeholderNodes.forEach((node) => {
    const key = node.dataset.i18nPlaceholder;
    if (key) node.placeholder = t(key, node.placeholder);
  });
  const langLabel = currentLang === "en" ? "SO" : "EN";
  const labels = [document.getElementById("langToggleLabel"), document.getElementById("mobileLangToggleLabel")];
  labels.forEach((el) => { if (el) el.textContent = langLabel; });
  document.querySelectorAll("[data-auth-label]").forEach((el) => {
    if (authUser) el.textContent = t("actions.dashboard");
    else el.textContent = t("actions.login");
  });
  if (!refreshTrackingView()) renderEmptyState();
  renderAboutRotator(aboutRotatorIndex);
}

function toggleLanguage() {
  applyLanguage(currentLang === "en" ? "so" : "en");
}

function initText() {
  applyLanguage(currentLang);
  applyTheme(currentTheme);
  updatePublicContactLinks();
  const year = document.getElementById("yearNow");
  if (year) year.textContent = new Date().getFullYear();
}

function setAuthButtons() {
  const href = authUser ? "dashboard.html" : "login.html";
  const label = authUser ? t("actions.dashboard") : t("actions.login");
  document.querySelectorAll("[data-auth-label]").forEach((el) => { el.textContent = label; });
  ["accountBtnDesktop", "accountBtnMobile"].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.href = href;
    btn.classList.remove("btn-light", "btn-primary");
    btn.classList.add(authUser ? "btn-primary" : "btn-light");
    const icon = btn.querySelector("i");
    if (icon) icon.className = authUser ? "bi bi-speedometer2" : "bi bi-box-arrow-in-right";
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeQuery(value) {
  return String(value ?? "").trim();
}

function normalizeRepairCollection(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item) => ({ ...(item || {}) })).filter(Boolean);
  }
  if (typeof raw === "object") {
    return Object.entries(raw).map(([id, item]) => ({ id, ...(item || {}) })).filter(Boolean);
  }
  return [];
}

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function currency(value) {
  const n = parseNumber(value);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function pickRepairId(repair) {
  return repair?.repairId || repair?.repairNumber || repair?.trackingId || repair?.id || "";
}

function statusKey(repair) {
  return normalizeText(repair?.status || "pending");
}

function statusMeta(statusValue) {
  const raw = normalizeText(statusValue || "device received");
  const key = STATUS_META[raw] ? raw : (STATUS_META[STATUS_ALIASES[raw]] ? STATUS_ALIASES[raw] : "device received");
  return STATUS_META[key] || STATUS_META["device received"];
}

function splitList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((v) => String(v).trim()).filter(Boolean);
  return String(value ?? "")
    .split(/[\n,•|]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function repairBlob(repair) {
  return normalizeText([
    repair?.repairId,
    repair?.repairNumber,
    repair?.trackingId,
    repair?.id,
    repair?.customerName,
    repair?.customerPhone,
    repair?.phone,
    repair?.deviceName,
    repair?.deviceType,
    repair?.brand,
    repair?.model,
    repair?.status,
    repair?.issue,
    repair?.problem,
    repair?.notes,
    repair?.parts,
    repair?.repairParts,
    repair?.services,
    repair?.technician,
    repair?.paymentStatus,
    repair?.email
  ].join(" "));
}

function metaForRepair(repair) {
  const total = parseNumber(repair?.total ?? repair?.price ?? repair?.amount ?? repair?.repairCost);
  const paid = parseNumber(repair?.paid ?? repair?.paidAmount ?? repair?.deposit);
  const balance = parseNumber(repair?.balance ?? (total - paid));
  return { total, paid, balance };
}

function parseRepairTime(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function buildQueueInfo(repair, repairs = []) {
  const list = normalizeRepairCollection(repairs);
  if (!list.length) {
    return { position: 1, todayTotal: 1, allTotal: 1 };
  }
  const referenceTime = parseRepairTime(repair?.createdAt || repair?.date || repair?.updatedAt || Date.now());
  const referenceDay = new Date(referenceTime || Date.now()).toDateString();
  const normalizedId = normalizeText(pickRepairId(repair) || repair?.id || "");
  const sameDay = list
    .map((item) => ({ item, time: parseRepairTime(item?.createdAt || item?.date || item?.updatedAt || 0) }))
    .filter(({ time }) => time && new Date(time).toDateString() === referenceDay)
    .sort((a, b) => a.time - b.time)
    .map(({ item }) => item);

  const index = sameDay.findIndex((item) => {
    const ids = [pickRepairId(item), item?.id, item?.repairId, item?.repairNumber, item?.trackingId].map((value) => normalizeText(value));
    return ids.includes(normalizedId);
  });

  return {
    position: index >= 0 ? index + 1 : Math.max(1, sameDay.length || 1),
    todayTotal: Math.max(1, sameDay.length || 1),
    allTotal: list.length
  };
}

function renderEmptyState() {
  const host = document.getElementById("trackResult");
  if (!host) return;
  host.innerHTML = `
    <div class="fade-in-up">
      <div class="icon-chip mx-auto mb-3 pulse-soft"><i class="bi bi-search"></i></div>
      <h3 class="h4 fw-bold mb-2">${escapeHtml(t("tracking.emptyTitle"))}</h3>
      <p class="text-muted mb-0">${escapeHtml(t("tracking.emptyText"))}</p>
    </div>`;

  const ratingCard = document.getElementById("ratingCard");
  if (ratingCard) ratingCard.classList.add("d-none");
}

function renderSearchingState() {
  const host = document.getElementById("trackResult");
  if (!host) return;
  host.innerHTML = `
    <div class="tracking-search-loading fade-in-up">
      <div class="spinner-border text-primary mb-3" role="status" aria-label="Searching"></div>
      <h3 class="h4 fw-bold mb-2">${escapeHtml(t("record.searching"))}</h3>
      <p class="text-muted mb-0">Please wait while we check the repair record and update the latest status.</p>
    </div>`;
}

function getAboutRotatorSlide(index = aboutRotatorIndex) {
  const total = ABOUT_ROTATOR_SLIDES.length || 1;
  return ABOUT_ROTATOR_SLIDES[((index % total) + total) % total];
}

function renderAboutRotator(index = aboutRotatorIndex) {
  const card = document.getElementById("aboutRotatorCard");
  const icon = document.getElementById("aboutRotatorIcon");
  const title = document.getElementById("aboutRotatorTitle");
  const text = document.getElementById("aboutRotatorText");
  const badgesHost = document.getElementById("aboutRotatorBadges");
  if (!card || !icon || !title || !text || !badgesHost || !ABOUT_ROTATOR_SLIDES.length) return;

  const slide = getAboutRotatorSlide(index);
  card.classList.add("is-switching");
  window.setTimeout(() => card.classList.remove("is-switching"), 220);

  icon.innerHTML = `<i class="bi ${slide.icon}"></i>`;
  title.textContent = t(slide.titleKey, title.textContent);
  text.textContent = t(slide.textKey, text.textContent);
  badgesHost.innerHTML = "";
  slide.badges.forEach((badgeKey) => {
    const span = document.createElement("span");
    span.className = "mini-badge";
    span.textContent = t(badgeKey, badgeKey);
    badgesHost.appendChild(span);
  });
}

function startAboutRotator() {
  if (aboutRotatorTimer) {
    clearInterval(aboutRotatorTimer);
    aboutRotatorTimer = null;
  }
  renderAboutRotator(aboutRotatorIndex);
  if (ABOUT_ROTATOR_SLIDES.length < 2) return;
  aboutRotatorTimer = window.setInterval(() => {
    aboutRotatorIndex = (aboutRotatorIndex + 1) % ABOUT_ROTATOR_SLIDES.length;
    renderAboutRotator(aboutRotatorIndex);
  }, 3600);
}

function stageList() {
  const isSo = currentLang === "so";
  return [
    { key: "device received", label: t("status.deviceReceived", "Device Received"), desc: isSo ? "Dukaanka waa la soo diiwaangeliyay" : "The repair has been logged at the shop.", icon: "bi-box-seam" },
    { key: "inspection started", label: t("status.inspectionStarted", "Inspection Started"), desc: isSo ? "Baadhitaanka waa bilowday" : "The inspection process has started.", icon: "bi-search" },
    { key: "diagnosis completed", label: t("status.diagnosisCompleted", "Diagnosis Completed"), desc: isSo ? "Cilladda waa la ogaaday" : "The fault has been diagnosed.", icon: "bi-clipboard2-pulse" },
    { key: "waiting for approval", label: t("status.waitingApproval", "Waiting for Approval"), desc: isSo ? "Waxa la sugayaa oggolaanshaha macaamiisha" : "Waiting for customer approval.", icon: "bi-person-check" },
    { key: "waiting for parts", label: t("status.waitingParts", "Waiting for Parts"), desc: isSo ? "Qaybaha ayaa la raadinayaa" : "Parts are being sourced.", icon: "bi-box-seam" },
    { key: "repair in progress", label: t("status.repairInProgress", "Repair In Progress"), desc: isSo ? "Shaqada dayactirka ayaa socota" : "Repair work is in progress.", icon: "bi-tools" },
    { key: "quality testing", label: t("status.qualityTesting", "Quality Testing"), desc: isSo ? "Tijaabo iyo hubin tayo ayaa socota" : "Quality testing and checks are underway.", icon: "bi-check2-circle" },
    { key: "ready for pickup", label: t("status.readyForPickup", "Ready for Pickup"), desc: isSo ? "Diyaar u ah in la qaado" : "Ready for pickup.", icon: "bi-bag-check" },
    { key: "delivered", label: t("status.delivered", "Delivered"), desc: isSo ? "Macaamiisha waa loo gaarsiiyay" : "Delivered to the customer.", icon: "bi-truck" }
  ];
}
function normalizeTrackingStageKey(value) {
  const raw = normalizeText(value || "device received");
  return STATUS_META[raw] ? raw : (STATUS_META[STATUS_ALIASES[raw]] ? STATUS_ALIASES[raw] : "device received");
}

let lastStatusSoundToken = "";
let lastStatusSoundTimer = null;

function playStatusSound(statusValue, repairId, { force = false } = {}) {
  const statusKey = normalizeTrackingStageKey(statusValue);
  const soundFile = STATUS_SOUND_MAP[statusKey];
  if (!soundFile) return false;

  const token = `${normalizeText(repairId || "repair")}:${statusKey}`;
  if (!force && token === lastStatusSoundToken) return false;
  lastStatusSoundToken = token;

  try {
    const audio = new Audio(soundFile);
    audio.preload = "auto";
    audio.volume = 0.85;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
    return true;
  } catch (error) {
    console.warn("Could not play status sound:", error);
    return false;
  }
}

function scheduleStatusSound(statusValue, repairId, delayMs = 5000) {
  if (lastStatusSoundTimer) {
    clearTimeout(lastStatusSoundTimer);
    lastStatusSoundTimer = null;
  }
  lastStatusSoundTimer = window.setTimeout(() => {
    lastStatusSoundTimer = null;
    playStatusSound(statusValue, repairId, { force: true });
  }, Math.max(0, Number(delayMs) || 0));
}

function extractStatusHistory(repair) {
  const map = {};
  const source = repair?.statusHistory || repair?.statusTimeline || repair?.statusTimestamps || repair?.timeline;
  if (Array.isArray(source)) {
    source.forEach((item) => {
      const key = normalizeTrackingStageKey(item?.status || item?.key || item?.name);
      const time = item?.updatedAt || item?.at || item?.date || item?.timestamp || item?.time;
      if (time) map[key] = time;
    });
  } else if (source && typeof source === "object") {
    Object.entries(source).forEach(([key, value]) => {
      const normalizedKey = normalizeTrackingStageKey(key);
      if (value) map[normalizedKey] = value;
    });
  }
  return map;
}

function statusTimeLabel(value) {
  return value ? formatDateTime(value) : t("record.pending", "Pending...");
}

async function findRepair(query) {
  const q = normalizeQuery(query);
  if (!q) return null;
  const normalized = normalizeText(q);
  const exact = await getById("repairs", q).catch(() => null);
  if (exact) return { ...(exact || {}), id: exact.id || q };

  const raw = await getRepairs().catch(() => null);
  const list = normalizeRepairCollection(raw);
  if (!list.length) return null;

  const direct = list.find((item) => {
    const ids = [item?.repairId, item?.repairNumber, item?.trackingId, item?.id].map((v) => normalizeText(v));
    return ids.includes(normalized) || ids.includes(normalized.replace(/^r[-\s]*/i, "")) || ids.some((v) => v && v.replace(/^r[-\s]*/i, "") === normalized.replace(/^r[-\s]*/i, ""));
  });
  if (direct) return direct;

  return list.find((item) => repairBlob(item).includes(normalized)) || null;
}

async function loadVisitorRatings(repairId) {
  const data = await getOnce("repairRatings").catch(() => null);
  const target = normalizeText(repairId);
  const cloudList = normalizeRepairCollection(data).filter((item) => {
    return [item?.repairId, item?.repairNumber, item?.trackingId, item?.id].map((value) => normalizeText(value)).includes(target);
  });

  let localList = [];
  try {
    const cacheKey = `${RATING_CACHE_KEY}:${repairId}`;
    localList = JSON.parse(localStorage.getItem(cacheKey) || "[]");
  } catch {
    localList = [];
  }

  const list = [...cloudList, ...normalizeRepairCollection(localList)];
  if (!list.length) return { average: 0, count: 0 };
  const ratings = list.map((item) => parseNumber(item?.rating)).filter((n) => n > 0);
  if (!ratings.length) return { average: 0, count: list.length };
  const average = ratings.reduce((sum, n) => sum + n, 0) / ratings.length;
  return { average, count: list.length };
}

function renderRatingStars(value = 0) {
  const host = document.getElementById("ratingStars");
  if (!host) return;
  host.innerHTML = "";
  for (let i = 1; i <= 5; i += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `star-btn ${i <= value ? "active" : ""}`;
    button.innerHTML = `<i class="bi ${i <= value ? "bi-star-fill" : "bi-star"}"></i>`;
    button.setAttribute("aria-label", `Rate ${i} star${i > 1 ? "s" : ""}`);
    button.addEventListener("click", () => {
      currentRating = i;
      renderRatingStars(i);
    });
    host.appendChild(button);
  }
}

async function syncRepairRatingSnapshot(repairId, rating, comment) {
  const summary = await loadVisitorRatings(repairId).catch(() => ({ average: rating, count: 1 }));
  const repair = await findRepair(repairId).catch(() => null);
  if (repair?.id) {
    try {
      const average = summary.average || rating || 0;
      await editRecord("repairs", repair.id, {
        rating: average,
        ratingValue: average,
        stars: average,
        customerRating: average,
        reviewRating: average,
        rate: average,
        ratingCount: summary.count || 1,
        ratingUpdatedAt: Date.now(),
        lastVisitorRating: rating,
        lastVisitorComment: comment || ""
      });
    } catch (error) {
      console.warn("Could not sync repair rating snapshot:", error);
    }
  }
  return summary;
}

async function saveVisitorRating(repairId, rating, comment) {
  const payload = {
    repairId,
    rating,
    comment: comment || "",
    source: "public-site",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  try {
    await addRecord("repairRatings", payload);
  } catch (error) {
    const key = `${RATING_CACHE_KEY}:${repairId}`;
    const cached = JSON.parse(localStorage.getItem(key) || "[]");
    cached.push(payload);
    localStorage.setItem(key, JSON.stringify(cached));
  }
  await syncRepairRatingSnapshot(repairId, rating, comment);
}

function setMessage(type, text) {
  const host = document.getElementById("trackMessage");
  if (!host) return;
  if (!text) {
    host.innerHTML = "";
    return;
  }
  const styles = {
    success: "alert alert-success border-0 shadow-sm",
    warning: "alert alert-warning border-0 shadow-sm",
    danger: "alert alert-danger border-0 shadow-sm",
    info: "alert alert-info border-0 shadow-sm"
  };
  const icon = { success: "bi-check-circle-fill", warning: "bi-exclamation-triangle-fill", danger: "bi-x-circle-fill", info: "bi-info-circle-fill" }[type] || "bi-info-circle-fill";
  host.innerHTML = `<div class="${styles[type] || styles.info} rounded-4 mb-0 fade-in-up"><i class="bi ${icon} me-2"></i>${escapeHtml(text)}</div>`;
}

function setButtonLoading(button, loading, labelText = t("actions.track")) {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add("btn-loading");
    button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span><span>${escapeHtml(labelText)}</span>`;
  } else {
    button.disabled = false;
    button.classList.remove("btn-loading");
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
  }
}

function scrollToTrackingResult() {
  const host = document.getElementById("trackResult");
  if (!host) return;
  const y = window.scrollY + host.getBoundingClientRect().top - 104;
  window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
}

function renderRepair(repair, repairs = lastRepairCollection, options = {}) {
  const host = document.getElementById("trackResult");
  lastRenderedRepair = repair || lastRenderedRepair;
  if (!host) return;

  const meta = statusMeta(repair?.status);
  const repairId = pickRepairId(repair);
  const services = splitList(repair?.repairParts || repair?.parts || repair?.services);
  const notes = repair?.notes || repair?.issue || repair?.problem || t("record.noNotes");
  const customer = repair?.customerName || repair?.name || "Unknown customer";
  const phone = repair?.customerPhone || repair?.phone || "—";
  const device = repair?.deviceName || repair?.deviceType || repair?.model || "Unknown device";
  const brand = repair?.brand || "—";
  const model = repair?.model || repair?.deviceName || "—";
  const serial = repair?.serialNumber || repair?.imei || repair?.serial || "—";
  const shopName = repair?.shopName || getShopName();
  const shopPhone = repair?.shopPhone || getShopPhone();
  const receivedDate = repair?.createdAt ? formatDateTime(repair.createdAt) : (repair?.repairDate ? formatDateTime(repair.repairDate) : "—");
  const estimatedDate = repair?.estimatedCompletionDate ? formatDateTime(repair.estimatedCompletionDate) : (repair?.estimatedDate ? formatDateTime(repair.estimatedDate) : "Pending...");
  const updated = repair?.updatedAt ? formatDateTime(repair.updatedAt) : "—";
  const email = repair?.email || repair?.shopEmail || getShopEmail();
  const hours = repair?.hours || "Sat–Thu • 8:00 AM – 8:00 PM";
  const { total, paid, balance } = metaForRepair(repair);
  const stages = stageList();
  const stageIndex = Math.max(0, stages.findIndex((stage) => stage.key === normalizeTrackingStageKey(repair?.status)));
  const progress = stages.length > 1 ? Math.round((stageIndex / (stages.length - 1)) * 100) : 0;
  const queueInfo = buildQueueInfo(repair, repairs);
  const ratingSummaryText = ratingStats.count ? `${ratingStats.average.toFixed(1)}/5 • ${ratingStats.count}` : t("record.noRating");
  const history = extractStatusHistory(repair);
  const currentStatusLabel = stages[stageIndex]?.label || meta.label || "Repair Status";
  const currentStatusIcon = stages[stageIndex]?.icon || meta.icon;

  const timelineItems = stages.map((stage, index) => {
    const done = index < stageIndex;
    const active = index === stageIndex;
    const future = index > stageIndex;
    const timeValue = history[stage.key];
    const tsLabel = done || active ? statusTimeLabel(timeValue || repair?.updatedAt || repair?.createdAt) : "Pending...";
    return `
      <div class="timeline-item ${done ? "done" : ""} ${active ? "active" : ""} ${future ? "future" : ""}" style="--delay:${index * 90}ms" data-reveal>
        <div class="timeline-marker">
          <span class="timeline-dot">
            <i class="bi ${active ? currentStatusIcon : done ? "bi-check2" : stage.icon}"></i>
          </span>
        </div>
        <div class="timeline-body">
          <div class="timeline-title">${escapeHtml(stage.label)}</div>
          <div class="timeline-time"><i class="bi bi-clock me-1"></i>${escapeHtml(tsLabel)}</div>
        </div>
      </div>`;
  }).join("");

  const infoRows = [
    [t("record.customer"), customer, "bi-person-badge"],
    [t("record.phone"), phone, "bi-telephone"],
    [t("record.device"), device, "bi-phone"],
    [t("record.problem"), notes, "bi-clipboard2-pulse"],
    [t("record.parts"), services.length ? services.join(" • ") : "—", "bi-puzzle"],
    ["Repair ID", repairId || "—", "bi-upc-scan"],
    ["Model", model, "bi-phone-vibrate"],
    ["Received Date", receivedDate, "bi-calendar2-event"],
    ["Working Hours", hours, "bi-clock-history"]
  ].map(([label, value, icon]) => `
      <div class="tracking-info-row">
        <div class="tracking-info-label"><i class="bi ${icon}"></i><span>${escapeHtml(label)}</span></div>
        <strong>${escapeHtml(value)}</strong>
      </div>`).join("");

  host.innerHTML = `
    <div class="tracking-premium-shell fade-in-up">
      <div class="tracking-header-card mb-4">
        <div class="d-flex flex-column gap-3 text-start">
          <div>
            <div class="small text-uppercase fw-bold text-primary">${escapeHtml(getShopName())}</div>
            <h3 class="fw-bold mb-1">${escapeHtml(t("record.repairTracking", "Repair Tracking"))}</h3>
            <div class="text-muted small">Tracking: ${escapeHtml(customer)} • Repair ID: ${escapeHtml(repairId || "—")}</div>
          </div>
          <div class="d-flex flex-wrap align-items-center gap-2">
            <span class="status-pill ${meta.className} status-pill--animated"><i class="bi ${meta.icon}"></i>${escapeHtml(currentStatusLabel)}</span>
            <span class="mini-badge"><i class="bi bi-123 me-1"></i> Queue No. ${queueInfo.position}</span>
          </div>
          <div class="text-muted small"><i class="bi bi-clock me-1"></i>Last updated: ${escapeHtml(updated)}</div>
        </div>
      </div>

      <div class="tracking-vertical-stack">
        <div class="tracking-info-card glass-card mb-4">
          <div class="section-title mb-3">${escapeHtml(t("record.repairDetails", "Repair Details"))}</div>
          <div class="tracking-info-list">${infoRows}</div>
        </div>

        <div class="tracking-status-card glass-card mb-4">
          <div class="d-flex flex-column align-items-start gap-2">
            <div class="small text-uppercase fw-bold text-muted">${escapeHtml(t("record.currentRepairStatus", "Current Repair Status"))}</div>
            <div class="progress-left flex-grow-1">
              <div class="d-flex align-items-center gap-2 flex-wrap mt-1 status-badges-row">
                <span class="status-pill ${meta.className} status-pill--animated"><i class="bi ${currentStatusIcon}"></i>${escapeHtml(currentStatusLabel)}</span>
                <span class="mini-badge"><i class="bi bi-123 me-1"></i> Queue No. ${queueInfo.position}</span>
              </div>
              <div class="text-muted small mt-2"><i class="bi bi-clock me-1"></i>${escapeHtml(updated)}</div>
              <div class="progress-label mt-3">${escapeHtml(t("record.progressLabel", "Progress"))}</div>
              <div class="progress-percent">${progress}%</div>
            </div>
          </div>
          <div class="progress-rail mt-3 mb-2"><div class="progress-bar-fill" style="width:${progress}%"></div></div>
          <div class="d-flex justify-content-between small text-muted">
            <span>${escapeHtml(t("record.received", "Received"))}</span><span>${escapeHtml(t("record.deliveredLabel", "Delivered"))}</span>
          </div>
          <div class="tracking-status-card-inner mt-4">
            <div class="section-title mb-3">${escapeHtml(t("record.repairTimeline", "Repair Timeline"))}</div>
            <div class="timeline-vertical">${timelineItems}</div>
          </div>
        </div>

        <div class="tracking-compact-card glass-card mb-4">
          <div class="section-title mb-3">${escapeHtml(t("record.notes"))}</div>
          <div class="text-muted">${escapeHtml(notes)}</div>
        </div>

        <div class="tracking-compact-card glass-card">
          <div class="section-title mb-3">${escapeHtml(t("record.repair"))}</div>
          <div class="tracking-finance-grid">
            <div><span>Total</span><strong>${currency(total)}</strong></div>
            <div><span>Paid</span><strong>${currency(paid)}</strong></div>
            <div><span>Balance</span><strong>${currency(balance)}</strong></div>
            <div><span>Rating</span><strong>${escapeHtml(ratingSummaryText)}</strong></div>
          </div>
          <div class="d-flex flex-wrap gap-2 mt-3">
            <span class="mini-badge"><i class="bi bi-star-fill me-1"></i>${escapeHtml(ratingSummaryText)}</span>
            <span class="mini-badge"><i class="bi bi-telephone me-1"></i>${escapeHtml(phone)}</span>
            <span class="mini-badge"><i class="bi bi-phone me-1"></i>${escapeHtml(device)}</span>
          </div>
        </div>
      </div>
    </div>`;

  const ratingCard = document.getElementById("ratingCard");
  const summary = document.getElementById("ratingSummary");
  const helper = document.getElementById("ratingHelper");
  if (ratingCard) ratingCard.classList.remove("d-none");
  if (summary) summary.textContent = ratingStats.count ? `${ratingStats.average.toFixed(1)}/5 • ${ratingStats.count}` : t("record.noRating");
  if (helper) helper.textContent = ratingStats.count ? `${t("record.ratingAverage")}: ${ratingStats.average.toFixed(1)}/5 • ${ratingStats.count}` : t("rating.helper");
  renderRatingStars(currentRating || 0);
}

function metaForRepairStageKey(repair) {
  return normalizeTrackingStageKey(repair?.status || "device received");
}

async function handleTrack(inputEl) {
  const query = normalizeQuery(inputEl?.value);
  const forms = ["trackBtn", "topTrackBtn", "heroTrackBtn", "mobileTrackBtn"].map((id) => document.getElementById(id)).filter(Boolean);
  const activeButton = forms.find((btn) => btn?.contains(document.activeElement)) || forms[0];
  if (!query) {
    setMessage("warning", t("record.enter"));
    renderEmptyState();
    return;
  }

  setMessage("info", t("record.searching"));
  renderSearchingState();
  setButtonLoading(activeButton, true, t("actions.track"));
  scrollToTrackingResult();
  try {
    const result = await findRepair(query);
    if (!result) {
      currentRepair = null;
      lastRenderedRepair = null;
      currentRepairId = "";
      ratingStats = { average: 0, count: 0 };
      setMessage("danger", `${t("record.notFound")} “${escapeHtml(query)}”.`);
      renderEmptyState();
      return;
    }
    currentRepair = result;
    lastRenderedRepair = result;
    currentRepairId = pickRepairId(result) || query;
    lastRepairCollection = normalizeRepairCollection(await getRepairs().catch(() => []));
    ratingStats = await loadVisitorRatings(currentRepairId);
    setMessage("success", `${t("record.found")} “${escapeHtml(currentRepairId)}”.`);
    renderRepair(result, lastRepairCollection);
    lastStatusSoundToken = "";
    scheduleStatusSound(result?.status, currentRepairId, 5000);
    observeRevealTargets(document);
    setTimeout(scrollToTrackingResult, 80);
  } catch (error) {
    console.error("Tracking failed:", error);
    setMessage("danger", error?.message || "Tracking failed.");
    renderEmptyState();
  } finally {
    setButtonLoading(activeButton, false);
  }
}

function bindForms() {
  const pairs = [
    { form: document.getElementById("trackForm"), input: document.getElementById("trackInput") },
    { form: document.getElementById("heroTrackForm"), input: document.getElementById("heroTrackInput") },
    { form: document.getElementById("topTrackForm"), input: document.getElementById("topTrackInput") },
    { form: document.getElementById("mobileTrackForm"), input: document.getElementById("mobileTrackInput") },
    { form: document.getElementById("mobileHeaderTrackForm"), input: document.getElementById("mobileHeaderTrackInput") }
  ];

  pairs.forEach(({ form, input }) => {
    if (!form || !input) return;
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = normalizeQuery(input.value);
      pairs.forEach((item) => {
        if (item.input) item.input.value = value;
      });
      await handleTrack(input);
      closeDesktopSearch();
      if (window.bootstrap?.Offcanvas) {
        const mobileMenu = document.getElementById("mobileMenu");
        const instance = mobileMenu ? window.bootstrap.Offcanvas.getInstance(mobileMenu) : null;
        if (instance) instance.hide();
      }
      document.body.classList.remove("mobile-search-open");
      const mobileSearchIcon = document.getElementById("mobileSearchToggleIcon");
      if (mobileSearchIcon) mobileSearchIcon.className = "bi bi-search";
      const mobileSearchToggle = document.getElementById("mobileSearchToggleBtn");
      if (mobileSearchToggle) mobileSearchToggle.setAttribute("aria-expanded", "false");
    });
  });
}

function setDesktopSearchOpen(open) {
  const isDesktop = window.matchMedia("(min-width: 992px)").matches;
  const nextOpen = Boolean(open) && isDesktop;
  document.body.classList.toggle("desktop-search-open", nextOpen);

  const toggleBtn = document.getElementById("desktopSearchToggleBtn");
  if (toggleBtn) toggleBtn.setAttribute("aria-expanded", String(nextOpen));

  const icon = document.getElementById("desktopSearchToggleIcon");
  if (icon) icon.className = `bi ${nextOpen ? "bi-chevron-right" : "bi-arrow-right-circle"}`;

  const input = document.getElementById("topTrackInput");
  if (nextOpen && input) {
    window.requestAnimationFrame(() => {
      try { input.focus({ preventScroll: true }); } catch { input.focus(); }
    });
  }
}

function openDesktopSearch() {
  setDesktopSearchOpen(true);
}

function closeDesktopSearch() {
  setDesktopSearchOpen(false);
}

function bindDesktopSearch() {
  const toggleBtn = document.getElementById("desktopSearchToggleBtn");
  const input = document.getElementById("topTrackInput");
  const form = document.getElementById("topTrackForm");
  if (!toggleBtn || !input || !form) return;

  const open = () => openDesktopSearch();
  const close = () => closeDesktopSearch();

  toggleBtn.addEventListener("click", () => {
    const isOpen = document.body.classList.contains("desktop-search-open");
    if (isOpen) close();
    else open();
  });

  input.addEventListener("focus", open);
  input.addEventListener("click", open);

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });

  document.addEventListener("click", (event) => {
    if (!document.body.classList.contains("desktop-search-open")) return;
    const within = event.target.closest?.("#desktopHeaderShell");
    if (!within) close();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth < 992) close();
  });
}

function bindThemeButtons() {
  ["themeToggleBtn", "mobileThemeToggleBtn"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", toggleTheme);
  });
}

function bindLangButtons() {
  ["langToggleBtn", "mobileLangToggleBtn"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", toggleLanguage);
  });
}

function bindNav() {
  const sections = ["home", "about", "services", "tracking"];
  const links = Array.from(document.querySelectorAll("[data-nav-link]"));
  const setActive = (id) => {
    links.forEach((link) => {
      const active = link.dataset.navLink === id;
      link.classList.toggle("active", active);
    });
  };

  sections.forEach((sectionId) => {
    const section = document.getElementById(sectionId);
    if (!section) return;
    section.classList.add("section-anchor");
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.id) setActive(visible.target.id);
    }, { threshold: [0.25, 0.4, 0.6], rootMargin: "-24% 0px -60% 0px" });
    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  links.forEach((link) => {
    link.addEventListener("click", () => {
      setActive(link.dataset.navLink);
      closeDesktopSearch();
      const mobileMenu = document.getElementById("mobileMenu");
      const instance = mobileMenu ? window.bootstrap?.Offcanvas.getInstance(mobileMenu) : null;
      if (instance) instance.hide();
    });
  });

  window.addEventListener("hashchange", () => {
    const current = (location.hash || "#home").replace("#", "");
    setActive(current);
    closeDesktopSearch();
  });

  const year = document.getElementById("yearNow");
  if (year) year.textContent = new Date().getFullYear();
}

function bindRatingForm() {
  const form = document.getElementById("ratingForm");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentRepairId) {
      setMessage("warning", t("record.enter"));
      return;
    }
    if (!currentRating) {
      const helper = document.getElementById("ratingHelper");
      if (helper) helper.textContent = t("rating.select");
      return;
    }
    const commentInput = document.getElementById("ratingComment");
    const comment = commentInput?.value?.trim() || "";
    const submitBtn = document.getElementById("ratingSubmitBtn");
    setButtonLoading(submitBtn, true, t("rating.submit"));
    try {
      await saveVisitorRating(currentRepairId, currentRating, comment);
      ratingStats = await loadVisitorRatings(currentRepairId);
      if (commentInput) commentInput.value = "";
      setMessage("success", t("rating.saved"));
      if (document.getElementById("ratingHelper")) document.getElementById("ratingHelper").textContent = comment ? t("rating.comment") : t("rating.saved");
      renderRatingStars(currentRating);
      if (currentRepair) renderRepair(currentRepair, lastRepairCollection, { playStatusSound: false });
    } catch (error) {
      console.error("Rating save failed:", error);
      setMessage("danger", error?.message || "Rating could not be saved.");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

function bindTrackFieldSync() {
  const inputs = ["trackInput", "heroTrackInput", "topTrackInput", "mobileTrackInput", "mobileHeaderTrackInput"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  inputs.forEach((input) => {
    input.addEventListener("input", () => {
      inputs.forEach((item) => {
        if (item !== input) item.value = input.value;
      });
    });
  });
}

function bindAutoScrollToTracking() {
  document.querySelectorAll('a[href="#tracking"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      document.getElementById("tracking")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function observeRevealTargets(scope = document) {
  const targets = scope.querySelectorAll("[data-reveal], .about-card, .about-rotator-card, .tracking-info-row, .service-card, .metric-card, .hero-card");
  if (!targets.length) return;

  const reveal = (elements) => {
    elements.forEach((element) => {
      element.classList.add("is-visible");
    });
  };

  if (!("IntersectionObserver" in window)) {
    reveal(targets);
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      obs.unobserve(entry.target);
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });

  targets.forEach((target) => observer.observe(target));
}

function bindMobileSearchToggle() {
  const button = document.getElementById("mobileSearchToggleBtn");
  const input = document.getElementById("mobileHeaderTrackInput");
  const panel = document.getElementById("mobileHeaderTrackForm")?.closest(".mobile-search-panel") || document.querySelector(".mobile-search-panel.d-lg-none");
  if (!button) return;

  const syncIcon = (open) => {
    const icon = document.getElementById("mobileSearchToggleIcon");
    if (icon) icon.className = `bi ${open ? "bi-x-lg" : "bi-search"}`;
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close search" : "Open search");
  };

  const setOpen = (open) => {
    document.body.classList.toggle("mobile-search-open", open);
    syncIcon(open);
    if (open) {
      window.setTimeout(() => input?.focus(), 80);
    }
  };

  syncIcon(document.body.classList.contains("mobile-search-open"));

  button.addEventListener("click", () => {
    const next = !document.body.classList.contains("mobile-search-open");
    setOpen(next);
  });

  if (panel) {
    panel.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  }

  document.addEventListener("click", (event) => {
    if (!document.body.classList.contains("mobile-search-open")) return;
    const withinNav = event.target.closest?.(".navbar-top");
    if (!withinNav) setOpen(false);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 992) {
      document.body.classList.remove("mobile-search-open");
      syncIcon(false);
    }
  });
}

function initAuthListener() {
  try {
    onAuthStateChanged(auth, (user) => {
      authUser = user || null;
      setAuthButtons();
    });
  } catch (error) {
    console.warn("Auth listener unavailable:", error);
    setAuthButtons();
  }
}

function setDefaultPlaceholders() {
  const input = document.getElementById("trackInput");
  if (input && !input.placeholder) input.placeholder = t("placeholders.track");
}

function updatePublicContactLinks() {
  const phone = String(getShopPhone() || "").trim();
  const whatsapp = String(getShopWhatsapp() || "").trim();
  const phoneDigits = phone.replace(/\D/g, "");
  const whatsappDigits = whatsapp.replace(/\D/g, "");
  const phoneHref = phoneDigits ? `tel:${phoneDigits}` : `tel:${phone.replace(/\s+/g, "")}`;
  const whatsappHref = `https://wa.me/${whatsappDigits || phoneDigits}?text=${encodeURIComponent("Asc fadlan iga caawi sida aan repair ID ugu raadini lahaa halkaan.")}`;

  document.querySelectorAll('a[href^="tel:"]').forEach((link) => {
    if (phoneHref) link.setAttribute("href", phoneHref);
    const label = phone || "Call";
    const icon = link.querySelector("i");
    if (link.getAttribute("aria-label")) {
      link.setAttribute("aria-label", `Call ${phone || phoneDigits || ""}`.trim());
    }
    if (icon && /bi-telephone/.test(icon.className)) {
      const textNodes = Array.from(link.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE);
      if (textNodes.length) {
        textNodes[textNodes.length - 1].nodeValue = phone ? ` ${phone}` : textNodes[textNodes.length - 1].nodeValue;
      }
    }
  });

  document.querySelectorAll('a[href*="wa.me/"]').forEach((link) => {
    link.setAttribute("href", whatsappHref);
    if (link.getAttribute("aria-label")) {
      link.setAttribute("aria-label", `WhatsApp ${whatsapp || whatsappDigits || ""}`.trim());
    }
  });
}

function initPage() {
  initText();
  setDefaultPlaceholders();
  bindForms();
  bindThemeButtons();
  bindLangButtons();
  bindNav();
  bindRatingForm();
  bindTrackFieldSync();
  bindAutoScrollToTracking();
  bindDesktopSearch();
  bindMobileSearchToggle();
  initAuthListener();
  renderEmptyState();
  startAboutRotator();
  observeRevealTargets(document);
  setAuthButtons();
}

document.addEventListener("DOMContentLoaded", initPage);

window.addEventListener("storage", (event) => {
  if (event.key === THEME_KEY) applyTheme(getSavedTheme());
  if (event.key === LANG_KEY) applyLanguage(getSavedLanguage());
});
