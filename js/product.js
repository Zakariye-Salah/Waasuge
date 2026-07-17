import {
  addProduct,
  addInvoice,
  updateInvoice,
  deleteInvoice,
  updateProduct,
  deleteProduct,
  restoreProduct,
  getProducts,
  getInvoices,
  getSettingValue,
  setSettingValue,
  safeNumber,
  normalizeText,
  filterActive,
  filterDeleted,
  formatDateTime
} from "./database.js";
import { debounce, showToast, formatCurrency, setHeaderBadgeCount, renderNotificationMenu, setPageLoading } from "./main.js";

const CART_KEY = "electronicShopCart";
const CART_COUNT_KEY = "electronicShopCartCount";
const CART_DISCOUNT_KEY = "electronicShopCartDiscount";
const CART_MODE_KEY = "electronicShopCartMode";
const PRODUCT_LOW_STOCK = 5;
const CATEGORY_STORE_KEY = "electronicShopCategories";
const SALE_HISTORY_KEY = "electronicShopSaleHistory";

function productLoadingTargets() {
  return [".page-wrap", ".product-table-shell", ".card-shell", ".table-responsive", "#saleHistoryBody"];
}

const state = {
  products: [],
  query: "",
  editKey: null,
  editSaleId: null,
  editSaleCreatedAt: null,
  isSaving: false,
  pendingDeleteKey: null,
  trashCategory: "All Categories",
  trashDateFilter: "week",
  trashRows: "5",
  saleHistoryDateFilter: "today",
  saleHistoryRows: "5",
  productRows: "5",
  categoriesReady: false,
  restockCollapsed: false,
  saleHistoryRecords: []
};

const nodes = {
  searchInputs: [],
  cardGrid: null,
  productTableBody: null,
  cartTableBody: null,
  trashTableBody: null,
  addModal: null,
  addModalTitle: null,
  addModalSaveBtn: null,
  cartModal: null,
  cartModalSaveBtn: null,
  cartModalInvoiceBtn: null,
  cartModalSellBtn: null,
  trashModal: null,
  trashFilterCategory: null,
  trashDateFilter: null,
  trashFilterRows: null,
  deleteConfirmModal: null,
  deleteConfirmTitle: null,
  deleteConfirmBody: null,
  deleteConfirmBtn: null,
  deleteForeverBtn: null,
  filterSelects: [],
  productRowsFilter: null,
  filterCategorySelector: null,
  productCategorySelector: null,
  summaryTotalProducts: null,
  summaryLowStockProducts: null,
  summaryImportantProducts: null,
  summaryRecycleBinCount: null,
  summarySoldTodayProducts: null,
  summaryPaidTodayAmount: null,
  summaryRemainingTodayAmount: null,
  saleHistoryDateFilter: null,
  saleHistoryRowsFilter: null,
  cartBadge: null,
  cartItemCountPill: null,
  cartSubtotal: null,
  cartDiscount: null,
  cartFinalTotal: null,
  cartDiscountInput: null,
  cartModalTitle: null,
  restockQueueShell: null,
  restockQueueBody: null,
  restockQueueCount: null,
  toggleRestockQueueBtn: null,
  restockDetailModal: null,
  restockDetailTitle: null,
  restockDetailBody: null,
};

const productCategories = [
  { name: "Chargers", icon: "bi-battery-charging" },
  { name: "Fast Chargers", icon: "bi-lightning-charge" },
  { name: "Wireless Chargers", icon: "bi-wifi" },
  { name: "Charging Cables", icon: "bi-usb-symbol" },
  { name: "USB Cables", icon: "bi-usb-symbol" },
  { name: "Type-C Cables", icon: "bi-usb-symbol" },
  { name: "Lightning Cables", icon: "bi-lightning-charge" },
  { name: "Micro USB Cables", icon: "bi-usb-symbol" },
  { name: "HDMI Cables", icon: "bi-display" },
  { name: "AUX Cables", icon: "bi-headphones" },
  { name: "VGA Cables", icon: "bi-display" },
  { name: "LAN Cables", icon: "bi-ethernet" },
  { name: "Extension Cords", icon: "bi-plug" },
  { name: "Power Strips", icon: "bi-plug-fill" },
  { name: "Extension Sockets", icon: "bi-outlet" },
  { name: "Multi-Plugs", icon: "bi-plug" },
  { name: "Adapters", icon: "bi-plug" },
  { name: "USB Hubs", icon: "bi-usb-symbol" },
  { name: "OTG Adapters", icon: "bi-arrow-left-right" },
  { name: "Power Banks", icon: "bi-battery-full" },
  { name: "Batteries", icon: "bi-battery-half" },
  { name: "Rechargeable Batteries", icon: "bi-arrow-repeat" },
  { name: "Battery Chargers", icon: "bi-battery-charging" },
  { name: "Mobile Phones", icon: "bi-phone" },
  { name: "Smartphones", icon: "bi-phone-fill" },
  { name: "Tablets", icon: "bi-tablet" },
  { name: "Smart Watches", icon: "bi-smartwatch" },
  { name: "Watches", icon: "bi-watch" },
  { name: "Wall Clocks", icon: "bi-clock" },
  { name: "Earbuds", icon: "bi-earbuds" },
  { name: "Earphones", icon: "bi-headphones" },
  { name: "Headphones", icon: "bi-headphones" },
  { name: "Bluetooth Speakers", icon: "bi-speaker" },
  { name: "Speakers", icon: "bi-speaker-fill" },
  { name: "Microphones", icon: "bi-mic" },
  { name: "FM Radios", icon: "bi-broadcast" },
  { name: "Flashlights", icon: "bi-flashlight" },
  { name: "Emergency Lights", icon: "bi-lightbulb-fill" },
  { name: "LED Bulbs", icon: "bi-lightbulb" },
  { name: "Lamps", icon: "bi-lamp" },
  { name: "Tube Lights", icon: "bi-lightbulb" },
  { name: "Ceiling Lights", icon: "bi-lightbulb-fill" },
  { name: "Solar Lights", icon: "bi-sun" },
  { name: "Ceiling Fans", icon: "bi-fan" },
  { name: "Standing Fans", icon: "bi-fan" },
  { name: "Table Fans", icon: "bi-fan" },
  { name: "Exhaust Fans", icon: "bi-fan" },
  { name: "Solar Panels", icon: "bi-sun" },
  { name: "Solar Batteries", icon: "bi-battery-full" },
  { name: "Solar Charge Controllers", icon: "bi-cpu" },
  { name: "Solar Inverters", icon: "bi-lightning" },
  { name: "Inverters", icon: "bi-lightning" },
  { name: "UPS Systems", icon: "bi-battery" },
  { name: "Main Switches", icon: "bi-toggle-on" },
  { name: "Circuit Breakers", icon: "bi-lightning-charge-fill" },
  { name: "Light Switches", icon: "bi-toggle2-on" },
  { name: "Wall Sockets", icon: "bi-outlet" },
  { name: "Electrical Plugs", icon: "bi-plug-fill" },
  { name: "Fuses", icon: "bi-lightning-fill" },
  { name: "Junction Boxes", icon: "bi-box" },
  { name: "Electrical Tape", icon: "bi-bandaid" },
  { name: "Electrical Wires", icon: "bi-bezier2" },
  { name: "Electrical Accessories", icon: "bi-tools" },
  { name: "TV Remotes", icon: "bi-tv" },
  { name: "Universal Remotes", icon: "bi-tv-fill" },
  { name: "TV Boxes", icon: "bi-box-seam" },
  { name: "Streaming Devices", icon: "bi-cast" },
  { name: "Phone Cases", icon: "bi-phone" },
  { name: "Screen Protectors", icon: "bi-phone" },
  { name: "Camera Protectors", icon: "bi-camera" },
  { name: "Phone Holders", icon: "bi-phone" },
  { name: "Car Phone Holders", icon: "bi-car-front" },
  { name: "Selfie Sticks", icon: "bi-camera" },
  { name: "Tripods", icon: "bi-camera2" },
  { name: "Memory Cards", icon: "bi-sd-card" },
  { name: "USB Flash Drives", icon: "bi-usb-drive" },
  { name: "Hard Drives", icon: "bi-device-hdd" },
  { name: "SSDs", icon: "bi-device-ssd" },
  { name: "Card Readers", icon: "bi-sd-card" },
  { name: "Keyboards", icon: "bi-keyboard" },
  { name: "Computer Mice", icon: "bi-mouse" },
  { name: "Mouse Pads", icon: "bi-grid-3x3-gap" },
  { name: "Laptop Chargers", icon: "bi-laptop" },
  { name: "Laptop Batteries", icon: "bi-battery-half" },
  { name: "Laptop Bags", icon: "bi-briefcase" },
  { name: "Webcams", icon: "bi-camera-video" },
  { name: "Computer Accessories", icon: "bi-pc-display" },
  { name: "Printers", icon: "bi-printer" },
  { name: "Printer Ink", icon: "bi-droplet" },
  { name: "Toner Cartridges", icon: "bi-droplet-fill" },
  { name: "CCTV Cameras", icon: "bi-camera-video-fill" },
  { name: "DVR Systems", icon: "bi-hdd-stack" },
  { name: "Security Accessories", icon: "bi-shield-lock" },
  { name: "Wi-Fi Routers", icon: "bi-router" },
  { name: "Modems", icon: "bi-hdd-network" },
  { name: "Network Switches", icon: "bi-diagram-3" },
  { name: "Antennas", icon: "bi-broadcast-pin" },
  { name: "Laser Pointers", icon: "bi-cursor" },
  { name: "Glasses", icon: "bi-eyeglasses" },
  { name: "Sunglasses", icon: "bi-eyeglasses" },
  { name: "Prayer Beads", icon: "bi-gem" },
  { name: "Tools", icon: "bi-tools" },
  { name: "Screwdrivers", icon: "bi-screwdriver" },
  { name: "Precision Screwdrivers", icon: "bi-screwdriver" },
  { name: "Pliers", icon: "bi-tools" },
  { name: "Cutters", icon: "bi-scissors" },
  { name: "Soldering Irons", icon: "bi-fire" },
  { name: "Solder Wire", icon: "bi-bezier2" },
  { name: "Hot Air Stations", icon: "bi-wind" },
  { name: "Multimeters", icon: "bi-speedometer2" },
  { name: "Tweezers", icon: "bi-pin-angle" },
  { name: "Repair Tool Kits", icon: "bi-toolbox" },
  { name: "Cleaning Kits", icon: "bi-stars" },
  { name: "Adhesives", icon: "bi-droplet-half" },
  { name: "Replacement Parts", icon: "bi-gear" },
  { name: "Mobile Spare Parts", icon: "bi-phone" },
  { name: "SIM Cards", icon: "bi-sim" },
  { name: "SIM Adapters", icon: "bi-sim" },
  { name: "Gift Items", icon: "bi-gift" },
  { name: "Other Accessories", icon: "bi-box-seam" },
];

const productCategoryMap = new Map(productCategories.map((item) => [item.name, item.icon]));
const legacyCategoryDefaults = ["Chargerska mobilada", "Fiilooyinka iyo cables", "Power banks", "Nalalka iyo laambadaha", "Mobile repairing tools"];

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeSaleHistoryRecords(raw) {
  const records = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Object.entries(raw).map(([key, value]) => ({
          ...(value && typeof value === "object" ? value : {}),
          id: value?.id || key,
          invoiceId: value?.invoiceId || key,
          firebaseKey: value?.firebaseKey || key
        }))
      : [];

  return records
    .filter(Boolean)
    .map((item) => ({
      ...item,
      id: item?.id || item?.invoiceId || item?.invoiceNumber || item?.firebaseKey || String(Date.now()),
      invoiceId: item?.invoiceId || item?.id || item?.firebaseKey || item?.invoiceNumber || null
    }));
}

function getCart() {
  const cart = safeJsonParse(localStorage.getItem(CART_KEY), []);
  return Array.isArray(cart) ? cart : [];
}

function saveCart(cart) {
  const safeCart = Array.isArray(cart) ? cart : [];
  localStorage.setItem(CART_KEY, JSON.stringify(safeCart));
  const count = safeCart.reduce((sum, item) => sum + safeNumber(item.qty, 0), 0);
  localStorage.setItem(CART_COUNT_KEY, String(count));
  syncCartBadgeCount();
  renderCart();
  window.dispatchEvent(new CustomEvent("app:cart-changed", { detail: { count } }));
}

function getCartDiscount() {
  const raw = localStorage.getItem(CART_DISCOUNT_KEY);
  const stored = safeNumber(raw, 0);
  const input = nodes.cartDiscountInput?.value;
  if (input !== undefined && input !== null && String(input).trim() !== "") {
    return Math.max(0, safeNumber(input, stored));
  }
  return Math.max(0, stored);
}

function setCartDiscount(value) {
  const discount = Math.max(0, safeNumber(value, 0));
  localStorage.setItem(CART_DISCOUNT_KEY, String(discount));
  if (nodes.cartDiscountInput && String(nodes.cartDiscountInput.value) !== String(discount)) {
    nodes.cartDiscountInput.value = String(discount);
  }
  renderCart();
}

function clearStoredCartDiscount() {
  localStorage.removeItem(CART_DISCOUNT_KEY);
  if (nodes.cartDiscountInput) nodes.cartDiscountInput.value = "0";
}

function getSaleHistory() {
  const source = state.saleHistoryRecords.length
    ? state.saleHistoryRecords
    : safeArray(safeJsonParse(localStorage.getItem(SALE_HISTORY_KEY) || "[]", []));
  return source.slice().sort((a, b) => safeNumber(b?.createdAt) - safeNumber(a?.createdAt));
}

function saveSaleHistory(history) {
  const list = safeArray(history).slice(0, 300);
  state.saleHistoryRecords = list.slice();
  localStorage.setItem(SALE_HISTORY_KEY, JSON.stringify(list));
}

function upsertSaleHistory(entry) {
  const list = getSaleHistory();
  const recordId = saleHistoryRecordId(entry);
  const index = list.findIndex((item) => saleHistoryRecordId(item) === recordId);
  const normalized = { ...entry, id: entry?.id || entry?.invoiceId || entry?.invoiceNumber || recordId || String(Date.now()) };
  if (index >= 0) list[index] = { ...list[index], ...normalized };
  else list.unshift(normalized);
  saveSaleHistory(list);
}

function saleHistoryRecordId(item) {
  const value = item?.invoiceId || item?.invoiceNumber || item?.saleId || item?.id || item?.key || "";
  return stringifyHistoryId(value, String(item?.id || item?.invoiceId || item?.invoiceNumber || item?.saleId || item?.key || Date.now()));
}

function saleHistoryIsThisWeek(ts) {
  const date = new Date();
  const start = new Date(date);
  const offset = (date.getDay() + 1) % 7; // Saturday start
  start.setDate(date.getDate() - offset);
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23,59,59,999);
  const value = safeNumber(ts);
  return value >= start.getTime() && value <= end.getTime();
}

function saleHistoryMatchesFilter(item) {
  const filter = state.saleHistoryDateFilter || "today";
  const ts = safeNumber(item?.createdAt);
  if (!ts) return false;
  const now = new Date();
  const start = new Date(now); start.setHours(0,0,0,0);
  const end = new Date(now); end.setHours(23,59,59,999);
  if (filter === "today") return ts >= start.getTime() && ts <= end.getTime();
  if (filter === "week") return saleHistoryIsThisWeek(ts);
  if (filter === "month") return new Date(ts).getMonth() === now.getMonth() && new Date(ts).getFullYear() === now.getFullYear();
  if (filter === "year") return new Date(ts).getFullYear() === now.getFullYear();
  return true;
}

function renderProductSkeleton(count = 6) {
  return Array.from({ length: count }, () => `
    <div class="product-card-frame card-shell p-3 h-100">
      <div class="skeleton-box mb-3" style="height: 140px;"></div>
      <div class="skeleton-line mb-2" style="width: 65%;"></div>
      <div class="skeleton-line mb-2" style="width: 45%;"></div>
      <div class="skeleton-line" style="width: 35%;"></div>
    </div>`).join('');
}

function renderProductTableSkeleton(rows = 4) {
  return Array.from({ length: rows }, () => `
    <tr class="product-skeleton-row">
      <td colspan="7"><div class="skeleton-line" style="width: 88%;"></div></td>
    </tr>`).join('');
}

function renderSaleHistorySkeleton(rows = 4) {
  return Array.from({ length: rows }, () => `
    <tr class="sale-history-skeleton-row">
      <td colspan="7"><div class="skeleton-line" style="width: 85%;"></div></td>
    </tr>`).join('');
}

function getSaleHistoryRowLimit() {
  const value = String(state.saleHistoryRows || "5").trim().toLowerCase();
  if (value === "all") return Infinity;
  return Math.max(1, safeNumber(value, 5));
}

async function deleteSaleHistoryItem(id) {
  const key = String(id || "").trim();
  if (!key) return;
  try {
    await deleteInvoice(key);
    const remaining = getSaleHistory().filter((item) => saleHistoryRecordId(item) !== key);
    saveSaleHistory(remaining);
    renderSaleHistory();
    renderSummaryCards();
  } catch (error) {
    console.error("Failed to delete sale history item:", error);
    throw error;
  }
}

async function loadSaleHistoryFromFirebase(skipRender = false) {
  if (!skipRender) {
    const body = document.getElementById("saleHistoryBody");
    if (body) body.innerHTML = renderSaleHistorySkeleton(4);
  }
  try {
    const raw = await getInvoices();
    const records = normalizeSaleHistoryRecords(raw);
    state.saleHistoryRecords = records.filter(Boolean).slice(0, 300);
    localStorage.setItem(SALE_HISTORY_KEY, JSON.stringify(state.saleHistoryRecords));
    if (!skipRender) renderSaleHistory();
    return state.saleHistoryRecords;
  } catch (error) {
    console.error("Failed to load sale history:", error);
    state.saleHistoryRecords = safeArray(safeJsonParse(localStorage.getItem(SALE_HISTORY_KEY) || "[]", []));
    if (!skipRender) renderSaleHistory();
    return state.saleHistoryRecords;
  }
}

function renderSaleHistory() {
  const body = document.getElementById("saleHistoryBody");
  const totalEl = document.getElementById("saleHistoryTotalAmount");
  if (!body) return;

  const all = getSaleHistory();
  const filtered = all.filter(saleHistoryMatchesFilter);
  const rowsLimit = getSaleHistoryRowLimit();
  const visible = Number.isFinite(rowsLimit) ? filtered.slice(0, rowsLimit) : filtered;
  const grandTotal = filtered.reduce((sum, item) => sum + safeNumber(item?.total || item?.finalTotal || 0), 0);
  if (totalEl) totalEl.textContent = formatCurrency(grandTotal);

  if (!visible.length) {
    body.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No sold products yet.</td></tr>`;
    return;
  }

  body.innerHTML = visible.map((item) => {
    const items = safeArray(item?.items);
    const qty = items.reduce((sum, row) => sum + safeNumber(row?.qty, 0), 0);
    const productNames = items.slice(0, 2).map((row) => row?.name || "Product").join(", ") + (items.length > 2 ? ` +${items.length - 2} more` : "");
    const dateLabel = item?.createdAt ? formatDateTime(item.createdAt) : "-";
    const total = safeNumber(item?.total || item?.finalTotal, 0);
    const discount = safeNumber(item?.discount, 0);
    const id = saleHistoryRecordId(item);
    const displayId = stringifyHistoryId(item?.invoiceId || item?.invoiceNumber || id, "-");
    return `
      <tr>
        <td data-label="Sale ID" class="fw-semibold">${String(displayId)}</td>
        <td data-label="Products">${productNames || "-"}</td>
        <td data-label="Qty">${qty}</td>
        <td data-label="Discount">${formatCurrency(discount)}</td>
        <td data-label="Total">${formatCurrency(total)}</td>
        <td data-label="Date">${dateLabel}</td>
        <td data-label="Actions" class="text-end text-nowrap">
          <button type="button" class="btn btn-sm btn-outline-danger" data-action="sale-delete" data-id="${id}" title="Delete"><i class="bi bi-trash3"></i></button>
        </td>
      </tr>`;
  }).join("");
}

function getProductKey(product) {
  return String(product?.firebaseKey || product?.id || product?.key || product?.productKey || "").trim();
}

function getProductCode(product) {
  return String(product?.productId || product?.sku || "").trim();
}

function getDisplayProductId(product) {
  return getProductCode(product) || getProductKey(product);
}

function getProductSaleStats(product) {
  const key = getProductKey(product);
  const productId = getDisplayProductId(product);
  const name = normalizeText(normalizeName(product));
  const history = safeArray(getSaleHistory());
  let soldQty = 0;
  let soldOrders = 0;
  let soldRevenue = 0;
  let lastSoldAt = 0;

  history.forEach((entry) => {
    const items = safeArray(entry?.items);
    const matched = items.filter((row) => {
      const rowKey = String(row?.productKey || row?.id || row?.key || "").trim();
      const rowId = String(row?.productId || row?.sku || "").trim();
      const rowName = normalizeText(String(row?.name || row?.productName || ""));
      return (key && (rowKey === key || rowId === key)) || (productId && (rowId === productId || rowKey === productId)) || (name && rowName === name);
    });
    if (!matched.length) return;
    soldOrders += 1;
    lastSoldAt = Math.max(lastSoldAt, safeNumber(entry?.createdAt ?? entry?.updatedAt ?? 0));
    matched.forEach((row) => {
      const qty = safeNumber(row?.qty ?? row?.quantity, 0);
      const price = safeNumber(row?.price ?? row?.unitPrice ?? 0);
      soldQty += qty;
      soldRevenue += qty * price;
    });
  });

  return { soldQty, soldOrders, soldRevenue, lastSoldAt };
}

async function addProductQuantity(productKey, amount) {
  const delta = Math.max(0, safeNumber(amount, 0));
  if (!delta) return;
  const product = getProductByKey(productKey);
  if (!product) return;
  const nextQty = safeNumber(product.quantity) + delta;
  await updateProduct(productKey, { quantity: nextQty, updatedAt: Date.now() });
  showToast(`Added ${delta} quantity to ${normalizeName(product) || "product"}`, "success", "Products");
  await loadProducts(false);
  renderAll();
}

function normalizeName(product) {
  return String(product?.name || product?.productName || "").trim();
}

function normalizeCategory(product) {
  return String(product?.category || product?.type || "").trim();
}

function getProductByKey(productKey) {
  const key = String(productKey || "").trim();
  if (!key) return null;
  return state.products.find((product) => getProductKey(product) === key) || null;
}

function getDeletedProducts() {
  return filterDeleted(state.products).slice().sort((a, b) => safeNumber(b?.deletedAt) - safeNumber(a?.deletedAt));
}

function productTrashWeekBucketStartEnd(date = new Date()) {
  const now = new Date(date);
  const day = now.getDay();
  const start = new Date(now);
  const diff = (day + 1) % 7;
  start.setDate(now.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function productTrashDateMatches(product = {}, filter = "week") {
  const deletedAt = safeNumber(product?.deletedAt);
  if (!deletedAt) return false;
  const dt = new Date(deletedAt);
  if (Number.isNaN(dt.getTime())) return false;
  const key = normalizeText(filter);
  if (key === "all") return true;
  if (key === "today") {
    const now = new Date();
    return dt.toDateString() === now.toDateString();
  }
  if (key === "month") {
    const now = new Date();
    return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
  }
  if (key === "year") {
    return dt.getFullYear() === new Date().getFullYear();
  }
  const { start, end } = productTrashWeekBucketStartEnd();
  return dt >= start && dt <= end;
}

function getVisibleDeletedProducts() {
  const category = state.trashCategory || "All Categories";
  const dateFilter = state.trashDateFilter || "week";
  const rows = state.trashRows || "5";
  let list = getDeletedProducts();
  list = list.filter((product) => productTrashDateMatches(product, dateFilter));
  if (category !== "All Categories") {
    list = list.filter((product) => normalizeCategory(product) === category);
  }
  if (rows !== "all") {
    list = list.slice(0, Math.max(1, safeNumber(rows, 5)));
  }
  return list;
}

function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function stringifyHistoryId(value, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") {
    return String(value?.id || value?.key || value?.invoiceId || value?.invoiceNumber || value?.saleId || value?.productKey || fallback);
  }
  return String(value);
}

async function hydrateCategoriesFromFirebase() {
  try {
    const remote = await getSettingValue("productCategories", null);
    const list = safeArray(remote?.items || remote || []);
    if (list.length) {
      localStorage.setItem(CATEGORY_STORE_KEY, JSON.stringify(list));
      populateCategoryOptions();
      renderCategoryManager();
    }
  } catch (error) {
    console.warn("Could not hydrate categories from Firebase:", error);
  }
}

async function persistCategoriesToFirebase(list) {
  try {
    await setSettingValue("productCategories", safeArray(list));
  } catch (error) {
    console.warn("Could not save categories to Firebase:", error);
  }
}


function getCategoryIcon(name) {
  return productCategoryMap.get(String(name || "").trim()) || "bi-box-seam";
}

function getCategoryDisplayIcon(name) {
  const value = String(name || "").trim();
  if (!value || value === "All Categories") return "bi-grid-3x3-gap";
  return getCategoryIcon(value);
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((item) => String(item || "").trim()).filter(Boolean)));
}

function ensureStoredCategories() {
  const defaults = productCategories.map((item) => item.name);
  try {
    const parsed = JSON.parse(localStorage.getItem(CATEGORY_STORE_KEY) || "null");
    const stored = Array.isArray(parsed) ? uniqueStrings(parsed) : [];
    const merged = uniqueStrings([...defaults, ...stored]);
    localStorage.setItem(CATEGORY_STORE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    localStorage.setItem(CATEGORY_STORE_KEY, JSON.stringify(defaults));
    return defaults;
  }
}

const categorySelectorInstances = [];

function refreshCategorySelectors() {
  categorySelectorInstances.forEach((instance) => instance.refresh?.());
}

function normalizeCategoryOptions(allowAll = false) {
  const categories = ensureStoredCategories();
  const unique = uniqueStrings(categories);
  return allowAll ? ["All Categories", ...unique.filter((item) => item !== "All Categories")] : unique;
}

function highlightCategoryText(text, query) {
  const safeText = String(text || "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
  const search = String(query || "").trim();
  if (!search) return safeText;
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escaped, "ig");
  return safeText.replace(regex, (match) => `<span class="category-highlight">${match}</span>`);
}

function setupCategorySelector(root, options = {}) {
  if (!root) return null;
  const trigger = root.querySelector(".category-trigger");
  const panel = root.querySelector("[data-category-panel]");
  const searchInput = root.querySelector("[data-category-search]");
  const list = root.querySelector("[data-category-list]");
  if (!trigger || !panel || !searchInput || !list) return null;

  const allowAll = Boolean(options.allowAll);
  const placeholder = options.placeholder || (allowAll ? "All Categories" : "Choose category");
  const onChange = typeof options.onChange === "function" ? options.onChange : () => {};
  let activeIndex = -1;
  let visibleOptions = [];
  let isOpen = false;
  let currentValue = String(trigger.value || "").trim();

  function setTriggerValue(value, notify = true) {
    currentValue = String(value || "").trim();
    if (!currentValue && allowAll) currentValue = "All Categories";
    trigger.value = currentValue || "";
    trigger.placeholder = placeholder;
    trigger.dataset.value = currentValue;
    trigger.classList.toggle("text-muted", !currentValue);
    if (notify) onChange(currentValue || (allowAll ? "All Categories" : ""));
  }

  function renderList(query = "") {
    const items = normalizeCategoryOptions(allowAll);
    const normalizedQuery = String(query || "").trim().toLowerCase();
    visibleOptions = items.filter((item) => !normalizedQuery || normalizeText(item).includes(normalizedQuery));
    if (!visibleOptions.length) {
      list.innerHTML = `
        <div class="category-empty">
          <i class="bi bi-search"></i>
          <div class="fw-semibold">No categories found</div>
        </div>`;
      activeIndex = -1;
      return;
    }

    list.innerHTML = visibleOptions.map((name, index) => `
      <button type="button" class="category-option ${index === activeIndex ? "active" : ""}" data-category-value="${String(name).replace(/[&<>"']/g, (ch) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[ch]))}" role="option" aria-selected="${index === activeIndex ? "true" : "false"}">
        <span class="category-icon"><i class="bi ${name === "All Categories" ? "bi-grid-3x3-gap" : getCategoryIcon(name)}"></i></span>
        <span class="category-option-title">${highlightCategoryText(name, normalizedQuery)}</span>
      </button>
    `).join("");
    syncActiveOption();
  }

  function syncActiveOption() {
    Array.from(list.querySelectorAll(".category-option")).forEach((item, index) => {
      item.classList.toggle("active", index === activeIndex);
      item.setAttribute("aria-selected", index === activeIndex ? "true" : "false");
      if (index === activeIndex) item.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }

  function openDropdown() {
    if (isOpen) return;
    isOpen = true;
    panel.classList.remove("d-none");
    trigger.setAttribute("aria-expanded", "true");
    searchInput.value = "";
    activeIndex = -1;
    renderList("");
    window.requestAnimationFrame(() => searchInput.focus());
  }

  function closeDropdown({ focusTrigger = false } = {}) {
    if (!isOpen) return;
    isOpen = false;
    panel.classList.add("d-none");
    trigger.setAttribute("aria-expanded", "false");
    activeIndex = -1;
    if (focusTrigger) trigger.focus();
  }

  function selectValue(value) {
    setTriggerValue(value);
    closeDropdown();
  }

  function moveActive(step) {
    if (!visibleOptions.length) return;
    activeIndex = (activeIndex + step + visibleOptions.length) % visibleOptions.length;
    syncActiveOption();
  }

  trigger.addEventListener("click", () => {
    if (isOpen) closeDropdown();
    else openDropdown();
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDropdown();
    }
  });

  searchInput.addEventListener("input", () => {
    activeIndex = -1;
    renderList(searchInput.value);
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) openDropdown();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) openDropdown();
      moveActive(-1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const chosen = visibleOptions[activeIndex] || visibleOptions[0];
      if (chosen) selectValue(chosen);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeDropdown({ focusTrigger: true });
    }
  });

  list.addEventListener("click", (event) => {
    const item = event.target instanceof HTMLElement ? event.target.closest("[data-category-value]") : null;
    if (!item) return;
    selectValue(item.getAttribute("data-category-value") || "");
  });

  document.addEventListener("click", (event) => {
    if (!root.contains(event.target)) closeDropdown();
  });

  setTriggerValue(currentValue, false);
  renderList("");
  const instance = {
    refresh() {
      const selected = String(trigger.dataset.value || trigger.value || "").trim();
      setTriggerValue(selected, false);
      renderList(searchInput.value || "");
    },
    setValue(value) {
      setTriggerValue(value, false);
      renderList(searchInput.value || "");
    },
    getValue() {
      return String(trigger.dataset.value || trigger.value || "").trim();
    },
    open: openDropdown,
    close: closeDropdown
  };
  categorySelectorInstances.push(instance);
  return instance;
}

function populateCategoryOptions() {
  refreshCategorySelectors();
}

function getStoredCategories() {
  return ensureStoredCategories().slice();
}

function saveStoredCategories(list) {
  const unique = Array.from(new Set((Array.isArray(list) ? list : []).map((item) => String(item || "").trim()).filter(Boolean)));
  localStorage.setItem(CATEGORY_STORE_KEY, JSON.stringify(unique));
  populateCategoryOptions();
  renderCategoryManager();
}

function renderCategoryManager() {
  const body = document.getElementById("categoryManagerBody");
  const input = document.getElementById("categoryManagerInput");
  if (!body) return;
  const categories = getStoredCategories();
  if (!categories.length) {
    body.innerHTML = '<div class="text-muted small">No categories yet.</div>';
    return;
  }
  body.innerHTML = categories.map((category, index) => `
    <div class="d-flex align-items-center justify-content-between gap-2 border rounded-3 p-2 mb-2">
      <div class="fw-semibold">${category}</div>
      <div class="btn-group btn-group-sm">
        <button class="btn btn-outline-success" type="button" data-cat-action="edit" data-cat-index="${index}"><i class="bi bi-pencil-square"></i></button>
        <button class="btn btn-outline-danger" type="button" data-cat-action="delete" data-cat-index="${index}"><i class="bi bi-trash3"></i></button>
      </div>
    </div>`).join("");
  if (input) input.value = "";
}

function openCategoryManager() {
  renderCategoryManager();
  openBootstrapModal(document.getElementById("categoryManagerModal"))?.show();
}

function addCategoryFromManager() {
  const input = document.getElementById("categoryManagerInput");
  const value = String(input?.value || "").trim();
  if (!value) return;
  const categories = getStoredCategories();
  categories.push(value);
  saveStoredCategories(categories);
  renderCategoryManager();
  showToast(`Category ${value} added`, "success", "Category");
}

function updateSaleHistory(entry) {
  const list = safeArray(JSON.parse(localStorage.getItem(SALE_HISTORY_KEY) || "[]"));
  list.unshift({ ...entry, id: entry.id || Date.now() });
  localStorage.setItem(SALE_HISTORY_KEY, JSON.stringify(list.slice(0, 200)));
}

async function completeCartTransaction(mode = "sell", button = null) {
  const cart = getCart();
  if (!cart.length) {
    showToast("Cart is empty", "warning", "Cart");
    return;
  }
  const productsByKey = new Map(filterActive(state.products).map((p) => [getProductKey(p), p]));
  const items = cart.map((item) => {
    const product = productsByKey.get(String(item.id));
    const qty = Math.max(1, safeNumber(item.qty, 1));
    const price = safeNumber(item.price ?? product?.price ?? 0);
    return {
      productKey: String(item.id),
      productId: String(product?.id || product?.productId || item.id),
      name: normalizeName(product) || item.name || "Product",
      qty,
      price,
      category: normalizeCategory(product)
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  const discount = Math.min(getCartDiscount(), subtotal);
  const finalTotal = Math.max(0, subtotal - discount);
  const editingSaleId = state.editSaleId ? String(state.editSaleId) : "";
  const payload = {
    invoiceNumber: editingSaleId ? `SALE-${editingSaleId}` : `SALE-${Date.now().toString(36).toUpperCase()}`,
    customerName: mode === "sell" ? "Direct Sale" : "Invoice",
    customerPhone: "",
    invoiceType: mode === "sell" ? "Direct Sale" : "Invoice",
    paymentStatus: "paid",
    subtotal,
    discount,
    paidAmount: finalTotal,
    balance: 0,
    finalTotal,
    items,
    notes: mode === "sell" ? "Quick sale from cart" : "Cart invoice",
    createdAt: editingSaleId ? safeNumber(state.editSaleCreatedAt, Date.now()) : Date.now(),
    updatedAt: Date.now(),
    deleted: false,
    isDeleted: false
  };

  setSaveButtonLoading(true, state.editSaleId ? "update" : (mode === "sell" ? "sell" : "save"));
  if (button) {
    button.disabled = true;
    button.dataset.originalHtml = button.innerHTML;
    button.innerHTML = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${mode === "sell" ? "Selling..." : "Saving..."}`;
  }
  try {
    let id = editingSaleId;
    if (editingSaleId) {
      await updateInvoiceRecord(editingSaleId, payload);
    } else {
      id = await addInvoice(payload);
    }
    upsertSaleHistory({ id, invoiceId: id, invoiceNumber: payload.invoiceNumber, total: finalTotal, discount, items, createdAt: payload.createdAt, updatedAt: Date.now(), mode });
    state.editSaleId = null;
    state.editSaleCreatedAt = null;
    await clearCart({ restoreStock: false });
    clearStoredCartDiscount();
    renderSaleHistory();
    await loadProducts(false);
    renderAll();
    syncHeaderCartCount();
    showToast(`${state.editSaleId ? "Updated sale" : (mode === "sell" ? "Sold" : "Invoice saved")} successfully • ${formatCurrency(finalTotal)}`, "success", state.editSaleId ? "Sale" : (mode === "sell" ? "Sale" : "Invoice"));
    openBootstrapModal(nodes.cartModal)?.hide();
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not save transaction", "error", "Cart");
  } finally {
    if (button) {
      button.disabled = false;
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
    }
    setSaveButtonLoading(false);
  }
}

function cartCount() {
  return getCart().reduce((sum, item) => sum + safeNumber(item.qty, 0), 0);
}

function syncCartBadgeCount() {
  const count = cartCount();
  localStorage.setItem(CART_COUNT_KEY, String(count));
  if (nodes.cartBadge) {
    nodes.cartBadge.textContent = String(count);
    nodes.cartBadge.style.display = count > 0 ? "inline-flex" : "none";
  }
  if (nodes.cartItemCountPill) {
    nodes.cartItemCountPill.innerHTML = `<i class="bi bi-cart3"></i> ${count} items`;
  }
}

function syncHeaderCartCount() {
  syncCartBadgeCount();
  window.dispatchEvent(new CustomEvent("app:cart-changed", { detail: { count: cartCount() } }));
}


function collectFilters() {
  return {
    category: document.getElementById("productCategoryFilter")?.value || "All Categories",
    stock: document.getElementById("productStockFilter")?.value || "All Stock",
    sort: document.getElementById("productSortFilter")?.value || "Sort By"
  };
}


function productMatches(product, query) {
  if (!query) return true;
  const haystack = [
    normalizeName(product),
    getDisplayProductId(product),
    getProductKey(product),
    normalizeCategory(product),
    String(product?.notes || ""),
    String(product?.status || "")
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

function stockLabel(product) {
  const qty = safeNumber(product?.quantity);
  const threshold = safeNumber(product?.lowStockThreshold, PRODUCT_LOW_STOCK);
  const important = Boolean(product?.important || product?.isImportant);
  if (qty <= 0) return { label: "Out of Stock", className: "bg-danger" };
  if (qty <= threshold) return { label: "Low Stock", className: "bg-danger" };
  if (important) return { label: "Important", className: "bg-warning text-dark" };
  if (qty <= threshold + 5) return { label: "Near Low", className: "bg-secondary" };
  return { label: "In Stock", className: "bg-success" };
}

function getFilteredProducts() {
  const query = normalizeText(state.query);
  const { category, stock, sort } = collectFilters();

  let list = filterActive(state.products).filter((product) => {
    if (!productMatches(product, query)) return false;
    if (category !== "All Categories" && normalizeCategory(product) !== category) return false;

    const qty = safeNumber(product?.quantity);
    const threshold = safeNumber(product?.lowStockThreshold, PRODUCT_LOW_STOCK);
    const label = stockLabel(product).label;
    if (stock === "In Stock" && qty <= threshold) return false;
    if (stock === "Low Stock" && label !== "Low Stock") return false;
    if (stock === "Out of Stock" && qty > 0) return false;
    return true;
  });

  switch (sort) {
    case "Name":
      list.sort((a, b) => normalizeName(a).localeCompare(normalizeName(b)));
      break;
    case "Price":
      list.sort((a, b) => safeNumber(a?.price) - safeNumber(b?.price));
      break;
    case "Quantity":
      list.sort((a, b) => safeNumber(b?.quantity) - safeNumber(a?.quantity));
      break;
    case "Recent":
      list.sort((a, b) => safeNumber(b?.createdAt) - safeNumber(a?.createdAt));
      break;
    default:
      break;
  }

  return list;
}

function getAddModalFields() {
  return {
    name: document.getElementById("productName"),
    id: document.getElementById("productId"),
    category: document.getElementById("productCategory"),
    price: document.getElementById("productPrice"),
    originalPrice: document.getElementById("productOriginalPrice"),
    quantity: document.getElementById("productQuantity"),
    threshold: document.getElementById("productThreshold"),
    important: document.getElementById("productImportant"),
    notes: document.getElementById("productNotes")
  };
}

function generateProductId() {
  return `PRD-${Date.now().toString().slice(-6)}`;
}

function setSaveButtonLoading(isLoading, mode = "save") {
  if (!nodes.addModalSaveBtn) return;
  if (isLoading) {
    nodes.addModalSaveBtn.disabled = true;
    nodes.addModalSaveBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>${mode === "update" ? "Updating..." : "Saving..."}`;
    return;
  }
  nodes.addModalSaveBtn.disabled = false;
  nodes.addModalSaveBtn.innerHTML = state.editKey
    ? '<i class="bi bi-check2-circle me-1"></i> Update Product'
    : '<i class="bi bi-save me-1"></i> Save Product';
}

function openBootstrapModal(node) {
  return node ? window.bootstrap?.Modal.getOrCreateInstance(node) || null : null;
}

function closeCategoryPanels() {
  document.querySelectorAll("[data-category-selector]").forEach((root) => {
    const panel = root.querySelector("[data-category-panel]");
    const trigger = root.querySelector(".category-trigger");
    panel?.classList.add("d-none");
    trigger?.setAttribute("aria-expanded", "false");
  });
}

function openCartModal() {
  if (!nodes.cartModal) return;
  closeCategoryPanels();
  if (nodes.cartModalTitle) {
    nodes.cartModalTitle.textContent = state.editSaleId ? "Update Sell" : "Cart Preview";
  }
  if (nodes.cartModalSellBtn) {
    nodes.cartModalSellBtn.innerHTML = state.editSaleId
      ? '<i class="bi bi-pencil-square me-1"></i> Update Sell'
      : '<i class="bi bi-cash-coin me-1"></i> Sell';
  }
  if (nodes.cartDiscountInput) {
    const stored = safeNumber(localStorage.getItem(CART_DISCOUNT_KEY), 0);
    if (!nodes.cartDiscountInput.value) nodes.cartDiscountInput.value = String(stored || 0);
  }
  renderCart();
  openBootstrapModal(nodes.cartModal)?.show();
}

async function updateInvoiceRecord(id, payload) {
  const fn = typeof updateInvoice === "function" ? updateInvoice : window.ShopDatabase?.updateInvoice;
  if (typeof fn !== "function") throw new Error("updateInvoice is not available");
  return fn(id, payload);
}

function openDeleteConfirmModal(product) {
  if (!nodes.deleteConfirmModal || !product) return;
  state.pendingDeleteKey = getProductKey(product);
  if (nodes.deleteConfirmTitle) nodes.deleteConfirmTitle.textContent = normalizeName(product) || "Delete Product";
  if (nodes.deleteConfirmBody) {
    nodes.deleteConfirmBody.innerHTML = `
      <div class="border rounded-4 p-3 bg-body-tertiary">
        <div class="d-flex align-items-center gap-3 mb-3">
          <div class="rounded-4 d-flex align-items-center justify-content-center bg-danger-subtle text-danger" style="width:56px;height:56px;">
            <i class="bi bi-trash3-fill fs-4"></i>
          </div>
          <div>
            <div class="fw-bold fs-5">${normalizeName(product) || "Untitled Product"}</div>
            <div class="text-muted small">${normalizeCategory(product) || "Uncategorized"}</div>
          </div>
        </div>
        <div class="row g-2 small">
          <div class="col-6"><div class="p-2 rounded-3 bg-white border"><div class="text-muted">Product ID</div><div class="fw-semibold">${getDisplayProductId(product) || "-"}</div></div></div>
          <div class="col-6"><div class="p-2 rounded-3 bg-white border"><div class="text-muted">Quantity</div><div class="fw-semibold">${safeNumber(product?.quantity)}</div></div></div>
          <div class="col-6"><div class="p-2 rounded-3 bg-white border"><div class="text-muted">Price</div><div class="fw-semibold">${formatCurrency(safeNumber(product?.price))}</div></div></div>
          <div class="col-6"><div class="p-2 rounded-3 bg-white border"><div class="text-muted">Status</div><div class="fw-semibold">${stockLabel(product).label}</div></div></div>
        </div>
      </div>
    `;
  }
  openBootstrapModal(nodes.deleteConfirmModal)?.show();
}

function closeDeleteConfirmModal() {
  state.pendingDeleteKey = null;
  window.bootstrap?.Modal.getInstance(nodes.deleteConfirmModal)?.hide();
}

function renderCards() {
  if (!nodes.cardGrid) return;
  const list = getFilteredProducts();
  if (!list.length) {
    nodes.cardGrid.innerHTML = `
      <div class="col-12">
        <div class="p-4 text-center border rounded-4 bg-body-tertiary">
          <i class="bi bi-box-seam fs-1 d-block mb-2"></i>
          <div class="fw-bold mb-1">No products found</div>
          <div class="text-muted">Try another search or add your first product.</div>
        </div>
      </div>`;
    return;
  }

  nodes.cardGrid.innerHTML = list.map((product) => {
    const stock = stockLabel(product);
    const price = formatCurrency(safeNumber(product?.price));
    const qty = safeNumber(product?.quantity);
    const key = getProductKey(product);
    const idLabel = getDisplayProductId(product);
    const name = normalizeName(product);
    const category = normalizeCategory(product);
    const icon = product?.icon || getCategoryDisplayIcon(category);
    return `
      <div class="col-12 col-md-6 col-xl-4">
        <div class="product-card h-100">
          <div class="product-image">
            <span class="badge ${stock.className} stock-badge">${stock.label}</span>
            <i class="bi ${icon}"></i>
          </div>
          <div class="product-body">
            <div class="product-title">${name || "Untitled Product"}</div>
            <div class="product-meta mb-2"><span class="product-category-chip"><i class="bi ${getCategoryDisplayIcon(category)}"></i> ${category || "Uncategorized"}</span> • ID: ${idLabel || "-"}</div>
            <div class="d-flex align-items-center justify-content-between">
              <div class="product-price">${price}</div>
              <span class="status-pill ${qty <= PRODUCT_LOW_STOCK ? 'bg-soft-danger text-danger-soft' : 'bg-soft-success text-success-soft'}">Qty: ${qty}</span>
            </div>
          </div>
          <div class="product-footer">
            <div class="d-grid gap-2">
              <button class="btn btn-primary action-btn" data-action="add" data-id="${key}"><i class="bi bi-cart-plus me-1"></i> Add to Shop</button>
              <div class="row g-2">
                <div class="col-4"><button class="btn btn-outline-secondary w-100 action-btn" data-action="view" data-id="${key}"><i class="bi bi-eye"></i></button></div>
                <div class="col-4"><button class="btn btn-outline-success w-100 action-btn" data-action="edit" data-id="${key}"><i class="bi bi-pencil-square"></i></button></div>
                <div class="col-4"><button class="btn btn-outline-danger w-100 action-btn" data-action="delete" data-id="${key}"><i class="bi bi-trash3"></i></button></div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }).join("");
}



function collectNodes() {
  nodes.searchInputs = Array.from(document.querySelectorAll('input[type="search"]'));
  nodes.cardGrid = document.getElementById("productCardsGrid");
  nodes.productTableBody = document.getElementById("productTableBody");
  nodes.cartTableBody = document.getElementById("cartTableBody");
  nodes.trashTableBody = document.getElementById("trashTableBody");
  nodes.addModal = document.getElementById("addProductModal");
  nodes.addModalTitle = document.getElementById("productModalTitle");
  nodes.addModalSaveBtn = document.getElementById("saveProductBtn");
  nodes.cartModal = document.getElementById("cartModal");
  nodes.cartModalSaveBtn = document.getElementById("cartSaveBtn");
  nodes.cartModalInvoiceBtn = document.getElementById("cartInvoiceBtn");
  nodes.cartModalSellBtn = document.getElementById("cartSellBtn");
  nodes.trashModal = document.getElementById("trashModal");
  nodes.trashFilterCategory = document.getElementById("trashFilterCategory");
  nodes.trashDateFilter = document.getElementById("trashDateFilter");
  nodes.trashFilterRows = document.getElementById("trashFilterRows");
  nodes.deleteConfirmModal = document.getElementById("deleteConfirmModal");
  nodes.deleteConfirmTitle = document.getElementById("deleteConfirmTitle");
  nodes.deleteConfirmBody = document.getElementById("deleteConfirmBody");
  nodes.deleteConfirmBtn = document.getElementById("deleteConfirmBtn");
  nodes.deleteForeverBtn = document.getElementById("deleteForeverBtn");
  nodes.productRowsFilter = document.getElementById("productRowsFilter");
  nodes.summaryTotalProducts = document.getElementById("summaryTotalProducts");
  nodes.summaryLowStockProducts = document.getElementById("summaryLowStockProducts");
  nodes.summaryImportantProducts = document.getElementById("summaryImportantProducts");
  nodes.summaryRecycleBinCount = document.getElementById("summaryRecycleBinCount");
  nodes.summarySoldTodayProducts = document.getElementById("summarySoldTodayProducts");
  nodes.summaryPaidTodayAmount = document.getElementById("summaryPaidTodayAmount");
  nodes.summaryRemainingTodayAmount = document.getElementById("summaryRemainingTodayAmount");
  nodes.saleHistoryDateFilter = document.getElementById("saleHistoryDateFilter");
  nodes.saleHistoryRowsFilter = document.getElementById("saleHistoryRowsFilter");
  nodes.cartBadge = document.getElementById("cartBadge");
  nodes.cartItemCountPill = document.getElementById("cartItemCountPill");
  nodes.cartSubtotal = document.getElementById("cartSubtotal");
  nodes.cartDiscount = document.getElementById("cartDiscount");
  nodes.cartFinalTotal = document.getElementById("cartFinalTotal");
  nodes.cartDiscountInput = document.getElementById("cartDiscountInput");
  nodes.cartModalTitle = document.getElementById("cartModalTitle");
  nodes.restockQueueShell = document.getElementById("restockQueueShell");
  nodes.restockQueueBody = document.getElementById("restockQueueBody");
  nodes.restockQueueCount = document.getElementById("restockQueueCount");
  nodes.toggleRestockQueueBtn = document.getElementById("toggleRestockQueueBtn");
  nodes.restockDetailModal = document.getElementById("restockDetailModal");
  nodes.restockDetailTitle = document.getElementById("restockDetailTitle");
  nodes.restockDetailBody = document.getElementById("restockDetailBody");
  nodes.filterCategorySelector = document.querySelector('[data-category-selector="filter"]');
  nodes.productCategorySelector = document.querySelector('[data-category-selector="product"]');
  nodes.productStockFilter = document.getElementById("productStockFilter");
  nodes.productSortFilter = document.getElementById("productSortFilter");
  nodes.filterSelects = [nodes.productStockFilter, nodes.productSortFilter].filter(Boolean);
}

function renderCartButtonCount() {
  syncCartBadgeCount();
  renderNotificationMenu?.();
}

function renderTable() {
  if (!nodes.productTableBody) return;
  const list = getFilteredProducts();
  const limit = state.productRows === "all" ? list.length : Math.max(1, safeNumber(state.productRows, 5));
  const rows = state.productRows === "all" ? list : list.slice(0, limit);
  if (!rows.length) {
    nodes.productTableBody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">No products found.</td></tr>`;
    return;
  }

  nodes.productTableBody.innerHTML = rows.map((product) => {
    const stock = stockLabel(product);
    const price = formatCurrency(safeNumber(product?.price));
    const qty = safeNumber(product?.quantity);
    const key = getProductKey(product);
    const name = normalizeName(product);
    const category = normalizeCategory(product);
    const idLabel = getDisplayProductId(product);
    return `
      <tr>
        <td class="fw-semibold">${name || "-"}</td>
        <td><span class="product-category-chip"><i class="bi ${getCategoryDisplayIcon(category)}"></i> ${category || "-"}</span></td>
        <td>${idLabel || "-"}</td>
        <td>${price}</td>
        <td>${qty}</td>
        <td><span class="badge ${stock.className} status-pill">${stock.label}</span></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1" data-action="add" data-id="${key}"><i class="bi bi-cart-plus"></i></button>
          <button class="btn btn-sm btn-outline-success me-1" data-action="edit" data-id="${key}"><i class="bi bi-pencil-square"></i></button>
          <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${key}"><i class="bi bi-trash3"></i></button>
        </td>
      </tr>`;
  }).join("");
}

function getTodayRangeStart() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
}

function formatRestockDateTime(value) {
  const ts = safeNumber(value);
  if (!Number.isFinite(ts) || ts <= 0) return "-";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "-";
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  const day = String(date.getDate()).padStart(2, "0");
  const month = date.toLocaleDateString(undefined, { month: "short" });
  const year = date.getFullYear();
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${weekday}/${day}/${month}/${year} ${time}`;
}

function getRestockStatus(product = {}) {
  const qty = safeNumber(product?.quantity);
  const threshold = safeNumber(product?.lowStockThreshold, PRODUCT_LOW_STOCK);
  if (qty <= 0) return { key: "out", label: "Out of stock", className: "bg-soft-danger text-danger-soft" };
  if (qty <= threshold) return { key: "low", label: "Low stock", className: "bg-soft-warning text-warning-soft" };
  if (qty <= threshold + 2) return { key: "near", label: "Near low", className: "bg-soft-info text-info-soft" };
  return { key: "ok", label: "In stock", className: "bg-soft-success text-success-soft" };
}

function getRestockHitTimestamp(product = {}) {
  return safeNumber(product?.lowStockHitAt || product?.stockAlertAt || product?.updatedAt || product?.createdAt || Date.now());
}

function getTodaySalesSummary() {
  const since = getTodayRangeStart();
  const history = getSaleHistory().filter((item) => safeNumber(item?.createdAt) >= since);
  const soldQty = history.reduce((sum, item) => {
    const items = safeArray(item?.items);
    return sum + items.reduce((inner, row) => inner + safeNumber(row?.qty, 0), 0);
  }, 0);
  const paidMoney = history.reduce((sum, item) => sum + safeNumber(item?.paidAmount ?? item?.paid ?? item?.total ?? item?.finalTotal ?? 0), 0);
  const remainingMoney = history.reduce((sum, item) => sum + safeNumber(item?.remaining ?? item?.balance ?? item?.dueAmount ?? item?.due ?? 0), 0);
  return { soldQty, paidMoney, remainingMoney };
}

function renderSummaryCards() {

  const active = filterActive(state.products);
  const deleted = filterDeleted(state.products);
  const totalProducts = active.length;
  const lowStockProducts = active.filter((item) => safeNumber(item?.quantity) <= safeNumber(item?.lowStockThreshold, PRODUCT_LOW_STOCK)).length;
  const importantProducts = active.filter((item) => Boolean(item?.important || item?.isImportant)).length;
  const salesSummary = getTodaySalesSummary();
  if (nodes.summaryTotalProducts) nodes.summaryTotalProducts.textContent = String(totalProducts);
  if (nodes.summaryLowStockProducts) nodes.summaryLowStockProducts.textContent = String(lowStockProducts);
  if (nodes.summaryImportantProducts) nodes.summaryImportantProducts.textContent = String(importantProducts);
  if (nodes.summaryRecycleBinCount) nodes.summaryRecycleBinCount.textContent = String(deleted.length);
  if (nodes.summarySoldTodayProducts) nodes.summarySoldTodayProducts.textContent = String(salesSummary.soldQty);
  if (nodes.summaryPaidTodayAmount) nodes.summaryPaidTodayAmount.textContent = formatCurrency(salesSummary.paidMoney);
  if (nodes.summaryRemainingTodayAmount) nodes.summaryRemainingTodayAmount.textContent = formatCurrency(salesSummary.remainingMoney);
}

function getRestockProducts() {
  return filterActive(state.products)
    .filter((item) => getRestockStatus(item).key !== "ok")
    .sort((a, b) => {
      const order = { out: 0, low: 1, near: 2, ok: 3 };
      const byStatus = order[getRestockStatus(a).key] - order[getRestockStatus(b).key];
      if (byStatus !== 0) return byStatus;
      const byQty = safeNumber(a?.quantity) - safeNumber(b?.quantity);
      if (byQty !== 0) return byQty;
      return safeNumber(b?.createdAt) - safeNumber(a?.createdAt);
    });
}

function openRestockDetailModal(product) {
  if (!product || !nodes.restockDetailModal) return;

  const name = normalizeName(product) || "Untitled Product";
  const category = normalizeCategory(product) || "Uncategorized";
  const price = formatCurrency(safeNumber(product?.price));
  const originalPrice = formatCurrency(safeNumber(product?.originalPrice ?? product?.buyingPrice ?? product?.costPrice));
  const quantity = safeNumber(product?.quantity);
  const threshold = safeNumber(product?.lowStockThreshold, PRODUCT_LOW_STOCK);
  const stock = stockLabel(product);
  const productId = getDisplayProductId(product) || "-";
  const productKey = getProductKey(product);
  const notes = String(product?.notes || "").trim() || "No notes added.";
  const updatedAt = formatDateTime(product?.updatedAt || product?.createdAt || Date.now());
  const createdAt = formatDateTime(product?.createdAt || product?.updatedAt || Date.now());
  const stats = getProductSaleStats(product);
  const lastSoldAt = stats.lastSoldAt ? formatDateTime(stats.lastSoldAt) : "Never sold";
  const totalStockValue = formatCurrency(safeNumber(product?.price) * quantity);

  if (nodes.restockDetailTitle) nodes.restockDetailTitle.textContent = name;
  if (nodes.restockDetailBody) {
    nodes.restockDetailBody.innerHTML = `
      <div class="row g-3">
        <div class="col-12">
          <div class="p-3 rounded-4 border bg-body-tertiary">
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-3">
              <div>
                <div class="fw-bold fs-4 mb-1">${name}</div>
                <div class="text-muted small">${category} • ID: ${productId}</div>
              </div>
              <span class="badge ${stock.className} rounded-pill px-3 py-2">${stock.label}</span>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-6">
          <div class="p-3 rounded-4 border h-100">
            <div class="fw-semibold mb-3">Product information</div>
            <div class="detail-grid">
              <div class="detail-row"><div class="detail-label">Product</div><div class="detail-value">${name}</div></div>
              <div class="detail-row"><div class="detail-label">Category</div><div class="detail-value">${category}</div></div>
              <div class="detail-row"><div class="detail-label">Product ID</div><div class="detail-value">${productId}</div></div>
              <div class="detail-row"><div class="detail-label">Price</div><div class="detail-value">${price}</div></div>
              <div class="detail-row"><div class="detail-label">Original Price</div><div class="detail-value">${originalPrice}</div></div>
              <div class="detail-row"><div class="detail-label">Current Quantity</div><div class="detail-value">${quantity}</div></div>
              <div class="detail-row"><div class="detail-label">Low Stock Threshold</div><div class="detail-value">${threshold}</div></div>
              <div class="detail-row"><div class="detail-label">Stock Value</div><div class="detail-value">${totalStockValue}</div></div>
              <div class="detail-row"><div class="detail-label">Created</div><div class="detail-value">${createdAt}</div></div>
              <div class="detail-row"><div class="detail-label">Last Updated</div><div class="detail-value">${updatedAt}</div></div>
            </div>
          </div>
        </div>

        <div class="col-12 col-lg-6">
          <div class="p-3 rounded-4 border h-100">
            <div class="fw-semibold mb-3">Sales information</div>
            <div class="detail-grid">
              <div class="detail-row"><div class="detail-label">Total sold quantity</div><div class="detail-value">${stats.soldQty}</div></div>
              <div class="detail-row"><div class="detail-label">Total sale orders</div><div class="detail-value">${stats.soldOrders}</div></div>
              <div class="detail-row"><div class="detail-label">Sales revenue</div><div class="detail-value">${formatCurrency(stats.soldRevenue)}</div></div>
              <div class="detail-row"><div class="detail-label">Last sold</div><div class="detail-value">${lastSoldAt}</div></div>
              <div class="detail-row"><div class="detail-label">Important</div><div class="detail-value">${product?.important || product?.isImportant ? 'Yes' : 'No'}</div></div>
              <div class="detail-row"><div class="detail-label">Notes</div><div class="detail-value">${notes}</div></div>
            </div>
          </div>
        </div>

        <div class="col-12">
          <div class="p-3 rounded-4 border bg-body-tertiary">
            <div class="d-flex flex-wrap align-items-end gap-2">
              <div class="flex-grow-1">
                <label for="productAddQtyInput" class="form-label fw-semibold mb-1">Add quantity</label>
                <input id="productAddQtyInput" type="number" min="1" value="1" class="form-control rounded-4" placeholder="1" />
              </div>
              <button type="button" class="btn btn-primary rounded-4" data-action="product-stock-add" data-id="${productKey}">
                <i class="bi bi-plus-circle me-1"></i>Add Quantity
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  openBootstrapModal(nodes.restockDetailModal)?.show();
}

function renderRestockQueue() {
  if (!nodes.restockQueueBody) return;
  const list = getRestockProducts();
  const count = list.length;

  if (nodes.restockQueueCount) {
    nodes.restockQueueCount.textContent = `${count} item${count === 1 ? "" : "s"}`;
  }

  if (nodes.toggleRestockQueueBtn) {
    nodes.toggleRestockQueueBtn.setAttribute("aria-expanded", state.restockCollapsed ? "false" : "true");
    nodes.toggleRestockQueueBtn.title = state.restockCollapsed ? "Show restock list" : "Hide restock list";
    nodes.toggleRestockQueueBtn.innerHTML = state.restockCollapsed
      ? '<i class="bi bi-chevron-down"></i>'
      : '<i class="bi bi-chevron-up"></i>';
  }

  if (!count) {
    nodes.restockQueueBody.innerHTML = `
      <div class="restock-empty">
        <i class="bi bi-check2-circle fs-3 d-block mb-1"></i>
        <div class="fw-bold">No products need restocking right now</div>
        <div class="small">Everything looks fine for the moment.</div>
      </div>`;
    nodes.restockQueueShell?.classList.toggle("is-collapsed", Boolean(state.restockCollapsed));
    return;
  }

  nodes.restockQueueBody.innerHTML = list.map((product) => {
    const name = normalizeName(product) || "Untitled Product";
    const category = normalizeCategory(product) || "Uncategorized";
    const key = getProductKey(product);
    const qty = safeNumber(product?.quantity);
    const threshold = safeNumber(product?.lowStockThreshold, PRODUCT_LOW_STOCK);
    const stock = getRestockStatus(product);
    const idLabel = getDisplayProductId(product) || "-";
    const price = formatCurrency(safeNumber(product?.price || 0));
    const hitDate = formatRestockDateTime(getRestockHitTimestamp(product));
    const categoryIcon = getCategoryDisplayIcon(category);
    return `
      <div class="restock-item">
        <div class="restock-item-main">
          <div class="restock-item-title">${name}</div>
          <div class="restock-item-top">
            <span class="tag-pill restock-category-chip"><i class="bi ${categoryIcon}"></i>${category}</span>
            <span class="tag-pill"><i class="bi bi-upc-scan"></i>${idLabel}</span>
            <span class="tag-pill"><i class="bi bi-cash-coin"></i>${price}</span>
            <span class="tag-pill ${stock.className}">${stock.label}</span>
          </div>
          <div class="restock-item-subline">
            <span><i class="bi bi-clock-history me-1"></i>Hit: ${hitDate}</span>
            <span><i class="bi bi-bag-check me-1"></i>${qty <= 0 ? "Re-stock now" : "Need refill soon"}</span>
            <span><i class="bi bi-box-seam me-1"></i>Threshold ${threshold}</span>
          </div>
        </div>
        <div class="restock-item-side">
          <span class="restock-qty-pill ${qty <= 0 ? "bg-soft-danger text-danger-soft" : qty <= threshold ? "bg-soft-warning text-warning-soft" : "bg-soft-info text-info-soft"}">Qty ${qty} / ${threshold}</span>
          <button class="btn btn-outline-primary restock-eye-btn" data-action="restock-view" data-id="${key}" type="button" title="View full details">
            <i class="bi bi-eye"></i>
          </button>
        </div>
      </div>`;
  }).join("");

  nodes.restockQueueShell?.classList.toggle("is-collapsed", Boolean(state.restockCollapsed));
}

function updateCartTotals(subtotal, discount, finalTotal) {
  if (nodes.cartSubtotal) nodes.cartSubtotal.textContent = formatCurrency(subtotal);
  if (nodes.cartDiscount) nodes.cartDiscount.textContent = formatCurrency(discount);
  if (nodes.cartFinalTotal) nodes.cartFinalTotal.textContent = formatCurrency(finalTotal);
  if (nodes.cartDiscountInput && document.activeElement !== nodes.cartDiscountInput) {
    nodes.cartDiscountInput.value = String(discount || 0);
  }
}

function renderCart() {
  if (!nodes.cartTableBody) return;
  const cart = getCart();
  const productsByKey = new Map(filterActive(state.products).map((p) => [getProductKey(p), p]));

  const lines = cart.map((item) => {
    const product = productsByKey.get(String(item.id));
    if (!product) return null;
    const qty = safeNumber(item.qty, 1);
    const price = safeNumber(product?.price);
    return { product, qty, price, total: qty * price };
  }).filter(Boolean);

  if (!lines.length) {
    nodes.cartTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Cart is empty.</td></tr>`;
    updateCartTotals(0, 0, 0);
    syncCartBadgeCount();
    return;
  }

  let subtotal = 0;
  nodes.cartTableBody.innerHTML = lines.map(({ product, qty, price, total }) => {
    subtotal += total;
    const key = getProductKey(product);
    return `
      <tr>
        <td class="fw-semibold">${normalizeName(product) || "-"}</td>
        <td>
          <div class="d-inline-flex align-items-center gap-2">
            <button class="btn btn-sm btn-outline-secondary" data-action="cart-dec" data-id="${key}"><i class="bi bi-dash"></i></button>
            <span class="fw-semibold">${qty}</span>
            <button class="btn btn-sm btn-outline-secondary" data-action="cart-inc" data-id="${key}"><i class="bi bi-plus"></i></button>
          </div>
        </td>
        <td>${formatCurrency(price)}</td>
        <td>${formatCurrency(total)}</td>
        <td class="text-end"><button class="btn btn-sm btn-outline-danger" data-action="cart-remove" data-id="${key}"><i class="bi bi-trash3"></i></button></td>
      </tr>`;
  }).join("");

  const discount = Math.min(subtotal, getCartDiscount());
  updateCartTotals(subtotal, discount, Math.max(0, subtotal - discount));
  syncCartBadgeCount();
}

function renderTrash() {
  const deleted = getVisibleDeletedProducts();
  if (!nodes.trashTableBody) return;
  if (!deleted.length) {
    nodes.trashTableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">Recycle bin is empty.</td></tr>`;
    return;
  }
  nodes.trashTableBody.innerHTML = deleted.map((product) => {
    const deletedAt = product?.deletedAt ? formatDateTime(product.deletedAt) : "Unknown";
    const key = getProductKey(product);
    return `
      <tr>
        <td class="fw-semibold">${normalizeName(product) || "-"}</td>
        <td>${normalizeCategory(product) || "-"}</td>
        <td>${safeNumber(product?.quantity)}</td>
        <td>${deletedAt}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-outline-success me-1" data-action="restore" data-id="${key}" title="Restore"><i class="bi bi-arrow-counterclockwise"></i></button>
          <button class="btn btn-sm btn-outline-danger" data-action="trash-hard-delete" data-id="${key}" title="Delete forever"><i class="bi bi-trash3-fill"></i></button>
        </td>
      </tr>`;
  }).join("");
}

function updateProductNotificationBadge() {
  // Safe no-op for product page renders.
}

function renderAll() {
  renderCards();
  renderTable();
  renderCart();
  renderTrash();
  renderSaleHistory();
  renderSummaryCards();
  renderRestockQueue();
  syncHeaderCartCount();
  if (typeof updateProductNotificationBadge === "function") updateProductNotificationBadge();
}

async function loadProducts(skipRender = false) {
  if (!skipRender) {
    document.body.classList.add('product-page-loading');
    setPageLoading(productLoadingTargets(), true);
    if (nodes.cardGrid) nodes.cardGrid.innerHTML = renderProductSkeleton(6);
    if (nodes.productTableBody) nodes.productTableBody.innerHTML = renderProductTableSkeleton(4);
    if (document.getElementById("saleHistoryBody")) document.getElementById("saleHistoryBody").innerHTML = renderSaleHistorySkeleton(4);
  }
  try {
  if (!skipRender) {
    if (nodes.cardGrid) nodes.cardGrid.innerHTML = renderProductSkeleton(6);
    if (nodes.productTableBody) nodes.productTableBody.innerHTML = renderProductTableSkeleton(4);
    if (document.getElementById("saleHistoryBody")) document.getElementById("saleHistoryBody").innerHTML = renderSaleHistorySkeleton(4);
  }
  try {
    const raw = await getProducts();
    const records = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object"
        ? Object.entries(raw).map(([key, value]) => ({
            ...(value && typeof value === "object" ? value : {}),
            firebaseKey: value?.firebaseKey || key,
            id: value?.id || key
          }))
        : [];
    state.products = records.filter(Boolean);
    if (!skipRender) renderAll();
    return state.products;
  } catch (error) {
    console.error("Failed to load products:", error);
    state.products = [];
    if (!skipRender) renderAll();
    return [];
  }
  } catch (error) {
    console.error("Failed to load products:", error);
    state.products = [];
    if (!skipRender) renderAll();
    return [];
  } finally {
    document.body.classList.remove('product-page-loading');
    if (!skipRender) setTimeout(() => setPageLoading(productLoadingTargets(), false), 220);
  }
}

function setSearchValue(value) {
  nodes.searchInputs.forEach((input) => {
    if (input && input.value !== value) input.value = value;
  });
}

function setAddModalValues(product = null) {
  const fields = getAddModalFields();
  fields.name.value = product?.name || product?.productName || "";
  fields.id.value = product ? getProductCode(product) || generateProductId() : generateProductId();
  fields.category.value = product?.category || "";
  fields.category.dataset.value = product?.category || "";
  fields.price.value = product?.price ?? "";
  if (fields.originalPrice) {
    fields.originalPrice.value = product?.originalPrice ?? product?.costPrice ?? product?.purchasePrice ?? product?.price ?? "";
  }
  fields.quantity.value = product?.quantity ?? "";
  fields.threshold.value = product?.lowStockThreshold ?? PRODUCT_LOW_STOCK;
  if (fields.important) fields.important.checked = Boolean(product?.important || product?.isImportant);
  fields.notes.value = product?.notes || "";
}

function openAddModal(product = null) {
  if (!nodes.addModal) return;
  state.editKey = product ? getProductKey(product) : null;
  if (nodes.addModalTitle) nodes.addModalTitle.textContent = product ? "Edit Product" : "Add Product";
  setAddModalValues(product);
  setSaveButtonLoading(false);
  openBootstrapModal(nodes.addModal)?.show();
}

async function saveModalProduct() {
  if (state.isSaving) return;
  const fields = getAddModalFields();
  if (!fields.name || !fields.id || !fields.category || !fields.price || !fields.quantity || !fields.threshold || !fields.notes) {
    showToast("Product form is incomplete", "warning", "Products");
    return;
  }

  const payload = {
    name: fields.name.value.trim(),
    productId: fields.id.value.trim() || generateProductId(),
    category: fields.category.value.trim(),
    price: safeNumber(fields.price.value),
    originalPrice: safeNumber(fields.originalPrice?.value, safeNumber(fields.price.value)),
    quantity: safeNumber(fields.quantity.value),
    lowStockThreshold: safeNumber(fields.threshold.value, PRODUCT_LOW_STOCK),
    notes: fields.notes.value.trim(),
    important: Boolean(fields.important?.checked),
    isImportant: Boolean(fields.important?.checked),
    updatedAt: Date.now()
  };

  if (!payload.name || !payload.category) {
    showToast("Please enter product name and category", "warning", "Products");
    return;
  }

  state.isSaving = true;
  setSaveButtonLoading(true, state.editKey ? "update" : "save");
  try {
    if (state.editKey) {
      await updateProduct(state.editKey, payload);
      showToast("Product updated successfully", "success", "Products");
    } else {
      await addProduct(payload);
      showToast("Product saved to Firebase", "success", "Products");
    }
    window.bootstrap?.Modal.getOrCreateInstance(nodes.addModal)?.hide();
    state.editKey = null;
    await loadProducts(false);
  } catch (error) {
    console.error("Save product failed:", error);
    showToast(error?.message || "Could not save product", "error", "Products");
  } finally {
    state.isSaving = false;
    setSaveButtonLoading(false);
  }
}

async function adjustProductStock(productKey, delta) {
  const product = getProductByKey(productKey);
  if (!product) return false;
  const currentQty = safeNumber(product.quantity, 0);
  const nextQty = Math.max(0, currentQty + safeNumber(delta, 0));
  if (nextQty === currentQty) return true;
  await updateProduct(getProductKey(product), { quantity: nextQty, updatedAt: Date.now() });
  product.quantity = nextQty;
  return true;
}

async function addToCart(productKey) {
  const product = getProductByKey(productKey);
  if (!product) {
    showToast("Product not found", "warning", "Cart");
    return;
  }
  if (safeNumber(product.quantity) <= 0) {
    showToast("This product is out of stock", "warning", "Cart");
    return;
  }

  const cart = getCart();
  const index = cart.findIndex((item) => String(item.id) === String(productKey));
  if (index >= 0) cart[index].qty = safeNumber(cart[index].qty, 0) + 1;
  else cart.push({ id: String(productKey), qty: 1 });

  await adjustProductStock(productKey, -1);
  saveCart(cart);
  renderAll();
}

async function changeCartQuantity(productKey, delta) {
  const product = getProductByKey(productKey);
  const cart = getCart();
  const index = cart.findIndex((item) => String(item.id) === String(productKey));
  if (index < 0) return;

  const step = safeNumber(delta, 0);
  if (step === 0) return;

  if (step > 0) {
    if (!product || safeNumber(product.quantity) <= 0) {
      showToast(`Only ${safeNumber(product?.quantity, 0)} available for ${normalizeName(product)}`, "warning", "Cart");
      return;
    }
    cart[index].qty = safeNumber(cart[index].qty, 0) + step;
    await adjustProductStock(productKey, -step);
  } else {
    const removeQty = Math.min(Math.abs(step), safeNumber(cart[index].qty, 0));
    cart[index].qty = safeNumber(cart[index].qty, 0) - removeQty;
    await adjustProductStock(productKey, removeQty);
  }

  if (cart[index] && cart[index].qty <= 0) cart.splice(index, 1);
  saveCart(cart);
  renderAll();
}

async function removeFromCart(productKey) {
  const cart = getCart();
  const index = cart.findIndex((item) => String(item.id) === String(productKey));
  if (index < 0) return;
  const qty = safeNumber(cart[index].qty, 0);
  cart.splice(index, 1);
  await adjustProductStock(productKey, qty);
  saveCart(cart);
  renderAll();
}

async function clearCart({ restoreStock = true } = {}) {
  const cart = getCart();
  if (restoreStock) {
    for (const item of cart) {
      await adjustProductStock(item.id, safeNumber(item.qty, 0));
    }
  }
  saveCart([]);
  renderAll();
}

function openDeleteForeverFromTrash(productKey) {
  state.pendingDeleteKey = productKey;
}

async function handleCardAction(action, key, button = null) {
  const product = getProductByKey(key);
  try {
    switch (action) {
      case "add":
        await addToCart(key);
        showToast(`${normalizeName(product) || "Product"} added to cart`, "success", "Cart");
        break;
      case "view":
        if (!product) return;
        openRestockDetailModal(product);
        break;
      case "restock-view":
        if (!product) return;
        openRestockDetailModal(product);
        break;
      case "product-stock-add":
        if (!product) return;
        await addProductQuantity(key, document.getElementById("productAddQtyInput")?.value || 0);
        break;
      case "edit":
        if (!product) return;
        openAddModal(product);
        break;
      case "delete":
        if (!product) return;
        openDeleteConfirmModal(product);
        break;
      case "restore":
        await restoreProduct(key);
        showToast("Product restored successfully", "restore", "Products");
        await loadProducts(false);
        break;
      case "delete-confirm":
        if (!state.pendingDeleteKey) return;
        await deleteProduct(state.pendingDeleteKey, { hardDelete: false });
        showToast("Product moved to recycle bin.", "delete", "Products");
        closeDeleteConfirmModal();
        await loadProducts(false);
        break;
      case "delete-forever":
        if (!state.pendingDeleteKey) return;
        await deleteProduct(state.pendingDeleteKey, { hardDelete: true });
        showToast("Product permanently deleted", "delete", "Products");
        closeDeleteConfirmModal();
        await loadProducts(false);
        break;
      case "trash-hard-delete":
        if (!product) return;
        await deleteProduct(key, { hardDelete: true });
        showToast("Product permanently deleted", "delete", "Products");
        await loadProducts(false);
        break;
      case "cart-inc":
        await changeCartQuantity(key, 1);
        break;
      case "cart-dec":
        await changeCartQuantity(key, -1);
        break;
      case "cart-remove":
        await removeFromCart(key);
        break;
      case "cart-save":
        localStorage.setItem(CART_DISCOUNT_KEY, String(getCartDiscount()));
        syncHeaderCartCount();
        showToast("Cart saved locally", "success", "Cart");
        break;
      case "cart-clear":
        await clearCart({ restoreStock: true });
        showToast("Cart cleared and stock restored", "success", "Cart");
        break;
      case "cart-invoice":
        localStorage.setItem(CART_MODE_KEY, "invoice");
        localStorage.setItem(CART_DISCOUNT_KEY, String(getCartDiscount()));
        syncHeaderCartCount();
        window.location.href = "invoice.html?mode=invoice";
        break;
      case "cart-sell":
        localStorage.setItem(CART_MODE_KEY, "sell");
        localStorage.setItem(CART_DISCOUNT_KEY, String(getCartDiscount()));
        syncHeaderCartCount();
        await completeCartTransaction("sell", button);
        break;
      case "sale-delete":
        await deleteSaleHistoryItem(key);
        showToast("Sale history deleted", "delete", "Sales");
        break;
      case "sale-edit":
        {
          const historyItem = getSaleHistory().find((item) => saleHistoryRecordId(item) === String(key));
          if (!historyItem) return;
          state.editSaleId = historyItem.invoiceId || historyItem.id || null;
          state.editSaleCreatedAt = historyItem.createdAt || Date.now();
          await clearCart({ restoreStock: true });
          const rebuiltCart = safeArray(historyItem?.items).map((item) => ({ id: String(item.productKey || item.id), qty: safeNumber(item.qty, 1) }));
          localStorage.setItem(CART_KEY, JSON.stringify(rebuiltCart));
          localStorage.setItem(CART_DISCOUNT_KEY, String(safeNumber(historyItem?.discount, 0)));
          for (const item of rebuiltCart) {
            await adjustProductStock(item.id, -safeNumber(item.qty, 1));
          }
          renderCart();
          openCartModal();
          showToast("Sale loaded into cart for editing", "info", "Sales");
        }
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(`Action ${action} failed:`, error);
    showToast(error?.message || "Action failed", "error", "Products");
  }
}



function wireGlobalModalEnterSubmit() {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.tagName === "TEXTAREA") return;
    if (target.closest(".category-panel")) return;
    const modal = target.closest(".modal.show");
    if (!modal) return;
    const button = modal.querySelector(".modal-footer .btn.btn-primary, .modal-footer [data-default-submit='true']");
    if (button && !button.disabled) {
      event.preventDefault();
      button.click();
    }
  });
}

function bindPageActions() {
  document.addEventListener("click", async (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    const button = target.closest("button, a");
    if (!button) return;

    const action = button.getAttribute("data-action");
    if (action) {
      event.preventDefault();
      await handleCardAction(action, button.getAttribute("data-id"), button);
      return;
    }

    if (button.id === "cartSummaryBtn" || button.id === "cartBadge" || button.hasAttribute("data-open-cart")) {
      event.preventDefault();
      openCartModal();
      return;
    }

    if (button.id === "cartClearBtn") {
      event.preventDefault();
      await handleCardAction("cart-clear", null);
      return;
    }

    if (button.id === "openCategoryManagerBtn") {
      event.preventDefault();
      openCategoryManager();
      return;
    }

    if (button.id === "toggleRestockQueueBtn") {
      event.preventDefault();
      state.restockCollapsed = !state.restockCollapsed;
      renderRestockQueue();
      return;
    }

    const catAction = button.getAttribute("data-cat-action");
    if (catAction) {
      const index = safeNumber(button.getAttribute("data-cat-index"), -1);
      const categories = getStoredCategories();
      if (index < 0 || index >= categories.length) return;
      if (catAction === "delete") {
        if (!window.confirm(`Delete category "${categories[index]}"?`)) return;
        categories.splice(index, 1);
        saveStoredCategories(categories);
        renderCategoryManager();
        showToast("Category deleted", "delete", "Category");
      } else if (catAction === "edit") {
        const next = window.prompt("Edit category", categories[index]);
        if (!next) return;
        categories[index] = next.trim();
        saveStoredCategories(categories);
        renderCategoryManager();
        showToast("Category updated", "success", "Category");
      }
      return;
    }
  });

  if (nodes.addModalSaveBtn) nodes.addModalSaveBtn.addEventListener("click", saveModalProduct);
  document.getElementById("categoryManagerAddBtn")?.addEventListener("click", addCategoryFromManager);
  if (nodes.productRowsFilter) {
    nodes.productRowsFilter.addEventListener("change", () => {
      state.productRows = nodes.productRowsFilter.value || "5";
      renderTable();
    });
  }
  if (nodes.cartDiscountInput) {
    nodes.cartDiscountInput.addEventListener("input", () => setCartDiscount(nodes.cartDiscountInput.value));
    nodes.cartDiscountInput.addEventListener("change", () => setCartDiscount(nodes.cartDiscountInput.value));
  }
  if (nodes.cartModalSaveBtn) nodes.cartModalSaveBtn.addEventListener("click", () => handleCardAction("cart-save"));
  if (nodes.cartModalInvoiceBtn) nodes.cartModalInvoiceBtn.addEventListener("click", () => handleCardAction("cart-invoice"));
  if (nodes.cartModalSellBtn) nodes.cartModalSellBtn.addEventListener("click", () => handleCardAction("cart-sell"));
  if (nodes.deleteConfirmBtn) nodes.deleteConfirmBtn.addEventListener("click", () => handleCardAction("delete-confirm"));
  if (nodes.deleteForeverBtn) nodes.deleteForeverBtn.addEventListener("click", () => handleCardAction("delete-forever"));
  if (nodes.saleHistoryDateFilter) {
    nodes.saleHistoryDateFilter.addEventListener("change", () => {
      state.saleHistoryDateFilter = nodes.saleHistoryDateFilter.value || "today";
      renderSaleHistory();
    });
  }
  if (nodes.trashDateFilter) {
    nodes.trashDateFilter.addEventListener("change", () => {
      state.trashDateFilter = nodes.trashDateFilter.value || "week";
      renderTrash();
    });
  }
  if (nodes.saleHistoryRowsFilter) {
    nodes.saleHistoryRowsFilter.addEventListener("change", () => {
      state.saleHistoryRows = nodes.saleHistoryRowsFilter.value || "5";
      renderSaleHistory();
    });
  }

  nodes.searchInputs.forEach((input) => {
    input.addEventListener("input", debounce((event) => {
      state.query = event.target.value;
      setSearchValue(state.query);
      renderAll();
    }, 180));
  });

  nodes.filterSelects.forEach((select) => select.addEventListener("change", renderAll));
}


function initProductPage() {
  if (!document.getElementById("productCardsGrid") || !document.getElementById("productTableBody")) return;
  collectNodes();
  ensureStoredCategories();
  populateCategoryOptions();
  state.productRows = nodes.productRowsFilter?.value || "5";
  state.trashDateFilter = nodes.trashDateFilter?.value || state.trashDateFilter || "week";
  bindPageActions();
  wireGlobalModalEnterSubmit();
  renderCartButtonCount();
  window.addEventListener("app:open-cart", openCartModal);

  if (nodes.productCategorySelector) {
    setupCategorySelector(nodes.productCategorySelector, { allowAll: false, placeholder: "Choose category" });
  }
  if (nodes.filterCategorySelector) {
    setupCategorySelector(nodes.filterCategorySelector, { allowAll: true, placeholder: "All Categories", onChange: () => renderAll() });
  }

  Promise.all([
    loadProducts(false),
    loadSaleHistoryFromFirebase(false)
  ]).finally(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("openCart") === "1" || params.get("cart") === "1") openCartModal();
  });
}


document.addEventListener("DOMContentLoaded", initProductPage);

window.ShopProduct = {
  initProductPage,
  loadProducts,
  renderAll,
  addToCart,
  changeCartQuantity,
  removeFromCart,
  openAddModal,
  openCartModal
};

window.AppCart = {
  open: openCartModal,
  refresh: renderCartButtonCount
};
