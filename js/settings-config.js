// js/settings-config.js
const SETTINGS_STORAGE_KEY = "waasugeAppSettings";
const SETTINGS_EVENT = "waasuge:settings-updated";

export const DEFAULT_SETTINGS = Object.freeze({
  general: {
    shopName: "Waasuge Electronics & Mobile Repairing",
    phone: "0617125558",
    whatsapp: "252617125558",
    address: "Waasuge Electronic, Mogadishu, Somalia",
    footerText: "Thank you for your purchase.",
    currency: "USD",
    language: "en",
    timezone: "Africa/Mogadishu"
  },
  sales: {
    defaultDiscountType: "percentage",
    maxDiscount: 10,
    allowItemDiscount: true,
    allowInvoiceDiscount: true,
    allowPartialPayment: true,
    defaultPaymentStatus: "unpaid",
    showRemainingBalance: true
  },
  printing: {
    receiptSize: "80mm",
    fontSize: "medium",
    showLogo: true,
    showQrCode: true,
    showPhoneNumber: true,
    showWhatsappNumber: true,
    showAddress: true,
    printCustomerCopy: true,
    printShopCopy: true,
    margins: { top: 10, bottom: 10, left: 10, right: 10, padding: 12 }
  },
  repair: {
    statuses: ["Received", "Checking", "Waiting for Parts", "Repairing", "Ready", "Delivered", "Cancelled"],
    defaultStatus: "Received",
    autoNotifyWhatsapp: false,
    autoNotifySms: false
  },
  stock: {
    lowStockLevel: 5,
    autoDeductStockAfterSale: true,
    showOutOfStockProducts: true,
    allowNegativeStock: false
  },
  permissions: {
    hideProfitFromNonAdmins: true,
    roles: {
      administrator: {
        dashboard: true, sales: true, products: true, repairs: true, expenses: true, reports: true,
        customers: true, suppliers: true, announcements: true, messages: true, settings: true,
        backup: true, restore: true, deleteSales: true, deleteRepairs: true, deleteProducts: true,
        manageUsers: true, viewProfit: true
      },
      cashier: {
        dashboard: true, sales: true, products: true, repairs: true, expenses: true, reports: false,
        customers: true, suppliers: false, announcements: false, messages: true, settings: false,
        backup: false, restore: false, deleteSales: false, deleteRepairs: false, deleteProducts: false,
        manageUsers: false, viewProfit: false
      },
      technician: {
        dashboard: true, sales: false, products: false, repairs: true, expenses: false, reports: false,
        customers: true, suppliers: false, announcements: false, messages: true, settings: false,
        backup: false, restore: false, deleteSales: false, deleteRepairs: false, deleteProducts: false,
        manageUsers: false, viewProfit: false
      }
    }
  },
  messages: {
    templates: {
      invoiceCreated: {
        enabled: true,
        title: "Invoice Created",
        body: "Hello {{customerName}}, your invoice {{invoiceNumber}} has been created at {{shopName}}.",
        whatsapp: true,
        sms: false
      },
      invoicePaid: {
        enabled: true,
        title: "Invoice Paid",
        body: "Hello {{customerName}}, invoice {{invoiceNumber}} has been paid. Thank you.",
        whatsapp: true,
        sms: false
      },
      invoicePartialPaid: {
        enabled: true,
        title: "Invoice Partial Paid",
        body: "Hello {{customerName}}, invoice {{invoiceNumber}} is partially paid. Remaining balance: {{remaining}}.",
        whatsapp: true,
        sms: false
      },
      invoiceUnpaid: {
        enabled: true,
        title: "Invoice Unpaid",
        body: "Hello {{customerName}}, invoice {{invoiceNumber}} is unpaid. Amount due: {{amount}}.",
        whatsapp: true,
        sms: false
      },
      repairReceived: {
        enabled: true,
        title: "Repair Received",
        body: "Hello {{customerName}}, we received your device {{deviceName}} on {{date}} at {{shopName}}.",
        whatsapp: true,
        sms: false
      },
      repairInProgress: {
        enabled: true,
        title: "Repair In Progress",
        body: "Hello {{customerName}}, your device {{deviceName}} is now under repair.",
        whatsapp: true,
        sms: false
      },
      repairReady: {
        enabled: true,
        title: "Repair Ready",
        body: "Hello {{customerName}}, your device {{deviceName}} is ready for pickup.",
        whatsapp: true,
        sms: false
      },
      repairDelivered: {
        enabled: true,
        title: "Repair Delivered",
        body: "Hello {{customerName}}, your device {{deviceName}} was delivered successfully.",
        whatsapp: true,
        sms: false
      },
      paymentReminder: {
        enabled: true,
        title: "Payment Reminder",
        body: "Hello {{customerName}}, please complete payment for invoice {{invoiceNumber}}. Remaining: {{remaining}}.",
        whatsapp: true,
        sms: false
      },
      newAnnouncement: {
        enabled: true,
        title: "New Announcement",
        body: "{{shopName}}: {{message}}",
        whatsapp: true,
        sms: false
      }
    }
  }
});

let cachedSettings = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

export function deepMerge(base, override) {
  if (override === undefined) return clone(base);
  if (Array.isArray(base) && Array.isArray(override)) return [...override];
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const output = { ...(base || {}) };
  for (const [key, value] of Object.entries(override)) {
    if (Array.isArray(value)) {
      output[key] = [...value];
    } else if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMerge(output[key], value);
    } else if (isPlainObject(value)) {
      output[key] = deepMerge({}, value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function normalizeSettings(settings) {
  return deepMerge(DEFAULT_SETTINGS, isPlainObject(settings) ? settings : {});
}

export function loadAppSettings(force = false) {
  if (!force && cachedSettings) return clone(cachedSettings);
  if (typeof localStorage === "undefined") {
    cachedSettings = clone(DEFAULT_SETTINGS);
    return clone(cachedSettings);
  }
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  try {
    cachedSettings = raw ? normalizeSettings(JSON.parse(raw)) : clone(DEFAULT_SETTINGS);
  } catch {
    cachedSettings = clone(DEFAULT_SETTINGS);
  }
  return clone(cachedSettings);
}

export function saveAppSettings(settings) {
  const next = normalizeSettings(settings);
  cachedSettings = clone(next);
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: clone(next) }));
  }
  return clone(next);
}

export function getActiveSettings() {
  return loadAppSettings();
}

export function getGeneralSettings() {
  return getActiveSettings().general || clone(DEFAULT_SETTINGS.general);
}

export function getSalesSettings() {
  return getActiveSettings().sales || clone(DEFAULT_SETTINGS.sales);
}

export function getPrintingSettings() {
  return getActiveSettings().printing || clone(DEFAULT_SETTINGS.printing);
}

export function getRepairSettings() {
  return getActiveSettings().repair || clone(DEFAULT_SETTINGS.repair);
}

export function getStockSettings() {
  return getActiveSettings().stock || clone(DEFAULT_SETTINGS.stock);
}

export function getPermissionSettings() {
  return getActiveSettings().permissions || clone(DEFAULT_SETTINGS.permissions);
}

export function getMessageTemplates() {
  return getActiveSettings().messages?.templates || clone(DEFAULT_SETTINGS.messages.templates);
}

export function getMessageTemplate(key) {
  const templates = getMessageTemplates();
  return templates[key] || DEFAULT_SETTINGS.messages.templates[key] || null;
}

export function replacePlaceholders(template, values = {}) {
  const source = String(template ?? "");
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function buildMessage(templateKey, values = {}) {
  const template = getMessageTemplate(templateKey);
  if (!template || template.enabled === false) return null;
  const mergedValues = {
    shopName: getGeneralSettings().shopName,
    shopPhone: getGeneralSettings().phone,
    shopWhatsapp: getGeneralSettings().whatsapp,
    shopAddress: getGeneralSettings().address,
    date: new Date().toLocaleDateString(),
    ...values
  };
  return {
    title: replacePlaceholders(template.title || "", mergedValues),
    body: replacePlaceholders(template.body || "", mergedValues),
    whatsapp: Boolean(template.whatsapp),
    sms: Boolean(template.sms),
    enabled: Boolean(template.enabled)
  };
}

function replaceAllText(root, replacements) {
  if (!root || typeof document === "undefined") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const original = node.nodeValue || "";
    let next = original;
    for (const [from, to] of replacements) {
      if (from && next.includes(from)) next = next.split(from).join(String(to));
    }
    if (next !== original) node.nodeValue = next;
  }
}

export function applyAppSettingsToDocument(settings = loadAppSettings()) {
  if (typeof document === "undefined") return;
  const merged = normalizeSettings(settings);
  const general = merged.general || {};
  const shopName = String(general.shopName || DEFAULT_SETTINGS.general.shopName).trim();
  const phone = String(general.phone || DEFAULT_SETTINGS.general.phone).trim();
  const whatsapp = String(general.whatsapp || DEFAULT_SETTINGS.general.whatsapp).trim();
  const address = String(general.address || DEFAULT_SETTINGS.general.address).trim();
  const language = String(general.language || DEFAULT_SETTINGS.general.language).trim();
  const timezone = String(general.timezone || DEFAULT_SETTINGS.general.timezone).trim();

  document.documentElement.lang = language || "en";
  document.body?.setAttribute("data-shop-name", shopName);
  document.body?.setAttribute("data-shop-phone", phone);
  document.body?.setAttribute("data-shop-whatsapp", whatsapp);
  document.body?.setAttribute("data-shop-address", address);
  document.body?.setAttribute("data-shop-currency", String(general.currency || DEFAULT_SETTINGS.general.currency));
  document.body?.setAttribute("data-shop-language", language);
  document.body?.setAttribute("data-shop-timezone", timezone);

  const title = document.title || "";
  if (title.includes("|")) {
    const parts = title.split("|").map((part) => part.trim()).filter(Boolean);
    const suffix = parts.slice(1).join(" | ");
    document.title = suffix ? `${shopName} | ${suffix}` : shopName;
  } else if (title) {
    document.title = title.replace(/Waasuge Electronics & Mobile Repairing|Waasuge Electronics|Electronic Shop/gi, shopName);
  } else {
    document.title = shopName;
  }

  replaceAllText(document.body || document.documentElement, [
    [DEFAULT_SETTINGS.general.shopName, shopName],
    ["Waasuge Electronics & Mobile Repairing", shopName],
    ["Waasuge Electronics", shopName],
    ["Electronic Shop", shopName],
    [DEFAULT_SETTINGS.general.phone, phone],
    [DEFAULT_SETTINGS.general.whatsapp, whatsapp],
    [DEFAULT_SETTINGS.general.address, address]
  ]);

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute("content", "#2563eb");

  if (typeof window !== "undefined") {
    window.__WAASUGE_SETTINGS__ = merged;
    window.dispatchEvent(new CustomEvent("waasuge:branding-updated", { detail: clone(merged) }));
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === SETTINGS_STORAGE_KEY) cachedSettings = null;
  });
  window.addEventListener(SETTINGS_EVENT, (event) => {
    if (event.detail) cachedSettings = normalizeSettings(event.detail);
  });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applyAppSettingsToDocument(), { once: true });
  } else {
    queueMicrotask(() => applyAppSettingsToDocument());
  }
}

export function getSettingsStorageKey() {
  return SETTINGS_STORAGE_KEY;
}
