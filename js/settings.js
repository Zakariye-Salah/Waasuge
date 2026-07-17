import { DEFAULT_SETTINGS, loadAppSettings, saveAppSettings, applyAppSettingsToDocument, deepMerge, buildMessage, replacePlaceholders } from "./settings-config.js";
import { showToast } from "./main.js";

const PERMISSION_KEYS = [
  ["dashboard", "Dashboard"],
  ["sales", "Sales"],
  ["products", "Products"],
  ["repairs", "Repairs"],
  ["expenses", "Expenses"],
  ["reports", "Reports"],
  ["customers", "Customers"],
  ["suppliers", "Suppliers"],
  ["announcements", "Announcements"],
  ["messages", "Messages"],
  ["settings", "Settings"],
  ["backup", "Backup"],
  ["restore", "Restore"],
  ["deleteSales", "Delete Sales"],
  ["deleteRepairs", "Delete Repairs"],
  ["deleteProducts", "Delete Products"],
  ["manageUsers", "Manage Users"],
  ["viewProfit", "View Profit"]
];

const ROLE_KEYS = [
  ["administrator", "Administrator"],
  ["cashier", "Cashier"],
  ["technician", "Technician"]
];

const MESSAGE_TEMPLATES = [
  ["invoiceCreated", "Invoice Created"],
  ["invoicePaid", "Invoice Paid"],
  ["invoicePartialPaid", "Invoice Partial Paid"],
  ["invoiceUnpaid", "Invoice Unpaid"],
  ["repairReceived", "Repair Received"],
  ["repairInProgress", "Repair In Progress"],
  ["repairReady", "Repair Ready"],
  ["repairDelivered", "Repair Delivered"],
  ["paymentReminder", "Payment Reminder"],
  ["newAnnouncement", "New Announcement"]
];

function $(id) {
  return document.getElementById(id);
}

function value(id, next) {
  const el = $(id);
  if (!el) return;
  if (next === undefined) return el.value;
  el.value = next ?? "";
}

function checked(id, next) {
  const el = $(id);
  if (!el) return false;
  if (next === undefined) return Boolean(el.checked);
  el.checked = Boolean(next);
  return el.checked;
}

function numberValue(id, next) {
  const el = $(id);
  if (!el) return 0;
  if (next === undefined) {
    const n = Number(el.value);
    return Number.isFinite(n) ? n : 0;
  }
  el.value = Number.isFinite(Number(next)) ? String(next) : "0";
  return Number(next) || 0;
}

function parseStatuses(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function renderRepairStatusOptions(settings) {
  const select = $("defaultRepairStatus");
  if (!select) return;
  const statuses = settings.repair?.statuses?.length ? settings.repair.statuses : DEFAULT_SETTINGS.repair.statuses;
  const previous = select.value || settings.repair?.defaultStatus || DEFAULT_SETTINGS.repair.defaultStatus;
  select.innerHTML = statuses.map((status) => `<option value="${status}">${status}</option>`).join("");
  select.value = statuses.includes(previous) ? previous : statuses[0];
}

function renderPermissionMatrix(settings) {
  const wrap = $("permissionsMatrix");
  if (!wrap) return;
  const roles = settings.permissions?.roles || DEFAULT_SETTINGS.permissions.roles;

  wrap.innerHTML = `
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-2">
        <thead>
          <tr>
            <th>Permission</th>
            <th class="text-center">Admin</th>
            <th class="text-center">Cashier</th>
            <th class="text-center">Technician</th>
          </tr>
        </thead>
        <tbody>
          ${PERMISSION_KEYS.map(([permKey, label]) => `
            <tr>
              <td class="fw-semibold">${label}</td>
              ${ROLE_KEYS.map(([roleKey]) => `
                <td class="text-center">
                  <input class="form-check-input" type="checkbox" data-perm-role="${roleKey}" data-perm-key="${permKey}" ${roles?.[roleKey]?.[permKey] ? "checked" : ""}>
                </td>
              `).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="form-check">
      <input class="form-check-input" type="checkbox" id="hideProfitFromNonAdmins" ${settings.permissions?.hideProfitFromNonAdmins ? "checked" : ""}>
      <label class="form-check-label" for="hideProfitFromNonAdmins">Hide profit from non-admins</label>
    </div>
  `;
}

function renderMessageTemplates(settings) {
  const select = $("messageTemplateSelect");
  if (!select) return;
  select.innerHTML = MESSAGE_TEMPLATES.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
  if (!select.value) select.value = MESSAGE_TEMPLATES[0][0];
  renderSelectedMessageTemplate(settings, select.value);
}

function renderSelectedMessageTemplate(settings, key) {
  const template = settings.messages?.templates?.[key] || DEFAULT_SETTINGS.messages.templates[key];
  checked("messageEnabled", template?.enabled);
  value("messageTitle", template?.title || "");
  value("messageBody", template?.body || "");
  checked("messageWhatsApp", template?.whatsapp);
  checked("messageSms", template?.sms);

  const preview = $("messagePreview");
  if (preview) {
    const merged = {
      customerName: "Customer Name",
      invoiceNumber: "INV-001",
      deviceName: "Phone",
      repairStatus: "Ready",
      amount: "100",
      remaining: "25",
      shopName: settings.general?.shopName || DEFAULT_SETTINGS.general.shopName,
      shopPhone: settings.general?.phone || DEFAULT_SETTINGS.general.phone,
      shopWhatsapp: settings.general?.whatsapp || DEFAULT_SETTINGS.general.whatsapp,
      shopAddress: settings.general?.address || DEFAULT_SETTINGS.general.address,
      date: new Date().toLocaleDateString(),
      message: "Your message here"
    };
    preview.textContent = replacePlaceholders(template?.body || "", merged);
  }
}

function hydrateForm(settings) {
  value("shopName", settings.general?.shopName);
  value("shopPhone", settings.general?.phone);
  value("shopWhatsapp", settings.general?.whatsapp);
  value("shopAddress", settings.general?.address);
  value("receiptFooterText", settings.general?.footerText);
  value("currency", settings.general?.currency);
  value("language", settings.general?.language);
  value("timezone", settings.general?.timezone);

  value("defaultDiscountType", settings.sales?.defaultDiscountType);
  numberValue("maxDiscount", settings.sales?.maxDiscount);
  checked("allowItemDiscount", settings.sales?.allowItemDiscount);
  checked("allowInvoiceDiscount", settings.sales?.allowInvoiceDiscount);
  checked("allowPartialPayment", settings.sales?.allowPartialPayment);
  value("defaultPaymentStatus", settings.sales?.defaultPaymentStatus);
  checked("showRemainingBalance", settings.sales?.showRemainingBalance);

  value("receiptSize", settings.printing?.receiptSize);
  value("fontSize", settings.printing?.fontSize);
  checked("showLogo", settings.printing?.showLogo);
  checked("showQrCode", settings.printing?.showQrCode);
  checked("showPhoneNumber", settings.printing?.showPhoneNumber);
  checked("showWhatsappNumber", settings.printing?.showWhatsappNumber);
  checked("showAddress", settings.printing?.showAddress);
  checked("printCustomerCopy", settings.printing?.printCustomerCopy);
  checked("printShopCopy", settings.printing?.printShopCopy);
  numberValue("marginTop", settings.printing?.margins?.top);
  numberValue("marginBottom", settings.printing?.margins?.bottom);
  numberValue("marginLeft", settings.printing?.margins?.left);
  numberValue("marginRight", settings.printing?.margins?.right);
  numberValue("marginPadding", settings.printing?.margins?.padding);

  value("repairStatuses", (settings.repair?.statuses || []).join("\n"));
  renderRepairStatusOptions(settings);
  checked("repairNotifyWhatsapp", settings.repair?.autoNotifyWhatsapp);
  checked("repairNotifySms", settings.repair?.autoNotifySms);

  numberValue("lowStockLevel", settings.stock?.lowStockLevel);
  checked("autoDeductStockAfterSale", settings.stock?.autoDeductStockAfterSale);
  checked("showOutOfStockProducts", settings.stock?.showOutOfStockProducts);
  checked("allowNegativeStock", settings.stock?.allowNegativeStock);

  renderPermissionMatrix(settings);
  renderMessageTemplates(settings);
}

function collectPermissions() {
  const roles = {};
  for (const [roleKey] of ROLE_KEYS) {
    roles[roleKey] = {};
    for (const [permKey] of PERMISSION_KEYS) {
      roles[roleKey][permKey] = Boolean(document.querySelector(`[data-perm-role="${roleKey}"][data-perm-key="${permKey}"]`)?.checked);
    }
  }
  return {
    hideProfitFromNonAdmins: checked("hideProfitFromNonAdmins"),
    roles
  };
}

function collectSettings(current) {
  const next = deepMerge(DEFAULT_SETTINGS, current || {});
  next.general = {
    shopName: String(value("shopName") || "").trim(),
    phone: String(value("shopPhone") || "").trim(),
    whatsapp: String(value("shopWhatsapp") || "").trim(),
    address: String(value("shopAddress") || "").trim(),
    footerText: String(value("receiptFooterText") || "").trim(),
    currency: String(value("currency") || "USD").trim(),
    language: String(value("language") || "en").trim(),
    timezone: String(value("timezone") || "Africa/Mogadishu").trim()
  };
  next.sales = {
    defaultDiscountType: String(value("defaultDiscountType") || "percentage"),
    maxDiscount: numberValue("maxDiscount"),
    allowItemDiscount: checked("allowItemDiscount"),
    allowInvoiceDiscount: checked("allowInvoiceDiscount"),
    allowPartialPayment: checked("allowPartialPayment"),
    defaultPaymentStatus: String(value("defaultPaymentStatus") || "unpaid"),
    showRemainingBalance: checked("showRemainingBalance")
  };
  next.printing = {
    receiptSize: String(value("receiptSize") || "80mm"),
    fontSize: String(value("fontSize") || "medium"),
    showLogo: checked("showLogo"),
    showQrCode: checked("showQrCode"),
    showPhoneNumber: checked("showPhoneNumber"),
    showWhatsappNumber: checked("showWhatsappNumber"),
    showAddress: checked("showAddress"),
    printCustomerCopy: checked("printCustomerCopy"),
    printShopCopy: checked("printShopCopy"),
    margins: {
      top: numberValue("marginTop"),
      bottom: numberValue("marginBottom"),
      left: numberValue("marginLeft"),
      right: numberValue("marginRight"),
      padding: numberValue("marginPadding")
    }
  };
  next.repair = {
    statuses: parseStatuses(value("repairStatuses")),
    defaultStatus: String(value("defaultRepairStatus") || ""),
    autoNotifyWhatsapp: checked("repairNotifyWhatsapp"),
    autoNotifySms: checked("repairNotifySms")
  };
  next.stock = {
    lowStockLevel: numberValue("lowStockLevel"),
    autoDeductStockAfterSale: checked("autoDeductStockAfterSale"),
    showOutOfStockProducts: checked("showOutOfStockProducts"),
    allowNegativeStock: checked("allowNegativeStock")
  };
  next.permissions = collectPermissions();

  const templateKey = value("messageTemplateSelect") || MESSAGE_TEMPLATES[0][0];
  const templates = deepMerge(DEFAULT_SETTINGS.messages.templates, current?.messages?.templates || {});
  templates[templateKey] = {
    enabled: checked("messageEnabled"),
    title: String(value("messageTitle") || "").trim(),
    body: String(value("messageBody") || "").trim(),
    whatsapp: checked("messageWhatsApp"),
    sms: checked("messageSms")
  };
  next.messages = { templates };

  return next;
}

function bindAccordionIcons() {
  document.querySelectorAll('[data-settings-collapse]').forEach((button) => {
    const targetSel = button.getAttribute('data-bs-target');
    const target = targetSel ? document.querySelector(targetSel) : null;
    const icon = button.querySelector('.settings-chevron');
    if (!target || !icon) return;

    const setIcon = () => {
      icon.className = target.classList.contains('show') ? 'bi bi-chevron-up settings-chevron ms-auto' : 'bi bi-chevron-down settings-chevron ms-auto';
    };

    target.addEventListener('shown.bs.collapse', setIcon);
    target.addEventListener('hidden.bs.collapse', setIcon);
    setIcon();
  });
}

function bindEvents() {
  $("messageTemplateSelect")?.addEventListener("change", () => {
    const current = loadAppSettings();
    renderSelectedMessageTemplate(current, value("messageTemplateSelect"));
  });

  $("saveSettingsBtn")?.addEventListener("click", () => {
    const current = loadAppSettings();
    const next = collectSettings(current);
    saveAppSettings(next);
    applyAppSettingsToDocument(next);
    showToast("Settings saved successfully.", "success", "Settings");
    renderSelectedMessageTemplate(next, value("messageTemplateSelect"));
  });

  $("resetSettingsBtn")?.addEventListener("click", () => {
    const next = deepMerge(DEFAULT_SETTINGS, {});
    hydrateForm(next);
    saveAppSettings(next);
    applyAppSettingsToDocument(next);
    showToast("Settings reset to defaults.", "warning", "Settings");
  });

  $("repairStatuses")?.addEventListener("input", () => {
    const current = loadAppSettings();
    const draft = collectSettings(current);
    renderRepairStatusOptions(draft);
  });

  $("settingsSearch")?.addEventListener("input", (event) => {
    const query = String(event.target.value || "").trim().toLowerCase();
    document.querySelectorAll("[data-settings-section]").forEach((card) => {
      const text = card.textContent.toLowerCase();
      card.style.display = !query || text.includes(query) ? "" : "none";
    });
  });

  bindAccordionIcons();
}

function initSettingsPage() {
  const current = loadAppSettings();
  hydrateForm(current);
  applyAppSettingsToDocument(current);
  bindEvents();
}

document.addEventListener("DOMContentLoaded", initSettingsPage);
