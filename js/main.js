import { getGeneralSettings } from "./settings-config.js";
// js/main.js
export function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [];
  }
  
  export function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
  }
  
  export function formatCurrency(value, currency = null, locale = null) {
  const general = getGeneralSettings();
  const resolvedCurrency = currency || general.currency || "USD";
  const resolvedLocale = locale || general.language || "en-US";
  return new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency: resolvedCurrency
  }).format(safeNumber(value));
}
  
  export function formatDate(value, locale = null, options = {}) {
  const general = getGeneralSettings();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const resolvedLocale = locale || general.language || "en-US";
  const resolvedOptions = { year: "numeric", month: "short", day: "numeric", ...options };
  if (general.timezone && !resolvedOptions.timeZone) resolvedOptions.timeZone = general.timezone;
  return new Intl.DateTimeFormat(resolvedLocale, resolvedOptions).format(date);
}
  
  export function formatDateTime(value, locale = null) {
  const general = getGeneralSettings();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const resolvedLocale = locale || general.language || "en-US";
  const resolvedOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  };
  if (general.timezone) resolvedOptions.timeZone = general.timezone;
  return new Intl.DateTimeFormat(resolvedLocale, resolvedOptions).format(date);
}
  
  export function normalizeText(value) {
  return String(value ?? "")
  .trim()
  .toLowerCase()
  .replace(/\s+/g, " ");
  }
  
  export function debounce(fn, wait = 300) {
  let timer = null;
  return function debounced(...args) {
  clearTimeout(timer);
  timer = setTimeout(() => fn.apply(this, args), wait);
  };
  }
  
  function ensureToastContainer() {
  let container = document.getElementById("app-toast-container");
  if (container) return container;
  
  container = document.createElement("div");
  container.id = "app-toast-container";
  container.className = "toast-container position-fixed top-0 end-0 p-3";
  container.style.zIndex = "1080";
  document.body.appendChild(container);
  return container;
  }
  
  const toastStyles = {
  success: { icon: "bi-check-circle-fill", className: "text-bg-success" },
  error: { icon: "bi-x-circle-fill", className: "text-bg-danger" },
  warning: { icon: "bi-exclamation-triangle-fill", className: "text-bg-warning" },
  info: { icon: "bi-info-circle-fill", className: "text-bg-primary" },
  restore: { icon: "bi-arrow-counterclockwise", className: "text-bg-success" },
  delete: { icon: "bi-trash3-fill", className: "text-bg-danger" },
  login: { icon: "bi-shield-lock-fill", className: "text-bg-primary" }
  };
  
  export function showToast(message, type = "info", title = "") {
  const config = toastStyles[type] || toastStyles.info;
  const container = ensureToastContainer();
  
  const toast = document.createElement("div");
  toast.className = `toast align-items-center border-0 ${config.className}`;
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "assertive");
  toast.setAttribute("aria-atomic", "true");
  
  toast.innerHTML = `    <div class="d-flex">       <div class="toast-body d-flex align-items-center gap-2">         <i class="bi ${config.icon}"></i>         <div>
            ${title ?`<div class="fw-bold">${title}</div>`: ""}           <div>${message}</div>         </div>       </div>       <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>     </div>
   `;
  
  container.appendChild(toast);
  
  const instance = window.bootstrap?.Toast
  ? window.bootstrap.Toast.getOrCreateInstance(toast, { delay: 3200 })
  : null;
  
  if (instance) {
  instance.show();
  toast.addEventListener("hidden.bs.toast", () => toast.remove(), { once: true });
  } else {
  toast.style.display = "block";
  setTimeout(() => toast.remove(), 3200);
  }
  
  return toast;
  }
  
  export function createElement(html) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.trim();
  return wrapper.firstElementChild;
  }
  
  export function qs(selector, scope = document) {
  return scope.querySelector(selector);
  }
  
  export function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
  }
  
  export function emptyElement(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
  }
  
  export function setText(selector, value, scope = document) {
  const el = qs(selector, scope);
  if (el) el.textContent = value;
  }
  
  export function initBootstrapHelpers() {
  if (window.bootstrap?.Tooltip) {
  qsa('[data-bs-toggle="tooltip"]').forEach((el) => {
  window.bootstrap.Tooltip.getOrCreateInstance(el);
  });
  }
  
  if (window.bootstrap?.Popover) {
  qsa('[data-bs-toggle="popover"]').forEach((el) => {
  window.bootstrap.Popover.getOrCreateInstance(el);
  });
  }
  }
  
  
function ensureBackToTopButton() {
  if (document.getElementById("backToTopBtn")) return;
  const pages = document.querySelectorAll(".page-wrap");
  if (!pages.length) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "backToTopBtn";
  btn.setAttribute("aria-label", "Back to top");
  btn.className = "btn btn-primary rounded-circle shadow back-to-top-btn";
  btn.innerHTML = '<i class="bi bi-chevron-up"></i>';
  btn.classList.add('back-to-top-btn--animated');
  btn.style.cssText = 'position:fixed;right:16px;bottom:84px;z-index:1080;width:46px;height:46px;display:none;align-items:center;justify-content:center;';
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(btn);
  const toggle = () => { btn.style.display = window.scrollY > 220 ? 'inline-flex' : 'none'; };
  window.addEventListener('scroll', toggle, { passive: true });
  toggle();
}
document.addEventListener("DOMContentLoaded", () => {
  ensureToastContainer();
  initBootstrapHelpers();
  });
  
  window.AppUtils = {
  toArray,
  safeNumber,
  formatCurrency,
  formatDate,
  formatDateTime,
  normalizeText,
  debounce,
  showToast,
  createElement,
  qs,
  qsa,
  emptyElement,
  setText,
  initBootstrapHelpers
  };
  

export function getBootstrapModal(target) {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  if (!el || !window.bootstrap?.Modal) return null;
  return window.bootstrap.Modal.getOrCreateInstance(el);
}

export function openBootstrapModal(target) {
  const modal = getBootstrapModal(target);
  modal?.show();
  return modal;
}

export function closeBootstrapModal(target) {
  const modal = getBootstrapModal(target);
  modal?.hide();
  return modal;
}


function normalizeLoadingTargets(targets = []) {
  if (!targets) return [];
  const list = Array.isArray(targets) ? targets : [targets];
  return list.flatMap((target) => {
    if (!target) return [];
    if (typeof target === "string") return Array.from(document.querySelectorAll(target));
    if (target instanceof Element) return [target];
    return [];
  });
}

export function setPageLoading(targets, isLoading = true) {
  const elements = normalizeLoadingTargets(targets);
  elements.forEach((el) => {
    el.classList.toggle("is-loading", Boolean(isLoading));
    el.dataset.loading = Boolean(isLoading) ? "true" : "false";
  });
  return elements;
}

const THEME_STORAGE_KEY = "electronicShopTheme";

function applyStoredThemePreference() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  const theme = saved === "light" ? "light" : "dark";
  if (!saved) localStorage.setItem(THEME_STORAGE_KEY, theme);
  const isDark = theme === "dark";
  document.body.classList.toggle("dark-mode", isDark);
  document.body.setAttribute("data-bs-theme", isDark ? "dark" : "light");
  document.body.dataset.theme = theme;
  document.documentElement.setAttribute("data-bs-theme", isDark ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark-mode", isDark);
}

export function setHeaderBadgeCount(count, selector = 'button[aria-label="Notifications"] .badge') {
  const value = Math.max(0, Number(count) || 0);
  document.querySelectorAll(selector).forEach((badge) => {
    badge.textContent = String(value);
    badge.style.display = value > 0 ? "inline-flex" : "none";
  });
}

function readStoredCartItems() {
  try {
    const parsed = JSON.parse(localStorage.getItem("electronicShopCart") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function renderGlobalCartModalBody() {
  const body = document.getElementById("globalCartModalBody");
  const subtotalEl = document.getElementById("globalCartSubtotal");
  const discountEl = document.getElementById("globalCartDiscount");
  const totalEl = document.getElementById("globalCartTotal");
  const clearBtn = document.getElementById("globalCartClearBtn");
  const checkoutBtn = document.getElementById("globalCartCheckoutBtn");
  if (!body) return;

  const cart = readStoredCartItems();
  const subtotal = cart.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.price) || 0), 0);
  const discount = Math.max(0, Number(localStorage.getItem("electronicShopCartDiscount") || 0));
  const total = Math.max(0, subtotal - discount);

  if (subtotalEl) subtotalEl.textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(subtotal);
  if (discountEl) discountEl.textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(discount);
  if (totalEl) totalEl.textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(total);
  if (clearBtn) clearBtn.disabled = !cart.length;
  if (checkoutBtn) checkoutBtn.disabled = !cart.length;

  if (!cart.length) {
    body.innerHTML = '<div class="text-center text-muted py-5"><i class="bi bi-cart3 fs-1 d-block mb-2"></i>Your cart is empty.</div>';
    return;
  }

  body.innerHTML = `
    <div class="table-responsive">
      <table class="table align-middle">
        <thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
        <tbody>
          ${cart.map((item) => {
            const qty = Number(item.qty) || 0;
            const price = Number(item.price) || 0;
            const line = qty * price;
            return `<tr>
              <td><div class="fw-semibold">${item.name || "Product"}</div><div class="small text-muted">${item.category || ""}</div></td>
              <td>${qty}</td>
              <td>${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(price)}</td>
              <td class="fw-semibold">${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(line)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

export function ensureGlobalCartModal() {
  if (document.getElementById("globalCartPreviewModal")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="modal fade" id="globalCartPreviewModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-xl modal-fullscreen-sm-down modal-dialog-scrollable">
        <div class="modal-content rounded-4">
          <div class="modal-header border-bottom">
            <div>
              <h5 class="modal-title fw-bold mb-0">Cart Preview</h5>
              <small class="text-muted">Your saved cart items</small>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-4" id="globalCartModalBody"></div>
          <div class="modal-footer border-top">
            <div class="me-auto d-flex flex-column small">
              <span>Subtotal: <strong id="globalCartSubtotal">$0.00</strong></span>
              <span>Discount: <strong id="globalCartDiscount">$0.00</strong></span>
              <span>Total: <strong id="globalCartTotal">$0.00</strong></span>
            </div>
            <button type="button" class="btn btn-outline-danger rounded-4" id="globalCartClearBtn"><i class="bi bi-trash3 me-1"></i>Clear Cart</button>
            <button type="button" class="btn btn-outline-primary rounded-4" id="globalCartCheckoutBtn"><i class="bi bi-receipt-cutoff me-1"></i>Go to Invoice</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap.firstElementChild);

  document.getElementById("globalCartClearBtn")?.addEventListener("click", () => {
    localStorage.removeItem("electronicShopCart");
    localStorage.removeItem("electronicShopCartCount");
    localStorage.removeItem("electronicShopCartDiscount");
    renderGlobalCartModalBody();
    setHeaderBadgeCount(0, 'button[aria-label="Cart"] .badge');
    window.dispatchEvent(new CustomEvent("app:cart-changed", { detail: { count: 0 } }));
  });
  document.getElementById("globalCartCheckoutBtn")?.addEventListener("click", () => {
    window.location.href = "invoice.html";
  });
}

function bindGlobalHeaderActions() {
  document.addEventListener("click", (event) => {
    const cartBtn = event.target.closest('button[aria-label="Cart"]');
    if (!cartBtn) return;
    event.preventDefault();
    if (window.AppCart?.open) {
      window.AppCart.open();
      return;
    }
    ensureGlobalCartModal();
    renderGlobalCartModalBody();
    openBootstrapModal("globalCartPreviewModal");
  });

  window.addEventListener("app:cart-changed", (event) => {
    setHeaderBadgeCount(event?.detail?.count ?? 0, 'button[aria-label="Cart"] .badge');
  });
}


const NOTIF_FILTER_KEY = "electronicShopNotificationFilter";
const NOTIF_DISMISSED_KEY = "electronicShopDismissedNotifications";
let notificationMenuState = null;

function getNotificationTimeValue(item = {}) {
  const raw = item?.timestamp ?? item?.time ?? item?.date ?? item?.createdAt ?? item?.updatedAt ?? item?.repairDate ?? item?.invoiceDate ?? 0;
  if (typeof raw === "number") return raw;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getNotificationKey(item = {}) {
  const base = [item?.id, item?.href, item?.title, item?.text, getNotificationTimeValue(item)].filter(Boolean).join("|");
  return base || String(Math.random()).slice(2);
}

function readDismissedNotificationKeys() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIF_DISMISSED_KEY) || "[]");
    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveDismissedNotificationKeys(keys) {
  localStorage.setItem(NOTIF_DISMISSED_KEY, JSON.stringify(Array.from(keys)));
}

function notificationWeekBucketStartEnd(date = new Date()) {
  const now = new Date(date);
  const day = now.getDay();
  const daysSinceSaturday = (day + 1) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - daysSinceSaturday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function notificationMatchesFilter(item = {}, filter = "week") {
  const time = getNotificationTimeValue(item);
  if (!time) return true;
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return true;
  const key = normalizeText(filter);
  if (key === "all") return true;
  if (key === "today") {
    const now = new Date();
    return date.toDateString() === now.toDateString();
  }
  const { start, end } = notificationWeekBucketStartEnd();
  return date >= start && date <= end;
}

function buildNotificationMarkup(item = {}, notificationKey = "") {
  const icon = item.icon || "bi-bell";
  const iconClass = item.iconClass || "text-primary";
  const title = item.title || "Notification";
  const text = item.text || "";
  const href = item.href || "#";
  return `
    <li class="px-1 py-1">
      <div class="d-flex align-items-start gap-2 rounded-4 px-2 py-2 notification-item-shell">
        <a class="flex-grow-1 text-decoration-none text-reset d-flex align-items-start gap-2 notification-item-link" href="${href}">
          <i class="bi ${icon} ${iconClass} mt-1"></i>
          <div class="flex-grow-1 min-w-0">
            <div class="fw-semibold text-truncate">${title}</div>
            ${text ? `<small class="text-muted text-truncate d-block">${text}</small>` : ""}
          </div>
        </a>
        <button type="button" class="btn btn-sm btn-link text-danger p-0 notification-delete-btn" aria-label="Delete notification" data-notif-delete="${notificationKey}">
          <i class="bi bi-trash3"></i>
        </button>
      </div>
    </li>`;
}

function rerenderNotificationMenu() {
  if (!notificationMenuState) return;
  renderNotificationMenu(notificationMenuState.items, notificationMenuState.options);
}

export function renderNotificationMenu(items = [], {
  selector = 'button[aria-label="Notifications"]',
  title = "Notifications",
  emptyText = "No new notifications",
  count = null
} = {}) {
  const button = document.querySelector(selector);
  if (!button) return null;

  const badge = button.querySelector(".badge");
  const dropdown = button.closest(".dropdown");
  dropdown?.setAttribute("data-bs-auto-close", "outside");
  const menu = dropdown?.querySelector(".dropdown-menu");
  if (!menu) return null;

  const storedFilter = localStorage.getItem(NOTIF_FILTER_KEY) || "week";
  if (!localStorage.getItem(NOTIF_FILTER_KEY)) {
    localStorage.setItem(NOTIF_FILTER_KEY, "week");
  }

  notificationMenuState = {
    items: Array.isArray(items) ? items : [],
    options: { selector, title, emptyText, count }
  };

  menu.classList.add("header-notification-menu");

  const dismissed = readDismissedNotificationKeys();
  const normalized = notificationMenuState.items
    .map((item) => ({ ...item, __notifKey: getNotificationKey(item) }))
    .filter((item) => !dismissed.has(String(item.__notifKey)))
    .filter((item) => notificationMatchesFilter(item, storedFilter));

  const safeCount = Math.max(0, Number(count ?? normalized.length) || 0);
  const shouldReopen = dropdown?.classList.contains("show");
  if (badge) {
    badge.textContent = String(safeCount);
    badge.style.display = safeCount > 0 ? "inline-flex" : "none";
  }

  const activeFilter = normalizeText(storedFilter) || "week";
  const filterLabel = activeFilter === "week" ? "Week (Sat-Fri)" : activeFilter === "today" ? "Today" : "All";

  menu.innerHTML = `
    <li class="px-2 pt-2 pb-1 d-flex align-items-center justify-content-between gap-2 flex-wrap">
      <div class="fw-bold">${title}</div>
      <div class="btn-group btn-group-sm notif-filter-group" role="group" aria-label="Notification filters">
        <button type="button" class="btn btn-outline-primary${activeFilter === "today" ? " active" : ""}" data-notif-filter="today">Today</button>
        <button type="button" class="btn btn-outline-primary${activeFilter === "week" ? " active" : ""}" data-notif-filter="week">Week</button>
        <button type="button" class="btn btn-outline-primary${activeFilter === "all" ? " active" : ""}" data-notif-filter="all">All</button>
      </div>
    </li>
    <li class="px-2 pb-1">
      <small class="text-muted">Showing: ${filterLabel}</small>
    </li>
    <li class="px-2 py-1 d-flex align-items-center justify-content-between gap-2">
      <span class="small text-muted">Manage notifications</span>
      <button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-2 py-0" data-mark-notifications-read>
        Mark as read
      </button>
    </li>
    <li><hr class="dropdown-divider"></li>
    ${normalized.length ? normalized.map((item) => buildNotificationMarkup(item, item.__notifKey)).join("") : `
      <li>
        <div class="dropdown-item rounded-3 py-2 text-muted small">
          <div class="d-flex gap-2 align-items-center">
            <i class="bi bi-bell-slash"></i>
            <div>${emptyText}</div>
          </div>
        </div>
      </li>`}
  `;

  menu.querySelectorAll("[data-notif-filter]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      localStorage.setItem(NOTIF_FILTER_KEY, btn.dataset.notifFilter || "week");
      rerenderNotificationMenu();
      setTimeout(() => {
        const trigger = menu.closest(".dropdown")?.querySelector('button[aria-label="Notifications"]');
        window.bootstrap?.Dropdown.getOrCreateInstance(trigger)?.show();
      }, 0);
    });
  });

  menu.querySelector("[data-mark-notifications-read]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    localStorage.setItem("electronicShopNotificationCount", "0");
    setHeaderBadgeCount(0, 'button[aria-label="Notifications"] .badge');
    window.dispatchEvent(new CustomEvent("app:notif-changed", { detail: { count: 0 } }));
    const trigger = menu.closest(".dropdown")?.querySelector('button[aria-label="Notifications"]');
    const dropdown = trigger && window.bootstrap?.Dropdown.getOrCreateInstance(trigger);
    dropdown?.hide();
  }, { once: true });

  menu.querySelectorAll("[data-notif-delete]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const key = String(btn.dataset.notifDelete || "");
      if (!key) return;
      const next = readDismissedNotificationKeys();
      next.add(key);
      saveDismissedNotificationKeys(next);
      const visibleCount = Math.max(0, normalized.length - 1);
      localStorage.setItem("electronicShopNotificationCount", String(visibleCount));
      setHeaderBadgeCount(visibleCount, 'button[aria-label="Notifications"] .badge');
      rerenderNotificationMenu();
      if (shouldReopen) {
        setTimeout(() => {
          const trigger = menu.closest(".dropdown")?.querySelector('button[aria-label="Notifications"]');
          window.bootstrap?.Dropdown.getOrCreateInstance(trigger)?.show();
        }, 0);
      }
    });
  });

  return menu;
}

document.addEventListener("DOMContentLoaded", () => {
  ensureToastContainer();
  initBootstrapHelpers();
  applyStoredThemePreference();
  ensureGlobalCartModal();
  bindGlobalHeaderActions();
  ensureBackToTopButton();
  setHeaderBadgeCount(Number(localStorage.getItem("electronicShopCartCount") || 0), 'button[aria-label="Cart"] .badge');
});

window.addEventListener("storage", (event) => {
  if (event.key === THEME_STORAGE_KEY) {
    applyStoredThemePreference();
  }
});

Object.assign(window.AppUtils || {}, {
  openBootstrapModal,
  closeBootstrapModal,
  setHeaderBadgeCount,
  ensureGlobalCartModal,
  renderNotificationMenu
});
