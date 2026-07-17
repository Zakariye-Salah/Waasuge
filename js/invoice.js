// js/invoice.js
import {
  addInvoice,
  addPayment,
  deleteInvoice,
  getCustomers,
  getInvoices,
  getPayments,
  getProducts,
  getRepairs,
  restoreInvoice,
  filterActive,
  updateInvoice,
  updateProduct,
  toArray,
  isSoftDeleted,
  buildInvoiceSummary,
  safeNumber,
  sortByDate,
} from "./database.js";
import {
  debounce,
  formatCurrency,
  formatDateTime,
  normalizeText,
  qs,
  qsa,
  showToast,
  setHeaderBadgeCount,
  openBootstrapModal,
  renderNotificationMenu,
  setPageLoading
} from "./main.js";
import { DEFAULT_SETTINGS, getGeneralSettings, getPrintingSettings, getMessageTemplate, replacePlaceholders } from "./settings-config.js";
import { bindQuickCustomerButton, openQuickCustomerModal, upsertCustomer, rebuildCustomerStats, refreshCustomerStatsForRecord, getAllCustomers, getTaggedCustomerList } from "./customer-utils.js";

const CART_KEY = "electronicShopCart";
const CART_DISCOUNT_KEY = "electronicShopCartDiscount";
const CART_MODE_KEY = "electronicShopCartMode";

function ensureCustomerSuggestionStyles() {
  if (document.getElementById("customer-suggestion-scrollbar-style")) return;
  const style = document.createElement("style");
  style.id = "customer-suggestion-scrollbar-style";
  style.textContent = `
    #invoiceCustomerSuggestions::-webkit-scrollbar,
    #repairCustomerSuggestions::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    #invoiceCustomerSuggestions::-webkit-scrollbar-thumb,
    #repairCustomerSuggestions::-webkit-scrollbar-thumb {
      background: #ef4444;
      border-radius: 999px;
    }
  `;
  document.head.appendChild(style);
}
ensureCustomerSuggestionStyles();

function openModalOnTop(target) {
  const modalEl = typeof target === "string" ? document.getElementById(target) : target;
  if (!modalEl || !window.bootstrap?.Modal) return null;
  const openCount = document.querySelectorAll(".modal.show").length;
  const zIndex = 1060 + (openCount * 20);
  modalEl.style.zIndex = String(zIndex);
  modalEl.addEventListener("shown.bs.modal", () => {
    const backdrops = document.querySelectorAll(".modal-backdrop");
    const backdrop = backdrops[backdrops.length - 1];
    if (backdrop) backdrop.style.zIndex = String(zIndex - 5);
  }, { once: true });
  const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
  return modal;
}

function getInvoicePaymentWrapper(element) {
  return element?.closest?.('.col-12') || element?.closest?.('.col-md-4') || element?.parentElement || null;
}

function syncInvoicePaymentFields(fields = getModalFields()) {
  if (!fields) return;
  const paymentType = normalizeText(fields.paymentType?.value || 'mobile money');
  const isCash = paymentType === 'cash';
  const providerWrap = getInvoicePaymentWrapper(fields.paymentProvider);
  const cashWrap = getInvoicePaymentWrapper(fields.cashCurrency);
  const isPayMode = state.editingMode === 'pay';

  if (fields.paymentType && !fields.paymentType.value) fields.paymentType.value = 'Mobile Money';
  if (fields.paymentProvider && !fields.paymentProvider.value) fields.paymentProvider.value = 'Evc Plus';
  if (fields.cashCurrency && !fields.cashCurrency.value) fields.cashCurrency.value = 'Somali Shillings';
  if (fields.senderNumber && !fields.senderNumber.value) fields.senderNumber.value = fields.customerPhone?.value || '';

  if (providerWrap) providerWrap.classList.toggle('d-none', isCash);
  if (cashWrap) cashWrap.classList.toggle('d-none', !isCash);
  if (fields.paymentProvider) fields.paymentProvider.disabled = isCash;
  if (fields.cashCurrency) fields.cashCurrency.disabled = !isCash;
  if (fields.paymentProvider && isCash) fields.paymentProvider.value = 'Evc Plus';
  if (fields.cashCurrency && !isCash) fields.cashCurrency.value = 'Somali Shillings';
  if (fields.paymentStatus) fields.paymentStatus.disabled = true;

  if (isPayMode) {
    [fields.customerName, fields.customerPhone, fields.customerWhatsapp, fields.discount, fields.totalAmount, fields.totalPaid, fields.remaining, fields.invoiceType, fields.notes].forEach((el) => {
      if (!el) return;
      el.readOnly = true;
      if (el.tagName === 'SELECT') el.disabled = true;
    });
  }
}

function setInvoicePayModeUI(isPayMode, fields = getModalFields(), invoice = null) {
  if (!fields) return;
  const lockFields = [fields.customerName, fields.customerPhone, fields.customerWhatsapp, fields.discount, fields.totalAmount, fields.totalPaid, fields.remaining, fields.invoiceType, fields.notes, fields.paymentStatus];
  lockFields.forEach((el) => {
    if (!el) return;
    el.readOnly = true;
    if (el.tagName === 'SELECT') el.disabled = true;
  });

  if (fields.paidAmount) {
    fields.paidAmount.readOnly = false;
    fields.paidAmount.disabled = false;
    fields.paidAmount.value = isPayMode ? '' : fields.paidAmount.value;
  }
  if (fields.senderNumber) {
    fields.senderNumber.readOnly = false;
    fields.senderNumber.disabled = false;
  }
  if (fields.paymentType) fields.paymentType.disabled = false;
  if (fields.paymentProvider) fields.paymentProvider.disabled = false;
  if (fields.cashCurrency) fields.cashCurrency.disabled = false;

  const label = document.getElementById('invoicePaidAmountLabel');
  if (label) label.textContent = isPayMode ? 'Paid Now' : 'Paid Amount';
  if (fields.totalPaid) fields.totalPaid.value = formatCurrency(safeNumber(invoice?.paidAmount ?? 0));
  if (fields.remaining) fields.remaining.value = formatCurrency(safeNumber(invoice?.balance ?? 0));
  if (fields.customerWhatsapp) fields.customerWhatsapp.readOnly = true;
}

function clampInvoicePaidNow(fields = getModalFields(), { silent = false } = {}) {
  if (!fields) return 0;
  const editingInvoice = state.editingMode === "pay" && state.editingId ? getInvoiceById(state.editingId) : null;
  if (!editingInvoice) return safeNumber(fields.paidAmount?.value, 0);
  const finalTotal = Math.max(0, safeNumber(editingInvoice.finalTotal ?? editingInvoice.total ?? editingInvoice.amount ?? 0));
  const previousPaid = Math.max(0, safeNumber(editingInvoice.paidAmount ?? 0));
  const maxPayNow = Math.max(0, finalTotal - previousPaid);
  let paidNow = Math.max(0, safeNumber(fields.paidAmount?.value, 0));
  if (paidNow > maxPayNow) {
    paidNow = maxPayNow;
    if (fields.paidAmount) fields.paidAmount.value = String(maxPayNow);
    if (!silent) showToast("Money now that customer paid cannot be bigger than his remaining balance", "warning", "Invoice");
  }
  return paidNow;
}

function bindInvoicePaymentControls() {
  const fields = getModalFields();
  if (!fields) return;
  const refresh = () => syncInvoicePaymentFields(fields);
  [fields.paymentType, fields.paymentProvider, fields.cashCurrency, fields.customerPhone, fields.senderNumber].forEach((el) => {
    if (!el) return;
    el.addEventListener('change', refresh);
    el.addEventListener('input', refresh);
  });
  if (fields.paidAmount) {
    fields.paidAmount.addEventListener('input', () => {
      clampInvoicePaidNow(fields);
      refreshInvoiceFormTotals();
    });
    fields.paidAmount.addEventListener('change', () => {
      clampInvoicePaidNow(fields);
      refreshInvoiceFormTotals();
    });
  }
  refresh();
}


function invoiceLoadingTargets() {
  return [".page-wrap", ".invoice-table-shell", ".card-shell", ".table-responsive", "#invoiceTbody", "#trashInvoiceBody"];
}

const state = {
  invoices: [],
  repairs: [],
  products: [],
  customers: [],
  filtered: [],
  editingId: null,
  editingMode: "create",
  search: "",
  statusFilter: "all",
  dateFilter: "week",
  sortFilter: "newest",
  typeFilter: "invoice",
  rowsFilter: "5",
  trashDateFilter: "week",
  trashRowsFilter: "5",
  pageMode: "invoice",
  lastSavedId: null,
  savingInvoice: false,
  pendingDeleteId: null,
  pendingDeleteMode: "soft",
  bulkQueue: [],
  bulkIndex: 0,
  bulkChannel: "whatsapp",
  bulkSkipToday: true,
  bulkCurrentId: null,
  bulkSummary: { total: 0, sent: [], skipped: [], channel: "whatsapp" },
};

function getShopName() {
  return getGeneralSettings().shopName || DEFAULT_SETTINGS.general.shopName;
}

function getShopPhone() {
  return getGeneralSettings().phone || DEFAULT_SETTINGS.general.phone;
}

function getShopWhatsapp() {
  return getGeneralSettings().whatsapp || getShopPhone() || DEFAULT_SETTINGS.general.whatsapp;
}

function getReceiptPhoneDigits() {
  return String(getShopPhone() || "").replace(/\D/g, "") || "617125558";
}

function getPaymentShortcodeForBalance(balance) {
  const amount = Math.max(0, Math.round(Number(balance) || 0));
  return `*712*${getReceiptPhoneDigits()}*${amount}#`;
}

function getReceiptQrUrl(text) {
  return `https://quickchart.io/qr?text=${encodeURIComponent(String(text || ""))}&size=120&margin=1`;
}

function getPublicWebsiteUrl() {
  return "https://waasuge-electricity.netlify.app/";
}

function getDialerQrUrl(code) {
  const safeCode = String(code || "").replace(/#/g, "%23");
  return getReceiptQrUrl(`tel:${safeCode}`);
}

function getReceiptCopyLabel(kind) {
  return kind === "shop" ? "Shop Copy" : "Customer Copy";
}

function getPaymentShortcode() {
  const digits = String(getShopPhone() || "").replace(/\D/g, "");
  return digits ? `*712*${digits}*` : "*712*617125558*";
}
const INVOICE_SEND_LOG_KEY = "electronicShopInvoiceSendLog";

const labels = {
  paid: "Paid",
  partial: "Partial",
  unpaid: "Unpaid",
};


function isActiveRecord(item) {
  return !item?.isDeleted && !item?.deleted;
}

function getActiveRecords(items) {
  return toArray(items).filter(isActiveRecord);
}

function buildCustomerContactMessage(summary) {
  return [
    `${getShopName()}`, 
    `Customer: ${summary?.customerName || "Customer"}`,
    `Phone: ${summary?.phone || "—"}`,
    summary?.invoiceCount != null ? `Invoices: ${summary.invoiceCount}` : "",
    summary?.repairCount != null ? `Repairs: ${summary.repairCount}` : "",
    summary?.totalSpent ? `Total all: ${summary.totalSpent}` : "",
    summary?.totalPaid ? `Total paid: ${summary.totalPaid}` : "",
    summary?.totalRemaining ? `Total remaining: ${summary.totalRemaining}` : "",
    summary?.historyCount ? `History items: ${summary.historyCount}` : "",
    summary?.lastVisit ? `Last visit: ${summary.lastVisit}` : "",
    `Shop Phone: ${getShopPhone()}`,
    `Track your ID in the website: ${getPublicWebsiteUrl()}`,
    ` https://waasuge-electricity.netlify.app/`,
    `— ${getShopName()}`,
  ].filter(Boolean).join("\n");
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getCart() {
  const cart = safeJsonParse(localStorage.getItem(CART_KEY), []);
  return Array.isArray(cart) ? cart : [];
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  localStorage.removeItem("electronicShopCartCount");
  localStorage.removeItem(CART_MODE_KEY);
  updateCartBadge();
  renderCartModal();
}

function getStoredCartDiscount() {
  return Math.max(0, safeNumber(localStorage.getItem(CART_DISCOUNT_KEY), 0));
}

function clearStoredCartDiscount() {
  localStorage.removeItem(CART_DISCOUNT_KEY);
}

function updateInvoiceSaveButton(button, loading = false, text = "Saving...") {
  if (!button) return;
  setButtonLoading(button, loading, text);
}

function normalizePhone(phone) {
  return String(phone ?? "").replace(/[^\d+]/g, "");
}

function digitsOnly(phone) {
  return String(phone ?? "").replace(/\D/g, "");
}

function capitalize(value) {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function snapshotInvoiceForBulk(invoice) {
  return {
    id: String(invoice?.id || ""),
    invoiceNumber: String(invoice?.invoiceNumber || invoice?.id || ""),
    customerName: invoice?.customerName || "",
    customerPhone: invoice?.customerPhone || "",
    paymentStatus: invoice?.paymentStatus || "",
    total: safeNumber(invoice?.total ?? invoice?.amount ?? invoice?.finalTotal ?? 0),
    finalTotal: safeNumber(invoice?.finalTotal ?? invoice?.total ?? invoice?.amount ?? 0),
    paidAmount: safeNumber(invoice?.paidAmount ?? 0),
    balance: safeNumber(invoice?.balance ?? Math.max(0, safeNumber(invoice?.finalTotal ?? invoice?.total ?? invoice?.amount ?? 0) - safeNumber(invoice?.paidAmount ?? 0))),
    discount: safeNumber(invoice?.discount ?? 0)
  };
}

function resetBulkInvoiceSummary(channel, total) {
  state.bulkSummary = {
    total: Number(total || 0),
    sent: [],
    skipped: [],
    channel: String(channel || "whatsapp")
  };
}

function recordBulkInvoiceSummary(kind, invoice) {
  const snapshot = snapshotInvoiceForBulk(invoice);
  const entry = {
    ...snapshot,
    action: kind === "skipped" ? "skipped" : "sent",
    at: Date.now(),
    channel: state.bulkChannel || "whatsapp"
  };
  const summary = state.bulkSummary || { total: 0, sent: [], skipped: [], channel: state.bulkChannel || "whatsapp" };
  const bucket = entry.action === "skipped" ? summary.skipped : summary.sent;
  const exists = bucket.some((item) => item.id === entry.id && item.channel === entry.channel);
  if (!exists) bucket.unshift(entry);
  summary.total = Math.max(summary.total || 0, (Array.isArray(state.bulkQueue) ? state.bulkQueue.length : summary.total || 0));
  state.bulkSummary = summary;
}

function getBulkInvoiceSummary() {
  const summary = state.bulkSummary || { total: 0, sent: [], skipped: [], channel: state.bulkChannel || "whatsapp" };
  const sent = Array.isArray(summary.sent) ? summary.sent : [];
  const skipped = Array.isArray(summary.skipped) ? summary.skipped : [];
  const total = Math.max(Number(summary.total || 0), sent.length + skipped.length);
  return {
    total,
    sent,
    skipped,
    channel: String(summary.channel || state.bulkChannel || "whatsapp")
  };
}

function renderBulkInvoiceSummaryModal() {
  const title = document.getElementById("invoiceBulkSummaryTitle");
  const counter = document.getElementById("invoiceBulkSummaryCounter");
  const totalValue = document.getElementById("invoiceBulkSummaryTotalValue");
  const sentValue = document.getElementById("invoiceBulkSummarySentValue");
  const skippedValue = document.getElementById("invoiceBulkSummarySkippedValue");
  const sentList = document.getElementById("invoiceBulkSummarySentList");
  const skippedList = document.getElementById("invoiceBulkSummarySkippedList");
  const sentToggle = document.getElementById("invoiceBulkSummarySentToggle");
  const skippedToggle = document.getElementById("invoiceBulkSummarySkippedToggle");
  const resendBtn = document.getElementById("invoiceBulkResendSkippedBtn");
  if (!title || !totalValue || !sentValue || !skippedValue || !sentList || !skippedList || !sentToggle || !skippedToggle || !resendBtn) return;

  const summary = getBulkInvoiceSummary();
  const sentTotal = summary.sent.length;
  const skippedTotal = summary.skipped.length;
  const processedTotal = sentTotal + skippedTotal;

  title.textContent = `${summary.channel === "sms" ? "SMS" : "WhatsApp"} summary`;
  if (counter) counter.textContent = `${processedTotal} / ${summary.total}`;
  totalValue.textContent = String(summary.total);
  sentValue.textContent = String(sentTotal);
  skippedValue.textContent = String(skippedTotal);

  sentList.innerHTML = summary.sent.length
    ? summary.sent.map((item, index) => `
      <div class="list-group-item d-flex justify-content-between align-items-start gap-3">
        <div class="min-w-0">
          <div class="fw-semibold text-truncate">${escapeHtml(item.customerName || "Customer")}</div>
          <div class="small text-muted text-truncate">${escapeHtml(item.invoiceNumber || item.id || "—")} · ${escapeHtml(item.customerPhone || "—")}</div>
        </div>
        <span class="badge bg-soft-success text-success-soft">#${index + 1}</span>
      </div>`).join("")
    : `<div class="text-muted small py-2">No sent invoices yet.</div>`;

  skippedList.innerHTML = summary.skipped.length
    ? summary.skipped.map((item, index) => `
      <div class="list-group-item d-flex justify-content-between align-items-start gap-3">
        <div class="min-w-0">
          <div class="fw-semibold text-truncate">${escapeHtml(item.customerName || "Customer")}</div>
          <div class="small text-muted text-truncate">${escapeHtml(item.invoiceNumber || item.id || "—")} · ${escapeHtml(item.customerPhone || "—")}</div>
        </div>
        <span class="badge bg-soft-warning text-warning-soft">#${index + 1}</span>
      </div>`).join("")
    : `<div class="text-muted small py-2">No skipped invoices.</div>`;

  const sentShown = !sentList.classList.contains("d-none");
  const skippedShown = !skippedList.classList.contains("d-none");
  sentToggle.innerHTML = `<i class="bi ${sentShown ? "bi-chevron-up" : "bi-chevron-down"} me-1"></i>${sentToggle.dataset.label || "Sent"}`;
  skippedToggle.innerHTML = `<i class="bi ${skippedShown ? "bi-chevron-up" : "bi-chevron-down"} me-1"></i>${skippedToggle.dataset.label || "Skipped"}`;
  resendBtn.disabled = summary.skipped.length === 0;
}

function toggleBulkSummaryList(kind) {
  const list = document.getElementById(kind === "sent" ? "invoiceBulkSummarySentList" : "invoiceBulkSummarySkippedList");
  const btn = document.getElementById(kind === "sent" ? "invoiceBulkSummarySentToggle" : "invoiceBulkSummarySkippedToggle");
  if (!list || !btn) return;
  const shown = list.classList.contains("d-none");
  list.classList.toggle("d-none", !shown);
  btn.innerHTML = `<i class="bi bi-chevron-${shown ? "up" : "down"} me-1"></i>${btn.dataset.label || ""}`;
}

function showBulkInvoiceSummaryModal() {
  renderBulkInvoiceSummaryModal();
  const modalEl = document.getElementById("invoiceBulkSummaryModal");
  window.bootstrap?.Modal.getOrCreateInstance(modalEl)?.show();
}

function showSkippedBulkInvoicesAgain() {
  const summary = getBulkInvoiceSummary();
  if (!summary.skipped.length) {
    showToast("No skipped invoices to resend.", "warning", "Messages");
    return;
  }
  state.bulkQueue = summary.skipped.map((item) => snapshotInvoiceForBulk(item));
  state.bulkIndex = 0;
  state.bulkChannel = summary.channel || state.bulkChannel || "whatsapp";
  state.bulkSkipToday = false;
  state.bulkCurrentId = null;
  showBulkInvoiceModal();
}


function getPageRoot() {
  return document.querySelector(".page-wrap") || document.body;
}

function getCardByHeading(text) {
  const cards = Array.from(document.querySelectorAll(".card-shell, .invoice-card, .summary-card"));
  return cards.find((card) => card.textContent?.includes(text)) || null;
}

function getCreateCard() {
  return getCardByHeading("Create Invoice");
}

function getListCard() {
  return getCardByHeading("Invoice History") || getCardByHeading("Invoice List") || getCardByHeading("All Invoices") || document.querySelector("table")?.closest(".card-shell") || null;
}

function getCreateFields() {
  const modal = getModalFields();
  if (modal) {
    return {
      customerName: modal.customerName || null,
      customerPhone: modal.customerPhone || null,
      invoiceType: modal.invoiceType || null,
      paymentStatus: modal.paymentStatus || null,
      totalAmount: modal.totalAmount || null,
      discount: modal.discount || null,
      paidAmount: modal.paidAmount || null,
      remaining: modal.remaining || null,
      notes: modal.notes || null,
    };
  }
  const card = getCardByHeading("Create Invoice");
  if (!card) return {};
  const fields = Array.from(card.querySelectorAll("input, select, textarea"));
  return {
    customerName: fields[0] || null,
    customerPhone: fields[1] || null,
    invoiceType: fields[2] || null,
    paymentStatus: fields[3] || null,
    discount: fields[4] || null,
    paidAmount: fields[5] || null,
    remaining: fields[6] || null,
    notes: fields[7] || null,
  };
}

function getModalFields() {
  const modal = document.getElementById("newInvoiceModal");
  if (!modal) return null;
  return {
    modal,
    customerName: document.getElementById("invoiceCustomerName"),
    customerPhone: document.getElementById("invoiceCustomerPhone"),
    customerWhatsapp: document.getElementById("invoiceCustomerWhatsapp"),
    senderNumber: document.getElementById("invoiceSenderNumber"),
    paymentType: document.getElementById("invoicePaymentType"),
    paymentProvider: document.getElementById("invoicePaymentProvider"),
    cashCurrency: document.getElementById("invoiceCashCurrency"),
    invoiceType: modal.querySelector('select.form-select'),
    paymentStatus: document.getElementById("invoicePaymentStatus"),
    totalAmount: document.getElementById("invoiceTotalAmount"),
    totalPaid: document.getElementById("invoiceTotalPaid"),
    discount: document.getElementById("invoiceDiscount"),
    paidAmount: document.getElementById("invoicePaidAmount"),
    remaining: document.getElementById("invoiceRemaining") || modal.querySelector('input[placeholder="0"]:last-of-type'),
    notes: document.getElementById("invoiceNotes"),
    saveButton: document.getElementById("saveInvoiceBtn") || modal.querySelector(".modal-footer .btn.btn-primary"),
  };
}


function getInvoiceCustomerSuggestionsWrap() {
  return document.getElementById("invoiceCustomerSuggestions");
}

function normalizeInvoiceCustomerKey(record = {}) {
  return normalizeText(
    record?.customerId ||
    record?.clientId ||
    record?.customerPhone ||
    record?.phone ||
    record?.phoneNumber ||
    record?.whatsapp ||
    record?.id ||
    ""
  );
}

function buildInvoiceCustomerDirectory() {
  const records = getActiveRecords(state.customers);
  const sourceRecords = getTaggedCustomerList(records).length ? getTaggedCustomerList(records) : records;
  const map = new Map();
  sourceRecords.forEach((record) => {
    const customerName = String(record?.customerName || record?.fullName || record?.name || "").trim();
    const phone = String(record?.customerPhone || record?.phoneNumber || record?.phone || record?.whatsapp || "").trim();
    const key = normalizeInvoiceCustomerKey(record);
    if (!key || !customerName) return;
    const current = map.get(key) || { customerId: String(record?.id || record?.customerId || ""), customerName, phone: phone || "", address: String(record?.address || record?.customerAddress || "").trim(), whatsapp: String(record?.whatsapp || record?.customerWhatsapp || phone || "").trim(), count: 0, lastActivity: 0 };
    current.customerName = customerName;
    if (phone) current.phone = phone;
    current.address = String(record?.address || record?.customerAddress || current.address || "").trim();
    current.whatsapp = String(record?.whatsapp || record?.customerWhatsapp || current.whatsapp || phone || "").trim();
    current.count += 1;
    current.lastActivity = Math.max(current.lastActivity, safeNumber(record?.updatedAt ?? record?.createdAt ?? 0));
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => b.lastActivity - a.lastActivity || b.count - a.count);
}

function hideInvoiceCustomerSuggestions() {
  const wrap = getInvoiceCustomerSuggestionsWrap();
  if (wrap) {
    wrap.innerHTML = "";
    wrap.style.display = "none";
  }
}

function applyInvoiceCustomerSuggestion(record) {
  const fields = getModalFields();
  if (!fields) return;
  if (fields.customerName) fields.customerName.value = record?.customerName || "";
  if (fields.customerPhone) fields.customerPhone.value = record?.phone || record?.customerPhone || "";
  if (fields.customerId) fields.customerId.value = record?.customerId || "";
  if (fields.customerWhatsapp) fields.customerWhatsapp.value = record?.whatsapp || record?.customerWhatsapp || record?.phone || record?.customerPhone || "";
  if (fields.senderNumber) fields.senderNumber.value = record?.phone || record?.customerPhone || "";
  if (fields.customerAddress) fields.customerAddress.value = record?.address || record?.customerAddress || "";
  hideInvoiceCustomerSuggestions();
}

function renderInvoiceCustomerSuggestions() {
  const fields = getModalFields();
  const wrap = getInvoiceCustomerSuggestionsWrap();
  if (!fields?.customerName || !wrap) return;

  const query = normalizeText(fields.customerName.value);
  const isPayMode = state.editingMode === 'pay' && state.editingId;
  const editingInvoice = isPayMode ? getInvoiceById(state.editingId) : null;
  const directory = isPayMode && editingInvoice ? [{
    customerId: String(editingInvoice.customerId || ""),
    customerName: editingInvoice.customerName || "",
    phone: editingInvoice.customerPhone || "",
    whatsapp: editingInvoice.customerWhatsapp || editingInvoice.customerPhone || "",
    address: editingInvoice.customerAddress || "",
    lastActivity: safeNumber(editingInvoice.updatedAt || editingInvoice.createdAt || 0),
    count: 1,
  }] : buildInvoiceCustomerDirectory();
  const matches = directory
    .filter((item) => !query || normalizeText(item.customerName).includes(query) || normalizeText(item.phone).includes(query) || normalizeText(item.whatsapp).includes(query))
    .slice(0, isPayMode ? 1 : 10);

  wrap.style.maxHeight = '260px';
  wrap.style.overflowY = 'auto';
  wrap.style.scrollbarWidth = 'thin';
  wrap.style.scrollbarColor = '#ef4444 transparent';

  if (!matches.length) {
    hideInvoiceCustomerSuggestions();
    return;
  }

  wrap.style.display = "block";
  wrap.innerHTML = matches.map((item) => `
    <button type="button" class="customer-suggestion-item" data-customer-id="${escapeHtml(item.customerId || "")}" data-customer-name="${escapeHtml(item.customerName)}" data-customer-phone="${escapeHtml(item.phone || "")}">
      <span class="fw-semibold text-truncate">${escapeHtml(item.customerName)}</span>
      <span class="small text-muted text-nowrap">${escapeHtml(item.phone || "—")}</span>
    </button>
  `).join("");
}


function bindInvoiceCustomerAutocomplete() {
  const fields = getModalFields();
  if (!fields?.customerName || !fields?.customerPhone) return;

  const syncFromName = () => {
    const query = normalizeText(fields.customerName.value);
    const directory = buildInvoiceCustomerDirectory();
    const exact = directory.find((item) => item.phone && normalizeText(item.phone) === query);
    if (exact) {
      if (!fields.customerPhone.value || normalizeText(fields.customerPhone.value) === "" || normalizeText(fields.customerPhone.value) === normalizeText(exact.phone || "")) {
        fields.customerPhone.value = exact.phone || fields.customerPhone.value;
      }
    }
    renderInvoiceCustomerSuggestions();
  };

  fields.customerName.addEventListener("focus", renderInvoiceCustomerSuggestions);
  fields.customerName.addEventListener("input", syncFromName);
  fields.customerName.addEventListener("change", syncFromName);
  fields.customerName.addEventListener("blur", () => setTimeout(hideInvoiceCustomerSuggestions, 180));
  fields.customerPhone.addEventListener("focus", renderInvoiceCustomerSuggestions);
  fields.customerPhone.addEventListener("input", () => renderInvoiceCustomerSuggestions());

  const wrap = getInvoiceCustomerSuggestionsWrap();
  wrap?.addEventListener("mousedown", (event) => {
    const button = event.target.closest("[data-customer-name]");
    if (!button) return;
    event.preventDefault();
    applyInvoiceCustomerSuggestion({
      customerId: button.dataset.customerId || "",
      customerName: button.dataset.customerName || "",
      phone: button.dataset.customerPhone || ""
    });
  });
}

function getSearchInput() {
  return document.getElementById("invoiceSearch") || document.querySelector('input[type="search"]');
}

function getFilterSelects() {
  return [
    document.getElementById("invoiceDateFilter"),
    document.getElementById("invoiceTypeFilter"),
    document.getElementById("invoiceStatusFilter"),
    document.getElementById("invoiceSortFilter"),
    document.getElementById("invoiceRowsFilter"),
  ];
}

function getTableBody() {
  const table = document.querySelector("table");
  return table ? table.querySelector("tbody") : null;
}

function getSummaryBoxes() {
  return Array.from(document.querySelectorAll(".summary-card .summary-value"));
}

function getRowsLimit(value, fallback = 5) {
  const text = String(value ?? fallback).trim().toLowerCase();
  if (text === "all") return Infinity;
  return Math.max(1, safeNumber(text, fallback));
}

function invoiceDateMatches(invoice, filter) {
  if (!filter || filter === "all") return true;
  const createdAt = safeNumber(invoice?.createdAt);
  if (!createdAt) return false;
  const now = new Date();
  const dt = new Date(createdAt);
  if (filter === "today") {
    const start = new Date(now); start.setHours(0,0,0,0);
    const end = new Date(now); end.setHours(23,59,59,999);
    return createdAt >= start.getTime() && createdAt <= end.getTime();
  }
  if (filter === "week") {
    const start = new Date(now);
    const saturdayOffset = (now.getDay() + 1) % 7;
    start.setDate(now.getDate() - saturdayOffset);
    start.setHours(0,0,0,0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23,59,59,999);
    return createdAt >= start.getTime() && createdAt <= end.getTime();
  }
  if (filter === "month") return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
  if (filter === "year") return dt.getFullYear() === now.getFullYear();
  return true;
}

function getCartTotalFromItems(items) {
  return items.reduce((sum, item) => {
    const qty = safeNumber(item?.qty, 1);
    const price = safeNumber(item?.price ?? item?.unitPrice ?? item?.salePrice);
    return sum + qty * price;
  }, 0);
}

function getCartItemsForInvoice() {
  const cart = getCart();
  const productsById = new Map(state.products.map((product) => [String(product.id || product.productId), product]));
  const merged = new Map();

  cart.forEach((item, index) => {
    const key = String(item.id ?? index);
    const product = productsById.get(String(item.id));
    const existing = merged.get(key);
    const qty = Math.max(0, safeNumber(item.qty, 1));
    if (existing) {
      existing.qty += qty;
      return;
    }
    merged.set(key, {
      id: key,
      productId: key,
      productKey: String(product?.firebaseKey || product?.id || item?.id || index),
      qty,
      price: safeNumber(item.price ?? item.unitPrice ?? item.salePrice ?? product?.price ?? 0),
      name: item.name || item.productName || item.title || product?.name || product?.productName || `Item ${index + 1}`,
      category: item.category || item.type || product?.category || product?.type || "",
    });
  });

  return Array.from(merged.values());
}

function getInvoiceItemsSummary(items) {
  if (!items.length) return "No items";
  return items
    .map((item) => `${item.name} x${safeNumber(item.qty, 1)}`)
    .join(", ");
}

function computeInvoiceTotals(items, discountInput, paidInput) {
  const subtotal = getCartTotalFromItems(items);
  const discountValue = Math.max(0, safeNumber(discountInput, 0));
  const discount = Math.min(discountValue, subtotal);
  const finalTotal = Math.max(0, subtotal - discount);
  const paidAmount = Math.max(0, safeNumber(paidInput, 0));
  const remaining = Math.max(0, finalTotal - Math.min(paidAmount, finalTotal));
  return { subtotal, discount, finalTotal, paidAmount, remaining };
}

function normalizeStatus(value) {
  const text = normalizeText(value);
  if (text === "paid" || text === "partial" || text === "unpaid") return text;
  return "unpaid";
}

function statusBadge(status) {
  const text = normalizeStatus(status);
  if (text === "paid") return "bg-soft-success text-success-soft";
  if (text === "partial") return "bg-soft-warning text-warning-soft";
  return "bg-soft-danger text-danger-soft";
}

function paymentStatusFromTotals(finalTotal, paidAmount, fallback = "unpaid") {
  if (paidAmount >= finalTotal && finalTotal > 0) return "paid";
  if (paidAmount > 0 && paidAmount < finalTotal) return "partial";
  return normalizeStatus(fallback);
}

function formatFriendlyDate(value) {
  const formatted = formatDateTime(value);
  return formatted || "—";
}

function formatInvoiceDateParts(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return { date: "—", time: "" };
  const datePart = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", year: "2-digit" }).format(date).replace(/,/g, "");
  const timePart = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(date);
  return { date: datePart.replace(/\s+/g, "/"), time: timePart };
}

function formatInvoiceItemsPreview(items = []) {
  const list = toArray(items);
  if (!list.length) return "No items";
  const first = String(list[0]?.name || list[0]?.productName || list[0]?.title || "Item").trim();
  return list.length > 1 ? `${first} +${list.length - 1}` : first;
}

function formatInvoiceItemsModal(items = []) {
  const list = toArray(items);
  if (!list.length) return '<div class="text-muted small">No items on this invoice.</div>';
  return `<div class="vstack gap-2">${list.map((item, index) => `
    <div class="d-flex justify-content-between align-items-start gap-3 p-2 rounded-3 border bg-body-tertiary">
      <div class="min-w-0">
        <div class="fw-semibold text-truncate">${escapeHtml(item?.name || item?.productName || item?.title || `Item ${index + 1}`)}</div>
        <div class="small text-muted">Qty: ${safeNumber(item?.qty, 1)} · Price: ${formatCurrency(safeNumber(item?.price || 0))}</div>
      </div>
      <div class="fw-semibold text-nowrap">${formatCurrency(safeNumber(item?.qty, 1) * safeNumber(item?.price || 0))}</div>
    </div>`).join("")}</div>`;
}

function getInvoiceModalFooterActions(invoice) {
  const id = sanitizeInvoiceId(invoice?.id || invoice?.invoiceNumber);
  const isPaid = normalizeStatus(invoice?.paymentStatus) === "paid";
  const markLabel = isPaid ? "Return" : "Mark Paid";
  const markIcon = isPaid ? "bi-arrow-counterclockwise" : "bi-check2-circle";
  return `
    <button type="button" class="btn btn-outline-primary rounded-4" data-action="edit" data-id="${id}"><i class="bi bi-pencil-square me-1"></i>Edit</button>
    <button type="button" class="btn btn-outline-danger rounded-4" data-action="delete" data-id="${id}"><i class="bi bi-trash3 me-1"></i>Delete</button>
    <button type="button" class="btn btn-outline-success rounded-4" data-action="whatsapp" data-id="${id}"><i class="bi bi-whatsapp me-1"></i>WhatsApp</button>
    <button type="button" class="btn btn-outline-secondary rounded-4" data-action="sms" data-id="${id}"><i class="bi bi-chat-dots me-1"></i>SMS</button>
    <button type="button" class="btn btn-outline-success rounded-4" data-action="pay" data-id="${id}"><i class="bi bi-cash-coin me-1"></i>Pay</button>
    <button type="button" class="btn btn-outline-warning rounded-4" data-action="toggle-status" data-id="${id}"><i class="bi ${markIcon} me-1"></i>${markLabel}</button>
    <button type="button" class="btn btn-outline-info rounded-4" data-action="history" data-id="${id}"><i class="bi bi-clock-history me-1"></i>History</button>
    <button type="button" class="btn btn-outline-dark rounded-4" data-action="print" data-id="${id}"><i class="bi bi-printer me-1"></i>Print</button>
  `;
}

function ensureInvoiceViewModal() {
  if (document.getElementById("invoiceViewModal")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div class="modal fade" id="invoiceViewModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-lg modal-fullscreen-sm-down">
      <div class="modal-content rounded-4">
        <div class="modal-header border-bottom">
          <div>
            <h5 class="modal-title fw-bold mb-0" id="invoiceViewModalTitle">Invoice</h5>
            <small class="text-muted" id="invoiceViewModalSubtitle"></small>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-3 p-md-4" id="invoiceViewModalBody"></div>
        <div class="modal-footer border-top flex-wrap gap-2" id="invoiceViewModalFooter"></div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
}

function openInvoiceViewModal(invoice) {
  if (!invoice) return;
  ensureInvoiceViewModal();
  const modal = document.getElementById("invoiceViewModal");
  const title = document.getElementById("invoiceViewModalTitle");
  const subtitle = document.getElementById("invoiceViewModalSubtitle");
  const body = document.getElementById("invoiceViewModalBody");
  const footer = document.getElementById("invoiceViewModalFooter");
  const invoiceId = sanitizeInvoiceId(invoice.id || invoice.invoiceNumber);
  const { date, time } = formatInvoiceDateParts(invoice.createdAt);
  const items = toArray(invoice.items || []);
  const total = safeNumber(invoice.finalTotal ?? invoice.total ?? invoice.amount);
  const paid = safeNumber(invoice.paidAmount ?? invoice.paid ?? 0);
  const balance = Math.max(0, safeNumber(invoice.balance, total - paid));
  if (title) title.textContent = invoice.invoiceNumber || invoiceId || "Invoice";
  if (subtitle) subtitle.textContent = `${invoice.customerName || "Direct Sale"} · ${invoice.customerPhone || "—"}`;
  if (body) {
    body.innerHTML = `
      <div class="row g-3">
        <div class="col-12 col-md-7">
          <div class="p-3 rounded-4 border bg-body-tertiary h-100">
            <div class="d-flex justify-content-between gap-3 mb-3">
              <div>
                <div class="text-muted small">Invoice</div>
                <div class="fw-bold fs-5">${escapeHtml(invoice.invoiceNumber || invoiceId || "—")}</div>
              </div>
              <div class="text-end">
                <div class="text-muted small">Date</div>
                <div class="fw-semibold">${escapeHtml(date)}</div>
                <div class="small text-muted">${escapeHtml(time)}</div>
              </div>
            </div>
            <div class="vstack gap-2 small">
              <div><span class="text-muted">Customer:</span> <strong>${escapeHtml(invoice.customerName || "Direct Sale")}</strong></div>
              <div><span class="text-muted">Phone:</span> <strong>${escapeHtml(invoice.customerPhone || "—")}</strong></div>
              <div><span class="text-muted">Status:</span> <strong>${capitalize(invoice.paymentStatus)}</strong></div>
              <div><span class="text-muted">Notes:</span> ${escapeHtml(invoice.notes || "No notes")}</div>
            </div>
          </div>
        </div>
        <div class="col-12 col-md-5">
          <div class="p-3 rounded-4 border bg-body-tertiary h-100">
            <div class="d-flex justify-content-between"><span class="text-muted">Total</span><strong>${formatCurrency(total)}</strong></div>
            <div class="d-flex justify-content-between"><span class="text-muted">Paid</span><strong>${formatCurrency(paid)}</strong></div>
            <div class="d-flex justify-content-between"><span class="text-muted">Balance</span><strong class="text-danger">${formatCurrency(balance)}</strong></div>
            <hr>
            ${formatInvoiceItemsModal(items)}
          </div>
        </div>
      </div>`;
  }
  if (footer) footer.innerHTML = getInvoiceModalFooterActions(invoice);
  openModalOnTop(modal);
}

function buildInvoiceNumber() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `INV-${stamp}-${rand}`;
}

function sanitizeInvoiceId(value) {
  return String(value ?? "").trim();
}

function matchesSearch(invoice, query) {
  if (!query) return true;
  const haystack = [
    invoice.invoiceNumber,
    invoice.customerName,
    invoice.customerPhone,
    invoice.paymentStatus,
    invoice.invoiceType,
    invoice.notes,
    invoice.balance,
    invoice.finalTotal,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function inDateFilter(invoice, filter) {
  if (!filter || filter === "all") return true;
  const createdAt = safeNumber(invoice?.createdAt);
  if (!createdAt) return false;
  const now = new Date();
  const dt = new Date(createdAt);
  if (filter === "today") {
    return dt.toDateString() === now.toDateString();
  }
  if (filter === "week") {
    const day = now.getDay();
    const start = new Date(now);
    const diff = (day + 1) % 7; // Saturday start
    start.setDate(now.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return createdAt >= start.getTime() && createdAt <= end.getTime();
  }
  if (filter === "month") {
    return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
  }
  if (filter === "year") {
    return dt.getFullYear() === now.getFullYear();
  }
  return true;
}

function applyFilters() {
  let list = state.invoices.filter((invoice) => !isSoftDeleted(invoice));

  list = list.filter((invoice) => matchesSearch(invoice, state.search));
  list = list.filter((invoice) => inDateFilter(invoice, state.dateFilter));
  if (state.typeFilter !== "all") {
    list = list.filter((invoice) => {
      const invoiceId = String(invoice.invoiceNumber || invoice.id || "").toUpperCase();
      if (state.typeFilter === "invoice") return invoiceId.startsWith("INV");
      if (state.typeFilter === "direct sale") return invoiceId.startsWith("SALE");
      return true;
    });
  }
  if (state.statusFilter !== "all") {
    list = list.filter((invoice) => normalizeStatus(invoice.paymentStatus) === state.statusFilter);
  }

  list.sort((a, b) => {
    const aTime = safeNumber(a?.createdAt);
    const bTime = safeNumber(b?.createdAt);
    const aRemaining = Math.max(0, safeNumber(a?.balance ?? Math.max(0, safeNumber(a?.finalTotal ?? 0) - safeNumber(a?.paidAmount ?? 0))));
    const bRemaining = Math.max(0, safeNumber(b?.balance ?? Math.max(0, safeNumber(b?.finalTotal ?? 0) - safeNumber(b?.paidAmount ?? 0))));
    const aName = normalizeText(a?.customerName || "");
    const bName = normalizeText(b?.customerName || "");
    if (state.sortFilter === "oldest") return aTime - bTime;
    if (state.sortFilter === "remaining-high") return bRemaining - aRemaining;
    if (state.sortFilter === "remaining-low") return aRemaining - bRemaining;
    if (state.sortFilter === "name-az") return aName.localeCompare(bName);
    if (state.sortFilter === "name-za") return bName.localeCompare(aName);
    return bTime - aTime;
  });

  state.filtered = list;
}

function renderSummary() {
  const summary = buildInvoiceSummary(state.invoices);
  const boxes = getSummaryBoxes();
  const totalRemaining = state.invoices.reduce((sum, invoice) => sum + safeNumber(invoice.balance ?? Math.max(0, safeNumber(invoice.finalTotal ?? 0) - safeNumber(invoice.paidAmount ?? 0))), 0);
  if (boxes[0]) boxes[0].textContent = String(summary.totalInvoices || 0);
  if (boxes[1]) boxes[1].textContent = String(summary.paidInvoices || 0);
  if (boxes[2]) boxes[2].textContent = String(summary.partialInvoices || 0);
  if (boxes[3]) boxes[3].textContent = String(summary.unpaidInvoices || 0);
  if (boxes[4]) boxes[4].textContent = formatCurrency(totalRemaining);
}

function updateInvoiceNotificationBadge() {
  const active = state.invoices.filter((invoice) => !isSoftDeleted(invoice));
  const unpaid = active.filter((invoice) => {
    const status = normalizeStatus(invoice.paymentStatus);
    return status === "unpaid" || status === "partial";
  }).length;
  const recentPaid = active.filter((invoice) => normalizeStatus(invoice.paymentStatus) === "paid").slice(0, 1);
  renderNotificationMenu([
    {
      icon: "bi-receipt-cutoff",
      iconClass: "text-primary",
      title: `${unpaid} invoice${unpaid === 1 ? "" : "s"} need attention`,
      text: "Paid, partial and unpaid invoices are loaded from Firebase.",
      href: "#invoiceFiltersSection"
    },
    {
      icon: "bi-cash-coin",
      iconClass: "text-success",
      title: `${recentPaid.length} paid invoice${recentPaid.length === 1 ? "" : "s"} today`,
      text: "Recent invoice payment updates are shown in real time.",
      href: "#invoiceListSection"
    },
    {
      icon: "bi-whatsapp",
      iconClass: "text-success",
      title: "WhatsApp / SMS ready",
      text: "Open an invoice to send customer messages instantly.",
      href: "#"
    }
  ], { count: unpaid, title: "Notifications", emptyText: "No invoice notifications right now." });
  setHeaderBadgeCount(unpaid, 'button[aria-label="Notifications"] .badge');
}


async function loadProductsForInvoice() {
  try {
    const data = await getProducts();
    state.products = toArray(data)
      .filter((item) => !isSoftDeleted(item))
      .map((item) => ({ ...item, firebaseKey: String(item.firebaseKey || item.id || item.productId || item.key || "") }));
  } catch (error) {
    console.error("Load products for invoice failed:", error);
    state.products = [];
  }
  clampCartToStock();
  updateCartBadge();
  refreshInvoiceFormTotals();
}

function findProductKeyForInvoiceItem(item) {
  const itemKey = String(item?.productKey || item?.productId || item?.id || "").trim();
  if (!itemKey) return "";
  const product = state.products.find((candidate) => {
    const key = String(candidate?.firebaseKey || candidate?.id || candidate?.productId || candidate?.key || "").trim();
    return key === itemKey;
  });
  return String(product?.firebaseKey || product?.id || product?.productId || product?.key || "").trim();
}

async function updateProductStockAfterInvoice(items) {
  const list = toArray(items);
  if (!list.length) return;
  // Stock is reserved when products are added to the cart, so do not subtract again here.
  // Refresh local data so totals and badges stay in sync.
  await loadProductsForInvoice();
}


async function toggleInvoiceStatusAction(id) {
  const invoice = getInvoiceById(id);
  if (!invoice) return;
  const finalTotal = safeNumber(invoice.finalTotal ?? invoice.total ?? invoice.amount);
  const currentStatus = normalizeStatus(invoice.paymentStatus);

  if (currentStatus === "paid") {
    const restorePaidAmount = Number.isFinite(Number(invoice.previousPaidAmount))
      ? safeNumber(invoice.previousPaidAmount)
      : Math.max(0, Math.min(finalTotal, safeNumber(invoice.paidAmount ?? 0)));
    const restoreBalance = Number.isFinite(Number(invoice.previousBalance))
      ? safeNumber(invoice.previousBalance)
      : Math.max(0, finalTotal - restorePaidAmount);
    const restoreStatus = normalizeStatus(invoice.previousPaymentStatus || (restorePaidAmount > 0 ? "partial" : "unpaid"));
    await updateInvoice(id, {
      paymentStatus: restoreStatus,
      paidAmount: restorePaidAmount,
      balance: restoreBalance,
      previousPaidAmount: null,
      previousBalance: null,
      previousPaymentStatus: null,
      updatedAt: Date.now(),
    });
    showToast(`Invoice restored to ${capitalize(restoreStatus)}.`, "info", "Invoice");
  } else {
    const previousPaidAmount = safeNumber(invoice.paidAmount ?? 0);
    const previousBalance = safeNumber(invoice.balance ?? Math.max(0, finalTotal - previousPaidAmount));
    await updateInvoice(id, {
      paymentStatus: "paid",
      paidAmount: finalTotal,
      balance: 0,
      previousPaidAmount,
      previousBalance,
      previousPaymentStatus: currentStatus,
      updatedAt: Date.now(),
    });
    showToast(`Invoice marked as Paid.`, "success", "Invoice");
  }
  await loadInvoices();
  const openModal = document.getElementById("invoiceViewModal");
  if (openModal?.classList.contains("show")) {
    openInvoiceViewModal(getInvoiceById(id) || invoice);
  }
}
function renderInvoiceSkeletonRows(count = 5) {
  return Array.from({ length: count }, () => `
    <tr class="invoice-skeleton-row">
      <td colspan="5">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-3 p-2">
          <div class="flex-grow-1">
            <div class="skeleton-line mb-2" style="width: 150px;"></div>
            <div class="skeleton-line" style="width: 90px;"></div>
          </div>
          <div class="flex-grow-1">
            <div class="skeleton-line mb-2" style="width: 130px;"></div>
            <div class="skeleton-line" style="width: 80px;"></div>
          </div>
          <div class="flex-grow-1">
            <div class="skeleton-line mb-2" style="width: 120px;"></div>
            <div class="skeleton-line" style="width: 70px;"></div>
          </div>
        </div>
      </td>
    </tr>`).join('');
}

function renderInvoices() {
  const tbody = getTableBody();
  if (!tbody) return;

  applyFilters();
  renderSummary();
  updateInvoiceNotificationBadge();

  if (!state.filtered.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center text-muted py-4">
          No invoices found.
        </td>
      </tr>
    `;
    return;
  }

  const rowsLimit = getRowsLimit(state.rowsFilter, 5);
  const visible = Number.isFinite(rowsLimit) ? state.filtered.slice(0, rowsLimit) : state.filtered;

  tbody.innerHTML = visible
    .map((invoice) => {
      const status = normalizeStatus(invoice.paymentStatus);
      const finalTotal = safeNumber(invoice.finalTotal ?? invoice.total ?? invoice.amount);
      const paidAmount = safeNumber(invoice.paidAmount ?? invoice.paid ?? (status === "paid" ? finalTotal : 0));
      const customer = invoice.customerName || (normalizeStatus(invoice.invoiceType) === "direct sale" ? "Direct Sale" : "—");
      const phone = invoice.customerPhone || "—";
      const invoiceId = sanitizeInvoiceId(invoice.id || invoice.invoiceNumber);
      const { date, time } = formatInvoiceDateParts(invoice.createdAt);
      const items = toArray(invoice.items || []);
      const itemName = items.length ? capitalize(String(items[0]?.name || items[0]?.productName || items[0]?.title || "Item").trim()) : "No items";
      const extraCount = Math.max(0, items.length - 1);
      const itemsPreview = extraCount > 0 ? `${itemName} +${extraCount}` : itemName;
      return `
        <tr data-invoice-row="${invoiceId}">
          <td data-label="Invoice ID" class="fw-semibold invoice-id-cell">
            <div class="d-flex flex-column gap-1 min-w-0">
              <div class="fw-bold text-truncate">${invoice.invoiceNumber || invoiceId || "—"}</div>
              <div class="small text-muted text-nowrap">${escapeHtml(`${date} ${time}`.trim())}</div>
            </div>
          </td>
          <td data-label="Customer">
            <div class="fw-semibold text-truncate">${escapeHtml(customer)}</div>
            <div class="small text-muted text-nowrap">${escapeHtml(phone)}</div>
          </td>
          <td data-label="Items">
            <div class="fw-semibold text-truncate">${escapeHtml(itemsPreview)}</div>
          </td>
          <td data-label="Payment" class="invoice-payment-cell">
            <div class="d-flex flex-wrap gap-2 align-items-center text-nowrap">
              <span class="mini-pill bg-soft-primary text-primary-soft">${formatCurrency(finalTotal)}</span>
              <span class="mini-pill bg-soft-success text-success-soft">${formatCurrency(paidAmount)}</span>
              <span class="mini-pill bg-soft-danger text-danger-soft invoice-balance-pill">${formatCurrency(Math.max(0, safeNumber(invoice.balance ?? finalTotal - paidAmount)))}</span>
              <span class="badge ${statusBadge(status)} status-pill">${labels[status] || capitalize(status)}</span>
            </div>
          </td>
          <td data-label="Actions" class="invoice-actions-cell text-end">
            <div class="invoice-action-grid">
              <button class="btn btn-outline-secondary invoice-row-action-btn" data-action="view" data-id="${invoiceId}" title="View">
                <i class="bi bi-eye"></i><span>View</span>
              </button>
              <button class="btn btn-outline-success invoice-row-action-btn" data-action="whatsapp" data-id="${invoiceId}" title="WhatsApp">
                <i class="bi bi-whatsapp"></i><span>WhatsApp</span>
              </button>
              <button class="btn btn-outline-success invoice-row-action-btn" data-action="pay" data-id="${invoiceId}" title="Pay">
                <i class="bi bi-cash-coin"></i><span>Pay</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
  renderTrashInvoices();
}

function updateCartTotalsPreview(subtotal, discount, finalTotal) {
  const values = qsa(".quick-box .fw-bold.fs-5, .quick-box .pay-total");
  if (values[0]) values[0].textContent = formatCurrency(subtotal);
  if (values[1]) values[1].textContent = formatCurrency(discount);
  if (values[2]) values[2].textContent = formatCurrency(finalTotal);
}

function getCartBadge() {
  return document.getElementById("invoiceCartBadge");
}

function updateCartBadge() {
  const badge = getCartBadge();
  const count = getCartItemsForInvoice().reduce((sum, item) => sum + safeNumber(item.qty, 1), 0);
  if (badge) badge.textContent = String(count);
  localStorage.setItem("electronicShopCartCount", String(count));
  return count;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}

function setButtonLoading(button, isLoading, loadingText = "Saving...") {
  if (!button) return;
  if (isLoading) {
    if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>${loadingText}`;
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }
}

function renderCartModal() {
  const modalBody = document.getElementById("invoiceCartModalBody");
  const summary = document.getElementById("invoiceCartModalSummary");
  if (!modalBody || !summary) return;

  const items = getCartItemsForInvoice();
  const subtotal = getCartTotalFromItems(items);
  const discount = Math.max(0, safeNumber(document.getElementById("invoiceDiscount")?.value, 0));
  const finalTotal = Math.max(0, subtotal - discount);
  const count = items.reduce((sum, item) => sum + safeNumber(item.qty, 1), 0);

  summary.innerHTML = `
    <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center">
      <div><div class="summary-label mb-1">Items</div><div class="summary-value">${count}</div></div>
      <div><div class="summary-label mb-1">Subtotal</div><div class="summary-value">${formatCurrency(subtotal)}</div></div>
      <div><div class="summary-label mb-1">Discount</div><div class="summary-value">${formatCurrency(discount)}</div></div>
      <div><div class="summary-label mb-1">Total</div><div class="summary-value">${formatCurrency(finalTotal)}</div></div>
    </div>`;

  if (!items.length) {
    modalBody.innerHTML = '<div class="text-center text-muted py-4">Cart is empty.</div>';
    return;
  }

  modalBody.innerHTML = items.map((item) => `
    <div class="cart-item">
      <div class="d-flex justify-content-between align-items-start gap-3">
        <div>
          <div class="fw-bold">${escapeHtml(item.name || 'Item')}</div>
          <small class="text-muted d-block">Category: ${escapeHtml(item.category || item.type || '—')}</small>
          <small class="text-muted d-block">Qty: ${safeNumber(item.qty, 1)} × ${formatCurrency(safeNumber(item.price, 0))}</small>
        </div>
        <div class="fw-bold">${formatCurrency(safeNumber(item.qty, 1) * safeNumber(item.price, 0))}</div>
      </div>
    </div>`).join('');
}


function renderInvoiceInlinePreview(invoice = null) {
  const modal = document.getElementById("newInvoiceModal");
  if (!modal) return;
  let preview = document.getElementById("invoiceInlinePreview");
  if (!preview) {
    preview = document.createElement("div");
    preview.id = "invoiceInlinePreview";
    preview.className = "card-shell p-3 mb-3";
    const body = modal.querySelector(".modal-body");
    if (body) body.insertBefore(preview, body.firstElementChild);
  }
  const items = invoice ? toArray(invoice.items || []) : getCartItemsForInvoice();
  const listHtml = items.length ? items.map((item) => {
    const qty = safeNumber(item.qty, 1);
    const price = safeNumber(item.price ?? item.unitPrice ?? 0);
    const total = qty * price;
    return `<div class="d-flex align-items-start justify-content-between gap-3 py-2 border-bottom">
      <div>
        <div class="fw-semibold">${escapeHtml(item.name || item.productName || 'Item')}</div>
        <small class="text-muted d-block">Category: ${escapeHtml(item.category || item.type || '—')}</small>
        <small class="text-muted d-block">Qty: ${qty} × ${formatCurrency(price)}</small>
      </div>
      <div class="fw-bold">${formatCurrency(total)}</div>
    </div>`;
  }).join("") : '<div class="text-muted">No items yet.</div>';
  preview.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-2">
      <div>
        <div class="fw-bold">${invoice ? 'Invoice item list' : 'Cart preview'}</div>
        <div class="text-muted small">${invoice ? 'Read-only items for payment review.' : 'Products selected for this invoice.'}</div>
      </div>
      <span class="badge bg-soft-primary text-primary-soft">${items.length} items</span>
    </div>
    <div class="d-grid gap-2" style="max-height: 220px; overflow:auto;">${listHtml}</div>
  `;
}

function refreshInvoiceFormTotals() {
  const fields = getModalFields();
  if (!fields) return;

  const isPayMode = state.editingMode === 'pay';
  const editingInvoice = isPayMode ? getInvoiceById(state.editingId) : null;

  if (isPayMode && editingInvoice) {
    const finalTotal = Math.max(0, safeNumber(editingInvoice.finalTotal ?? editingInvoice.total ?? editingInvoice.amount ?? 0));
    const previousPaid = Math.max(0, safeNumber(editingInvoice.paidAmount ?? 0));
    const paidNow = clampInvoicePaidNow(fields, { silent: true });
    const totalPaid = Math.min(finalTotal, previousPaid + paidNow);
    const remaining = Math.max(0, finalTotal - totalPaid);
    if (fields.totalAmount) fields.totalAmount.value = formatCurrency(finalTotal);
    if (fields.totalPaid) fields.totalPaid.value = formatCurrency(previousPaid);
    if (fields.remaining) fields.remaining.value = formatCurrency(remaining);
    if (fields.paymentStatus) fields.paymentStatus.value = totalPaid >= finalTotal && finalTotal > 0 ? 'Paid' : totalPaid > 0 ? 'Partial' : 'Unpaid';
    const label = document.getElementById('invoicePaidAmountLabel');
    if (label) label.textContent = 'Paid Now';
    return;
  }

  const items = getCartItemsForInvoice();
  const subtotal = getCartTotalFromItems(items);
  const discount = Math.max(0, safeNumber(fields.discount?.value, 0));
  const finalTotal = Math.max(0, subtotal - discount);
  const paidInput = Math.max(0, safeNumber(fields.paidAmount?.value, 0));

  if (fields.totalAmount) fields.totalAmount.value = formatCurrency(subtotal);
  if (fields.remaining) fields.remaining.value = String(Math.max(0, finalTotal - Math.min(paidInput, finalTotal)));
  if (fields.paymentStatus) {
    fields.paymentStatus.value = paidInput >= finalTotal && finalTotal > 0 ? 'Paid' : paidInput > 0 ? 'Partial' : 'Unpaid';
  }
  renderCartModal();
}

function clampCartToStock() {
  const cart = getCart();
  if (!cart.length) return;
  const productsById = new Map(state.products.map((product) => [String(product.id || product.productId), product]));
  let changed = false;
  const next = cart.map((item) => {
    const product = productsById.get(String(item.id));
    const available = Math.max(0, safeNumber(product?.quantity, item.qty));
    const qty = Math.max(0, Math.min(safeNumber(item.qty, 1), available));
    if (qty !== safeNumber(item.qty, 1)) changed = true;
    return { ...item, qty, stock: available };
  }).filter((item) => item.qty > 0);
  if (changed) {
    localStorage.setItem(CART_KEY, JSON.stringify(next));
  }
}

async function saveInvoiceWithGuard(action) {
  if (state.savingInvoice) return;
  state.savingInvoice = true;
  try {
    await action();
  } finally {
    state.savingInvoice = false;
  }
}

function setCreateFieldValues(invoice) {
  const fields = getCreateFields();
  if (fields.customerName) fields.customerName.value = invoice?.customerName || "";
  if (fields.customerPhone) fields.customerPhone.value = invoice?.customerPhone || "";
  if (fields.invoiceType) fields.invoiceType.value = invoice?.invoiceType || "Invoice";
  if (fields.paymentStatus) fields.paymentStatus.value = capitalize(invoice?.paymentStatus || "Unpaid");
  if (fields.totalAmount) fields.totalAmount.value = formatCurrency(safeNumber(invoice?.subtotal ?? invoice?.finalTotal ?? 0));
  if (fields.discount) fields.discount.value = invoice?.discount ?? getStoredCartDiscount();
  if (fields.paidAmount) fields.paidAmount.value = state.editingMode === 'pay' ? "" : (invoice?.paidAmount ?? "");
  if (fields.remaining) fields.remaining.value = invoice?.balance ?? "";
  if (fields.customerWhatsapp) fields.customerWhatsapp.value = invoice?.customerWhatsapp || invoice?.whatsapp || invoice?.customerPhone || "";
  if (fields.senderNumber) fields.senderNumber.value = invoice?.senderNumber || invoice?.moneySenderNumber || invoice?.customerPhone || "";
  if (fields.paymentType) fields.paymentType.value = invoice?.paymentType || "Mobile Money";
  if (fields.paymentProvider) fields.paymentProvider.value = invoice?.paymentProvider || "Evc Plus";
  if (fields.cashCurrency) fields.cashCurrency.value = invoice?.cashCurrency || "Somali Shillings";
  if (fields.notes) fields.notes.value = invoice?.notes || "";
  syncInvoicePaymentFields(fields);
}

function getCreateData() {
  const fields = getCreateFields();
  const mode = state.pageMode;
  const customerName = fields.customerName?.value.trim() || "";
  const customerPhone = fields.customerPhone?.value.trim() || "";
  const invoiceType = fields.invoiceType?.value || "Invoice";
  const paymentStatusRaw = fields.paymentStatus?.value || "Unpaid";
  const discount = safeNumber(fields.discount?.value, 0);
  const paidAmountInput = safeNumber(fields.paidAmount?.value, 0);
  const customerWhatsapp = fields.customerWhatsapp?.value.trim() || customerPhone;
  const senderNumber = fields.senderNumber?.value.trim() || customerPhone;
  const paymentType = fields.paymentType?.value || "Mobile Money";
  const paymentProvider = fields.paymentProvider?.value || "Evc Plus";
  const cashCurrency = fields.cashCurrency?.value || "Somali Shillings";
  const notes = fields.notes?.value.trim() || "";
  const items = getCartItemsForInvoice();
  const totals = computeInvoiceTotals(items, discount, paidAmountInput);
  const fallbackStatus = normalizeStatus(paymentStatusRaw);
  const computedStatus = paymentStatusFromTotals(totals.finalTotal, totals.paidAmount, fallbackStatus);
  const isDirectSale = normalizeText(invoiceType) === "direct sale" || mode === "sell";

  return {
    customerName: isDirectSale ? customerName || "Direct Sale Customer" : customerName,
    customerPhone: isDirectSale ? customerPhone : customerPhone,
    customerWhatsapp: isDirectSale ? customerWhatsapp : customerWhatsapp,
    senderNumber,
    paymentType,
    paymentProvider,
    cashCurrency,
    invoiceType: isDirectSale ? "Direct Sale" : "Invoice",
    paymentStatus: computedStatus,
    discount: totals.discount,
    paidAmount: totals.paidAmount,
    balance: totals.remaining,
    subtotal: totals.subtotal,
    finalTotal: totals.finalTotal,
    paidInput: paidAmountInput,
    notes,
    items,
  };
}

function validateCreateData(data) {
  if (!data.items.length) {
    showToast("Add products to the cart before saving an invoice.", "warning", "Invoice");
    return false;
  }
  if (!data.customerName) {
    showToast("Customer name is required for invoice flow.", "warning", "Invoice");
    return false;
  }
  if (data.invoiceType !== "Direct Sale" && !data.customerPhone) {
    showToast("Customer phone number is required for invoice flow.", "warning", "Invoice");
    return false;
  }
  if (safeNumber(data.paidInput) > safeNumber(data.finalTotal)) {
    showToast("Paid amount cannot be bigger than total amount.", "warning", "Invoice");
    return false;
  }
  if (safeNumber(data.paidInput) < 0) {
    showToast("Paid amount cannot be negative.", "warning", "Invoice");
    return false;
  }
  return true;
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getInvoiceSendLog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(INVOICE_SEND_LOG_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveInvoiceSendLog(entries) {
  localStorage.setItem(INVOICE_SEND_LOG_KEY, JSON.stringify(Array.isArray(entries) ? entries : []));
}

function hasInvoiceBeenSentToday(invoiceId, channel) {
  const key = String(invoiceId || "");
  const kind = String(channel || "whatsapp");
  const today = todayKey();
  return getInvoiceSendLog().some((item) => String(item?.invoiceId || "") === key && String(item?.channel || "") === kind && String(item?.dateKey || "") === today);
}

function markInvoiceSent(invoice, channel) {
  const invoiceId = sanitizeInvoiceId(invoice?.id || invoice?.invoiceNumber);
  if (!invoiceId) return;
  const entries = getInvoiceSendLog().filter((item) => !(String(item?.invoiceId || "") === invoiceId && String(item?.channel || "") === String(channel || "whatsapp") && String(item?.dateKey || "") === todayKey()));
  entries.unshift({
    invoiceId,
    channel: String(channel || "whatsapp"),
    dateKey: todayKey(),
    sentAt: Date.now(),
    customerName: invoice?.customerName || "",
    phone: invoice?.customerPhone || ""
  });
  saveInvoiceSendLog(entries.slice(0, 200));
}

function buildMessage(invoice, channel = "whatsapp") {
  const status = normalizeStatus(invoice.paymentStatus);
  const name = invoice.customerName || "Saaxiib";
  const phone = invoice.customerPhone || "—";
  const invoiceNo = invoice.invoiceNumber || invoice.id || "—";
  const total = safeNumber(invoice.finalTotal ?? invoice.total ?? invoice.amount ?? 0);
  const paid = safeNumber(invoice.paidAmount ?? 0);
  const remaining = Math.max(0, safeNumber(invoice.balance ?? total - paid));
  const discount = safeNumber(invoice.discount ?? 0);
  const totalText = formatCurrency(total);
  const paidText = formatCurrency(paid);
  const remainingText = formatCurrency(remaining);
  const discountText = formatCurrency(discount);
  const ussd = `${getPaymentShortcode()}${Math.max(1, Math.round(total))}#`;
  const footer = `${getShopName()} (${getShopPhone()})`;

  const websiteLine = " https://waasuge-electricity.netlify.app/";

  if (status === "paid") {
    return [
      `Asc ${name} : ${phone}`,
      `Invoice No: ${invoiceNo}`,
      `Status: Paid`, `Bixisay: ${paidText}`,
      `Mahadsanid`,
      websiteLine,
      footer
    ].join("\n");
  }

  if (status === "partial") {
    return [
      `Asc ${name} : ${phone}`,
      `Invoice No: ${invoiceNo}`,
      `Status: Partial`,`Total: ${totalText}`,
      `Discount: ${discountText}`,
      `Bixisay: ${paidText} Haraaga Hada: ${remainingText}`,
      ussd,
      `Waad ku mahadsantahay adeegaaga`,
      websiteLine,
      footer
    ].join("\n");
  }

  return [
    `Asc ${name} : ${phone}`,
    `Invoice No: ${invoiceNo}`,
    `Status: Unpaid`, `Total: ${totalText}`,
    `Haraaga: ${remainingText}`,
    ussd,
    `Waad ku mahadsantahay adeegaaga`,
    websiteLine,
    footer
  ].join("\n");
}

function openShareInvoice(invoice, channel = "whatsapp") {
  const message = encodeURIComponent(buildMessage(invoice, channel));
  const phone = String(invoice?.customerPhone || "").replace(/\D/g, "");
  if (String(channel) === "sms") {
    const smsUrl = phone ? `sms:${phone}?body=${message}` : `sms:?body=${message}`;
    window.open(smsUrl, "_self");
    return;
  }
  const url = phone ? `https://wa.me/${phone}?text=${message}` : `https://wa.me/?text=${message}`;
  window.open(url, "_blank", "noopener,noreferrer");
}



function normalizeCustomerHistoryKey(record = {}) {
  return normalizeText(
    record?.customerPhone ||
    record?.phone ||
    record?.customerName ||
    record?.customer ||
    record?.clientName ||
    record?.customerId ||
    record?.clientId ||
    ""
  );
}


function formatInvoiceHistoryRows(invoices = [], repairs = [], seed = {}, payments = []) {
  const customerKey = normalizeCustomerHistoryKey(seed);
  const invoiceList = getActiveRecords(invoices).filter((item) => normalizeCustomerHistoryKey(item) === customerKey);
  const repairList = getActiveRecords(repairs).filter((item) => normalizeCustomerHistoryKey(item) === customerKey);

  const invoiceRows = invoiceList
    .sort((a, b) => Number(b?.createdAt || b?.updatedAt || 0) - Number(a?.createdAt || a?.updatedAt || 0))
    .map((invoice) => {
      const amount = safeNumber(invoice?.finalTotal ?? invoice?.total ?? invoice?.amount ?? 0);
      const paid = safeNumber(invoice?.paidAmount ?? invoice?.paid ?? 0);
      const remaining = Math.max(0, amount - paid);
      const stamp = Number(invoice?.createdAt || invoice?.updatedAt || Date.now());
      return {
        type: "Invoice",
        ref: invoice?.invoiceNumber || invoice?.id || "—",
        title: String(invoice?.notes || invoice?.paymentStatus || "Invoice").trim() || "Invoice",
        phone: invoice?.customerPhone || invoice?.phone || "—",
        whatsapp: invoice?.customerWhatsapp || invoice?.whatsapp || invoice?.customerPhone || invoice?.phone || "—",
        sender: invoice?.senderNumber || invoice?.paymentSenderNumber || invoice?.customerPhone || invoice?.phone || "—",
        paymentType: invoice?.paymentType || "—",
        paymentProvider: invoice?.paymentProvider || invoice?.cashCurrency || "—",
        cashCurrency: invoice?.cashCurrency || "—",
        amount: formatCurrency(amount),
        date: formatFriendlyDate(stamp),
        stamp,
        paid,
        remaining,
        notes: invoice?.notes || invoice?.paymentNotes || "—",
      };
    });

  const repairRows = repairList
    .sort((a, b) => Number(b?.createdAt || b?.updatedAt || 0) - Number(a?.createdAt || a?.updatedAt || 0))
    .map((repair) => {
      const amount = safeNumber(repair?.finalTotal ?? repair?.price ?? 0);
      const paid = safeNumber(repair?.paidAmount ?? repair?.paid ?? 0);
      const remaining = Math.max(0, amount - paid);
      const stamp = Number(repair?.createdAt || repair?.updatedAt || Date.now());
      return {
        type: "Repair",
        ref: repair?.repairNumber || repair?.id || "—",
        title: String(repair?.deviceName || repair?.problem || "Repair job").trim() || "Repair job",
        phone: repair?.customerPhone || repair?.phone || "—",
        whatsapp: repair?.customerWhatsapp || repair?.whatsapp || repair?.customerPhone || repair?.phone || "—",
        sender: repair?.senderNumber || repair?.paymentSenderNumber || repair?.customerPhone || repair?.phone || "—",
        paymentType: repair?.paymentType || "—",
        paymentProvider: repair?.paymentProvider || repair?.cashCurrency || "—",
        cashCurrency: repair?.cashCurrency || "—",
        amount: formatCurrency(amount),
        date: formatFriendlyDate(stamp),
        stamp,
        paid,
        remaining,
        notes: repair?.notes || repair?.repairNotes || "—",
      };
    });

  const paymentRows = toArray(payments)
    .filter((item) => normalizeCustomerHistoryKey(item) === customerKey || String(item?.customerId || "") === String(seed?.customerId || ""))
    .sort((a, b) => Number(b?.createdAt || b?.updatedAt || 0) - Number(a?.createdAt || a?.updatedAt || 0))
    .map((payment) => {
      const paidNow = safeNumber(payment?.paidNow ?? payment?.amount ?? payment?.paidAmount ?? 0);
      const totalPaid = safeNumber(payment?.totalPaid ?? payment?.paidAmount ?? 0);
      const remaining = safeNumber(payment?.totalRemaining ?? payment?.remaining ?? 0);
      const stamp = Number(payment?.createdAt || payment?.updatedAt || Date.now());
      return {
        type: payment?.relatedType === "repair" ? "Repair Payment" : "Invoice Payment",
        ref: payment?.relatedNumber || payment?.invoiceNumber || payment?.repairNumber || payment?.relatedId || payment?.id || "—",
        title: String(payment?.paymentProvider || payment?.paymentType || payment?.cashCurrency || "Payment").trim() || "Payment",
        phone: payment?.customerPhone || payment?.phone || "—",
        whatsapp: payment?.customerWhatsapp || payment?.whatsapp || payment?.customerPhone || payment?.phone || "—",
        sender: payment?.senderNumber || payment?.mobileSenderNumber || payment?.customerPhone || "—",
        paymentType: payment?.paymentType || "—",
        paymentProvider: payment?.paymentProvider || payment?.cashCurrency || "—",
        cashCurrency: payment?.cashCurrency || "—",
        amount: formatCurrency(safeNumber(payment?.totalAmount ?? payment?.finalTotal ?? paidNow)),
        date: formatFriendlyDate(stamp),
        stamp,
        paid: totalPaid,
        remaining,
        notes: payment?.notes || `Paid now: ${formatCurrency(paidNow)}`,
      };
    });

  const combined = [...invoiceRows, ...repairRows, ...paymentRows].sort((a, b) => (b.stamp || 0) - (a.stamp || 0));
  const totals = [...invoiceList, ...repairList].reduce((acc, item) => {
    const total = safeNumber(item?.finalTotal ?? item?.total ?? item?.amount ?? item?.price ?? 0);
    const paid = safeNumber(item?.paidAmount ?? item?.paid ?? 0);
    acc.totalSpent += total;
    acc.totalPaid += paid;
    acc.totalRemaining += Math.max(0, total - paid);
    acc.items += 1;
    return acc;
  }, { totalSpent: 0, totalPaid: 0, totalRemaining: 0, items: 0 });

  const summary = {
    customerName: seed?.customerName || seed?.customer || "Customer",
    phone: seed?.customerPhone || seed?.phone || "—",
    totalInvoices: invoiceRows.length,
    totalRepairs: repairRows.length,
    totalSpent: formatCurrency(totals.totalSpent),
    totalPaid: formatCurrency(totals.totalPaid),
    totalRemaining: formatCurrency(totals.totalRemaining),
    historyCount: totals.items,
    lastVisit: combined[0]?.date || "—"
  };

  return { summary, combined };
}


function renderCustomerHistoryHtml(summary, rows) {
  const rowMarkup = rows.length
    ? rows.map((row) => `
        <tr>
          <td><span class="badge bg-soft-${row.type === "Invoice" ? "primary" : "success"} text-${row.type === "Invoice" ? "primary" : "success"}-soft">${row.type}</span></td>
          <td class="fw-semibold">${escapeHtml(row.ref)}</td>
          <td>${escapeHtml(row.title)}</td>
          <td>${escapeHtml(row.phone || '—')}</td>
          <td>${escapeHtml(row.whatsapp || '—')}</td>
          <td>${escapeHtml(row.sender || '—')}</td>
          <td>${escapeHtml(row.paymentType || '—')}</td>
          <td>${escapeHtml(row.paymentProvider || row.cashCurrency || '—')}</td>
          <td class="text-nowrap">${escapeHtml(row.paid !== undefined ? formatCurrency(row.paid) : row.amount)}</td>
          <td class="text-nowrap">${escapeHtml(row.remaining !== undefined ? formatCurrency(row.remaining) : '—')}</td>
          <td class="text-nowrap">${escapeHtml(row.amount)}</td>
          <td class="text-nowrap">${escapeHtml(row.date)}</td>
          <td>${escapeHtml(row.notes || '—')}</td>
        </tr>`).join("")
    : `<tr><td colspan="13" class="text-center text-muted py-4">No history found for this customer.</td></tr>`;

  const message = encodeURIComponent(buildCustomerContactMessage(summary));
  const phoneDigits = String(summary?.phone || "").replace(/\D/g, "");
  const whatsappUrl = phoneDigits ? `https://wa.me/${phoneDigits}?text=${message}` : `https://wa.me/?text=${message}`;
  const smsUrl = phoneDigits ? `sms:${phoneDigits}?body=${message}` : `sms:?body=${message}`;

  return `
    <div class="row g-3 mb-3">
      <div class="col-12 col-sm-6 col-xl-3"><div class="quick-box"><div class="summary-label">Customer</div><div class="summary-value fs-5">${escapeHtml(summary.customerName)}</div></div></div>
      <div class="col-12 col-sm-6 col-xl-3"><div class="quick-box"><div class="summary-label">Phone</div><div class="summary-value fs-5">${escapeHtml(summary.phone)}</div></div></div>
      <div class="col-12 col-sm-6 col-xl-3"><div class="quick-box"><div class="summary-label">Invoices</div><div class="summary-value fs-5">${summary.totalInvoices}</div></div></div>
      <div class="col-12 col-sm-6 col-xl-3"><div class="quick-box"><div class="summary-label">Repairs</div><div class="summary-value fs-5">${summary.totalRepairs}</div></div></div>
      <div class="col-12 col-sm-6 col-xl-4"><div class="quick-box"><div class="summary-label">Total all</div><div class="summary-value fs-5">${escapeHtml(summary.totalSpent)}</div></div></div>
      <div class="col-12 col-sm-6 col-xl-4"><div class="quick-box"><div class="summary-label">Total paid</div><div class="summary-value fs-5">${escapeHtml(summary.totalPaid)}</div></div></div>
      <div class="col-12 col-sm-6 col-xl-4"><div class="quick-box"><div class="summary-label">Total remaining</div><div class="summary-value fs-5">${escapeHtml(summary.totalRemaining)}</div></div></div>
    </div>
    <div class="d-flex flex-wrap gap-2 mb-3">
      <a class="btn btn-success rounded-4" href="${whatsappUrl}" target="_blank" rel="noopener noreferrer"><i class="bi bi-whatsapp me-1"></i> WhatsApp</a>
      <a class="btn btn-outline-primary rounded-4" href="${smsUrl}"><i class="bi bi-chat-dots me-1"></i> SMS</a>
    </div>
    <div class="card-shell">
      <div class="section-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <h6 class="fw-bold mb-0">Customer History</h6>
        <div class="mini-pill bg-soft-primary text-primary-soft">Last visit: ${escapeHtml(summary.lastVisit)}</div>
      </div>
      <div class="section-body table-responsive">
        <table class="table align-middle mb-0">
          <thead><tr><th>Type</th><th>Reference</th><th>Details</th><th>Phone</th><th>WhatsApp</th><th>Sender</th><th>Payment Type</th><th>Provider/Currency</th><th>Paid</th><th>Remaining</th><th>Total</th><th>Date</th><th>Notes</th></tr></thead>
          <tbody>${rowMarkup}</tbody>
        </table>
      </div>
    </div>`;
}

async function openInvoiceCustomerHistory(invoice) {
  const modalEl = document.getElementById("invoiceCustomerHistoryModal");
  const bodyEl = document.getElementById("invoiceCustomerHistoryBody");
  const titleEl = document.getElementById("invoiceCustomerHistoryTitle");
  if (!modalEl || !bodyEl) return;

  bodyEl.innerHTML = '<div class="text-center text-muted py-5"><div class="spinner-border text-primary mb-3" role="status"></div><div>Loading customer history...</div></div>';
  if (titleEl) titleEl.textContent = `${invoice?.customerName || "Customer"} history`;
  openModalOnTop(modalEl);

  try {
    const [repairsRaw, paymentsRaw] = await Promise.all([getRepairs(), getPayments().catch(() => null)]);
    state.repairs = toArray(repairsRaw);
    const payments = toArray(paymentsRaw);
    const { summary, combined } = formatInvoiceHistoryRows(state.invoices, state.repairs, invoice || {}, payments);
    bodyEl.innerHTML = renderCustomerHistoryHtml(summary, combined);
  } catch (error) {
    console.error("Customer history load failed:", error);
    bodyEl.innerHTML = '<div class="alert alert-warning mb-0">Could not load customer history right now.</div>';
  }
}



function printInvoice(invoice) {
  const printing = getPrintingSettings();
  const receiptSize = String(printing?.receiptSize || "80mm");
  const paperWidth = receiptSize === "A4" ? "210mm" : receiptSize === "58mm" ? "58mm" : "80mm";
  const isA4 = receiptSize === "A4";
  const receiptClass = receiptSize === "58mm" ? "receipt-58" : receiptSize === "A4" ? "receipt-a4" : "receipt-80";
  const fontSizeMap = { small: "11px", medium: "12px", large: "13px", xlarge: "14px" };
  const baseFontSize = fontSizeMap[String(printing?.fontSize || "medium")] || "12px";
  const margins = printing?.margins || {};
  const topMargin = Number(margins.top ?? 10);
  const bottomMargin = Number(margins.bottom ?? 10);
  const leftMargin = Number(margins.left ?? 10);
  const rightMargin = Number(margins.right ?? 10);
  const padding = Number(margins.padding ?? 12);
  const shopName = escapeHtml(getShopName());
  const phone = escapeHtml(getShopPhone());
  const whatsapp = escapeHtml(getShopWhatsapp());
  const websiteUrl = getPublicWebsiteUrl();
  const website = escapeHtml(websiteUrl);
  const receiptNo = escapeHtml(invoice.invoiceNumber || invoice.id || "—");
  const receiptDate = escapeHtml(formatInvoiceDateParts(invoice.createdAt || Date.now()).date);
  const customerName = escapeHtml(invoice.customerName || "Direct Sale");
  const customerPhone = escapeHtml(invoice.customerPhone || "—");
  const status = escapeHtml(capitalize(invoice.paymentStatus));
  const subtotal = formatCurrency(invoice.subtotal ?? 0);
  const discount = formatCurrency(invoice.discount ?? 0);
  const paidAmount = formatCurrency(invoice.paidAmount ?? 0);
  const balanceAmount = Math.max(0, Number(invoice.balance ?? 0));
  const balance = formatCurrency(balanceAmount);
  const payCode = escapeHtml(getPaymentShortcodeForBalance(balanceAmount));
  const payQr = getDialerQrUrl(payCode);
  const websiteQr = getReceiptQrUrl(websiteUrl);
  const showPaymentHelp = balanceAmount > 0 && printing?.showQrCode !== false;
  const notes = escapeHtml(invoice.notes || "");
  const footerText = escapeHtml(getGeneralSettings().footerText || DEFAULT_SETTINGS.general.footerText || "Thank you for choosing Waasuge Electronics.");
  const servedBy = escapeHtml(localStorage.getItem("electronicShopAdminName") || localStorage.getItem("electronicShopAdminEmail") || "Current user");
  const items = toArray(invoice.items || []).map((item) => {
    const qty = safeNumber(item.qty, 1);
    const price = safeNumber(item.price ?? item.unitPrice ?? 0);
    return `<tr><td>${escapeHtml(item.name || item.productName || "Item")}</td><td>${qty}</td><td>${formatCurrency(price)}</td><td>${formatCurrency(qty * price)}</td></tr>`;
  }).join("");
  const copies = [];
  if (printing?.printCustomerCopy !== false) copies.push("customer");
  if (printing?.printShopCopy) copies.push("shop");
  if (!copies.length) copies.push("customer");
  const receiptLogo = printing?.showLogo !== false ? '<div class="receipt-logo"><i class="bi bi-shop"></i></div>' : "";
  const copiesHtml = copies.map((copy, index) => `
    <section class="receipt ${copy}-copy ${receiptClass}" style="${index ? 'page-break-before: always;' : ''}">
      <div class="receipt-copy-label">${getReceiptCopyLabel(copy)}</div>
      <header class="receipt-header">
        <div class="receipt-brand">
          ${receiptLogo}
          <div>
            <div class="shop-name">${shopName}</div>
            <div class="shop-subtitle">Shop & Mobile Repairing</div>
          </div>
        </div>
        <div class="receipt-meta">
          <div class="receipt-meta-label">Invoice</div>
          <strong>${receiptNo}</strong>
        </div>
      </header>
      <div class="receipt-contact">
        ${printing?.showPhoneNumber !== false ? `<div><i class="bi bi-telephone"></i> ${phone}</div>` : ""}
        ${printing?.showWhatsappNumber !== false ? `<div><i class="bi bi-whatsapp"></i> ${whatsapp}</div>` : ""}
        ${printing?.showAddress !== false ? `<div><i class="bi bi-geo-alt"></i> ${escapeHtml(getGeneralSettings().address || DEFAULT_SETTINGS.general.address)}</div>` : ""}
        <div><i class="bi bi-person-badge"></i> Served by: ${servedBy}</div>
      </div>
      <div class="receipt-card">
        <div class="row-line"><span>Customer</span><strong>${customerName}</strong></div>
        <div class="row-line"><span>Phone</span><strong>${customerPhone}</strong></div>
        <div class="row-line"><span>Status</span><strong class="payment-status payment-status--${normalizePaymentStatus(invoice.paymentStatus)}">${status}</strong></div>
      </div>
      <div class="receipt-table-wrap">
        <table class="receipt-table">
          <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>${items || `<tr><td colspan="4" style="text-align:center;color:#6b7280;">No items</td></tr>`}</tbody>
        </table>
      </div>
      <div class="receipt-card totals">
        <div class="row-line"><span>Subtotal</span><strong>${subtotal}</strong></div>
        <div class="row-line"><span>Discount</span><strong>${discount}</strong></div>
        <div class="row-line"><span>Paid</span><strong>${paidAmount}</strong></div>
        <div class="row-line total"><span>Remaining Balance</span><strong>${balance}</strong></div>
      </div>
      ${showPaymentHelp ? `
      <div class="receipt-paybox">
        <div class="pay-title">Habkaan Ubixi Lacagta</div>
        <div class="pay-code">${payCode}</div>
        <div class="pay-sub">Use your phone dialer or Ussd payment code with the remaining balance.</div>
      </div>
      <div class="receipt-qr-grid">
        <div class="qr-card"><img alt="Payment QR" src="${payQr}"><div>Scan to pay</div></div>
        <div class="qr-card"><img alt="Website QR" src="${websiteQr}"><div>Open website</div></div>
      </div>` : ""}
      ${notes ? `<div class="receipt-card notes"><strong>Notes:</strong> ${notes}</div>` : ""}
      <footer class="receipt-footer">
        <div class="footer-message">${footerText}</div>
        <div class="footer-website">${website}</div>
      </footer>
    </section>`).join("");

  const html = `
    <html>
      <head>
        <title>${receiptNo}</title>
        <meta charset="utf-8" />
        <style>
          @page { size: ${isA4 ? "A4 portrait" : `${paperWidth} 300mm`}; margin: ${topMargin}mm ${rightMargin}mm ${bottomMargin}mm ${leftMargin}mm; }
          * { box-sizing: border-box; }
          html, body {
            width: ${paperWidth};
            margin: 0;
            padding: 0;
            font-family: Arial, Helvetica, sans-serif;
            color: #0f172a;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            font-size: ${baseFontSize};
            line-height: 1.28;
          }
          body { padding: ${padding}px; }
          .receipt { width: 100%; page-break-inside: avoid; break-inside: avoid; }
          .receipt-58 { max-width: 58mm; }
          .receipt-80 { max-width: 80mm; }
          .receipt-a4 { max-width: 100%; }
          .receipt-copy-label { text-align: center; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #64748b; margin-bottom: 8px; font-weight: 700; }
          .receipt-header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 10px; }
          .receipt-brand { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
          .receipt-logo { width: 34px; height: 34px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: rgba(37, 99, 235, .1); color: #2563eb; flex: 0 0 auto; margin-top: 1px; }
          .receipt-logo i { font-size: 1.1em; line-height: 1; }
          .shop-name { font-size: 1.18em; font-weight: 800; line-height: 1.15; }
          .shop-subtitle { font-size: .84em; color: #64748b; margin-top: 2px; }
          .receipt-meta { text-align: right; font-size: .88em; color: #334155; display: grid; gap: 2px; }
          .receipt-meta-label { text-transform: uppercase; letter-spacing: .08em; font-size: .78em; color: #64748b; font-weight: 800; }
          .receipt-contact { display: grid; gap: 4px; font-size: .84em; color: #334155; margin-bottom: 10px; }
          .receipt-card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 10px; margin-bottom: 10px; background: #fff; }
          .receipt-card.totals { background: linear-gradient(180deg, #f8fbff, #ffffff); }
          .row-line { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; margin: 4px 0; }
          .row-line span { color: #64748b; }
          .row-line strong { text-align: right; word-break: break-word; }
          .payment-status { display: inline-flex; align-items: center; justify-content: center; padding: 2px 10px; border-radius: 999px; font-weight: 800; letter-spacing: .02em; }
          .payment-status--paid { color: #166534; background: #dcfce7; }
          .payment-status--partial { color: #92400e; background: #fef3c7; }
          .payment-status--unpaid { color: #991b1b; background: #fee2e2; }
          .receipt-table-wrap { margin: 10px 0; }
          .receipt-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .receipt-table th, .receipt-table td { border-bottom: 1px dashed #cbd5e1; padding: 5px 0; text-align: left; vertical-align: top; word-wrap: break-word; }
          .receipt-table th { font-size: .82em; color: #64748b; }
          .receipt-table td:nth-child(2), .receipt-table td:nth-child(3), .receipt-table td:nth-child(4), .receipt-table th:nth-child(2), .receipt-table th:nth-child(3), .receipt-table th:nth-child(4) { text-align: right; }
          .totals .total { font-size: 1.05em; font-weight: 800; }
          .receipt-paybox { border: 1.5px dashed #2563eb; border-radius: 14px; padding: 10px; margin-bottom: 10px; background: linear-gradient(180deg, rgba(37,99,235,.06), rgba(37,99,235,.02)); text-align: center; }
          .pay-title { font-size: .82em; text-transform: uppercase; letter-spacing: .08em; color: #1d4ed8; font-weight: 900; }
          .pay-code { font-size: 1.08em; font-weight: 900; margin-top: 4px; word-break: break-all; color: #0f172a; }
          .pay-sub { font-size: .8em; color: #64748b; margin-top: 4px; }
          .receipt-qr-grid { display: grid; grid-template-columns: ${isA4 ? "1fr 1fr" : "1fr"}; gap: 8px; margin-bottom: 10px; }
          .qr-card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 8px; text-align: center; background: #fff; }
          .qr-card img { width: 100%; max-width: ${isA4 ? "110px" : "92px"}; display: block; margin: 0 auto 4px; }
          .qr-card div { font-size: .78em; color: #475569; font-weight: 700; }
          .receipt-footer { display: grid; justify-items: center; gap: 4px; font-size: .8em; color: #475569; border-top: 1px solid #e2e8f0; padding-top: 8px; text-align: center; }
          .footer-message, .footer-website { width: 100%; }
          .footer-website { color: #1d4ed8; word-break: break-word; }
        </style>
      </head>
      <body>
        ${copiesHtml}
        <script>window.onload=function(){window.print();setTimeout(()=>window.close(),350)}</script>
      </body>
    </html>
  `;
  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    showToast("Popup blocked. Please allow popups for printing.", "warning", "Print");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function getInvoiceById(id) {
  return state.invoices.find((invoice) => String(invoice.id || invoice.invoiceNumber) === String(id)) || null;
}

function fillFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode") || localStorage.getItem(CART_MODE_KEY) || "invoice";
  state.pageMode = mode === "sell" ? "sell" : "invoice";

  const fields = getCreateFields();
  if (fields.invoiceType) {
    fields.invoiceType.value = state.pageMode === "sell" ? "Direct Sale" : "Invoice";
  }
  if (fields.discount && !String(fields.discount.value || "").trim()) {
    fields.discount.value = String(getStoredCartDiscount());
  }
}

async function loadInvoices() {
  document.body.classList.add('invoice-page-loading');
  setPageLoading(invoiceLoadingTargets(), true);
  const tbody = getTableBody();
  if (tbody && !tbody.dataset.skeletonLocked) {
    tbody.innerHTML = renderInvoiceSkeletonRows(4);
  }
  try {
    const data = await getInvoices();
    state.invoices = toArray(data);
    const repairsData = await getRepairs().catch(() => null);
    state.repairs = toArray(repairsData);
    const customersData = await getCustomers().catch(() => null);
    state.customers = getTaggedCustomerList(customersData || []);
    renderInvoices();
    renderTrashInvoices();
    document.getElementById("invoiceRestoreAllBtn")?.addEventListener("click", restoreAllDeletedInvoices);
    document.getElementById("invoiceDeleteAllForeverBtn")?.addEventListener("click", deleteAllDeletedInvoicesForever);
    updateCartBadge();
    renderInvoiceCustomerSuggestions();
  } catch (error) {
    console.error("Load invoices failed:", error);
    showToast("Invoice data could not be loaded from Firebase.", "warning", "Invoice");
  } finally {
    document.body.classList.remove('invoice-page-loading');
    setTimeout(() => setPageLoading(invoiceLoadingTargets(), false), 220);
  }
}

async function saveInvoiceFromPage(button = null) {
  await saveInvoiceWithGuard(async () => {
    await loadProductsForInvoice();
    const data = getCreateData();
    if (!validateCreateData(data)) return;

    const invoiceNumber = buildInvoiceNumber();
    const customerRecord = await upsertCustomer({
      fullName: data.customerName,
      phoneNumber: data.customerPhone,
      whatsapp: data.customerPhone,
      address: data.customerAddress || "",
      gender: data.customerGender || "",
      email: data.customerEmail || "",
      notes: data.customerNotes || "",
    }).catch(() => null);

    const payload = {
      invoiceNumber,
      customerId: customerRecord?.id || customerRecord?.customerId || null,
      customerName: customerRecord?.fullName || data.customerName,
      customerPhone: customerRecord?.phoneNumber || data.customerPhone,
      customerWhatsapp: customerRecord?.whatsapp || data.customerPhone,
      customerAddress: customerRecord?.address || "",
      customerGender: customerRecord?.gender || "",
      customerEmail: customerRecord?.email || "",
      invoiceType: data.invoiceType,
      paymentStatus: data.paymentStatus,
      subtotal: data.subtotal,
      discount: data.discount,
      paidAmount: data.paidAmount,
      balance: data.balance,
      finalTotal: data.finalTotal,
      notes: data.notes,
      items: data.items,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deleted: false,
      isDeleted: false,
    };

    updateInvoiceSaveButton(button, true, state.editingId ? "Updating..." : (data.invoiceType === "Direct Sale" ? "Selling..." : "Saving..."));
    try {
      const id = state.editingId ? (await updateInvoice(state.editingId, payload), state.editingId) : await addInvoice(payload);
      state.lastSavedId = id;
      await updateProductStockAfterInvoice(data.items);
      if (payload.customerId) {
        await rebuildCustomerStats(payload.customerId).catch(() => null);
      }
      clearCart();
      clearStoredCartDiscount();
      const message = state.editingId
        ? `Invoice updated successfully for ${data.customerName}.`
        : (data.invoiceType === "Direct Sale"
          ? `Sold successfully • ${formatCurrency(data.finalTotal)} • stock updated.`
          : `Invoice saved successfully • ${formatCurrency(data.finalTotal)}.`);
      showToast(message, "success", data.invoiceType === "Direct Sale" ? "Sale" : "Invoice");
      await loadInvoices();
      renderInvoiceCustomerSuggestions();
      fillFiltersFromUrl();
      state.editingId = null;
      const title = document.getElementById("invoiceModalTitle");
      const saveBtn = document.getElementById("saveInvoiceBtn");
      if (title) title.textContent = "New Invoice";
      if (saveBtn) saveBtn.innerHTML = 'Save Invoice';
      setCreateFieldValues({
        customerName: "",
        customerPhone: "",
        invoiceType: state.pageMode === "sell" ? "Direct Sale" : "Invoice",
        paymentStatus: "Unpaid",
        discount: 0,
        paidAmount: 0,
        remaining: 0,
        notes: "",
      });
    } catch (error) {
      console.error("Save invoice failed:", error);
      showToast(error?.message || "Failed to save invoice.", "error", "Invoice");
    } finally {
      updateInvoiceSaveButton(button, false);
    }
  });
}

async function saveInvoiceFromModal(button = null) {
  await saveInvoiceWithGuard(async () => {
    await loadProductsForInvoice();
    const modalFields = getModalFields();
    if (!modalFields) return;
    const editingInvoice = state.editingId ? getInvoiceById(state.editingId) : null;
    const isPaymentMode = state.editingMode === "pay" && Boolean(editingInvoice);
    const items = isPaymentMode ? toArray(editingInvoice?.items) : getCartItemsForInvoice();
    const previousPaid = safeNumber(editingInvoice?.paidAmount ?? 0);
    const paidNow = isPaymentMode ? clampInvoicePaidNow(modalFields, { silent: false }) : Math.max(0, safeNumber(modalFields.paidAmount?.value, 0));
    const finalTotal = isPaymentMode
      ? Math.max(0, safeNumber(editingInvoice?.finalTotal ?? editingInvoice?.total ?? editingInvoice?.amount ?? 0))
      : Math.max(0, safeNumber(computeInvoiceTotals(items, modalFields.discount?.value, modalFields.paidAmount?.value).finalTotal));
    const paidAmount = isPaymentMode
      ? Math.min(finalTotal, previousPaid + paidNow)
      : Math.min(finalTotal, safeNumber(computeInvoiceTotals(items, modalFields.discount?.value, modalFields.paidAmount?.value).paidAmount));
    const totals = {
      subtotal: isPaymentMode ? safeNumber(editingInvoice?.subtotal ?? finalTotal) : getCartTotalFromItems(items),
      discount: isPaymentMode ? safeNumber(editingInvoice?.discount ?? 0) : safeNumber(modalFields.discount?.value, 0),
      finalTotal,
      paidNow,
      paidAmount,
      remaining: Math.max(0, finalTotal - paidAmount),
    };
    const computedStatus = paymentStatusFromTotals(totals.finalTotal, totals.paidAmount, normalizeStatus(modalFields.paymentStatus?.value || editingInvoice?.paymentStatus || "Unpaid"));
    const invoice = {
      customerName: modalFields.customerName?.value.trim() || editingInvoice?.customerName || "",
      customerPhone: modalFields.customerPhone?.value.trim() || editingInvoice?.customerPhone || "",
      customerWhatsapp: modalFields.customerWhatsapp?.value.trim() || modalFields.customerPhone?.value.trim() || editingInvoice?.customerWhatsapp || editingInvoice?.customerPhone || "",
      senderNumber: modalFields.senderNumber?.value.trim() || modalFields.customerPhone?.value.trim() || editingInvoice?.senderNumber || editingInvoice?.customerPhone || "",
      paymentType: modalFields.paymentType?.value || editingInvoice?.paymentType || "Mobile Money",
      paymentProvider: modalFields.paymentProvider?.value || editingInvoice?.paymentProvider || "Evc Plus",
      cashCurrency: modalFields.cashCurrency?.value || editingInvoice?.cashCurrency || "Somali Shillings",
      invoiceType: modalFields.invoiceType?.value || editingInvoice?.invoiceType || "Invoice",
      paymentStatus: computedStatus,
      discount: totals.discount,
      paidAmount: totals.paidAmount,
      paidNow: isPaymentMode ? totals.paidNow : safeNumber(modalFields.paidAmount?.value, 0),
      paymentUpdatedAt: isPaymentMode ? Date.now() : (editingInvoice?.paymentUpdatedAt || null),
      balance: totals.remaining,
      notes: modalFields.notes?.value.trim() || editingInvoice?.notes || "",
      createdAt: editingInvoice?.createdAt || Date.now(),
      updatedAt: Date.now(),
      deleted: false,
      isDeleted: false,
      subtotal: totals.subtotal,
      finalTotal: totals.finalTotal,
      items,
      invoiceNumber: editingInvoice?.invoiceNumber || buildInvoiceNumber(),
    };

    if (isPaymentMode && safeNumber(previousPaid + paidNow) > safeNumber(totals.finalTotal)) {
      const clamped = clampInvoicePaidNow(modalFields, { silent: false });
      const recalculatedPaid = Math.min(finalTotal, previousPaid + clamped);
      if (modalFields?.paidAmount) modalFields.paidAmount.value = String(clamped);
      totals.paidNow = clamped;
      totals.paidAmount = recalculatedPaid;
      totals.remaining = Math.max(0, finalTotal - recalculatedPaid);
      showToast("Money now that customer paid cannot be bigger than his remaining balance", "warning", "Invoice");
      return;
    }
    if (!isPaymentMode && safeNumber(totals.paidAmount) > safeNumber(totals.finalTotal)) {
      showToast("Paid amount cannot be bigger than total amount.", "warning", "Invoice");
      return;
    }

    updateInvoiceSaveButton(button || modalFields.saveButton, true, state.editingId ? (isPaymentMode ? "Saving payment..." : "Updating...") : (invoice.invoiceType === "Direct Sale" ? "Selling..." : "Saving..."));
    try {
      const id = state.editingId ? (await updateInvoice(state.editingId, invoice), state.editingId) : await addInvoice(invoice);
      state.lastSavedId = id;
      if (isPaymentMode && safeNumber(totals.paidNow) > 0) {
        await addPayment({
          relatedType: "invoice",
          relatedId: id,
          relatedNumber: invoice.invoiceNumber,
          customerId: invoice.customerId || editingInvoice?.customerId || null,
          customerName: invoice.customerName,
          customerPhone: invoice.customerPhone,
          customerWhatsapp: invoice.customerWhatsapp,
          senderNumber: invoice.senderNumber,
          paymentType: invoice.paymentType,
          paymentProvider: invoice.paymentProvider,
          cashCurrency: invoice.cashCurrency,
          paidNow: totals.paidNow,
          paidAmount: totals.paidAmount,
          totalPaid: totals.paidAmount,
          totalRemaining: totals.remaining,
          totalAmount: totals.finalTotal,
          notes: invoice.notes || editingInvoice?.notes || "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isDeleted: false,
          deleted: false,
        });
      }
      if (!isPaymentMode) {
        await updateProductStockAfterInvoice(items);
        clearCart();
        clearStoredCartDiscount();
      }
      await refreshCustomerStatsForRecord(invoice);
      showToast(
        state.editingId
          ? (isPaymentMode ? `Payment saved for ${invoice.customerName}.` : `Invoice updated successfully for ${invoice.customerName}.`)
          : (invoice.invoiceType === "Direct Sale"
            ? `Sold successfully • ${formatCurrency(invoice.finalTotal)} • stock updated.`
            : `Invoice saved successfully • ${formatCurrency(invoice.finalTotal)}.`),
        "success",
        state.editingId ? "Invoice" : (invoice.invoiceType === "Direct Sale" ? "Sale" : "Invoice")
      );
      window.bootstrap?.Modal.getOrCreateInstance(modalFields.modal)?.hide();
      await loadInvoices();
      state.editingId = null;
      state.editingMode = "create";
      const title = document.getElementById("invoiceModalTitle");
      const saveBtn = document.getElementById("saveInvoiceBtn");
      if (title) title.textContent = "New Invoice";
      if (saveBtn) saveBtn.innerHTML = 'Save Invoice';
      setInvoicePayModeUI(false);
    } catch (error) {
      console.error("Modal invoice save failed:", error);
      showToast(error?.message || "Failed to save invoice.", "error", "Invoice");
    } finally {
      updateInvoiceSaveButton(button || modalFields.saveButton, false);
    }
  });
}
function getDeletedInvoices() {
  let list = state.invoices
    .filter((invoice) => isSoftDeleted(invoice))
    .sort((a, b) => safeNumber(b?.deletedAt) - safeNumber(a?.deletedAt));
  list = list.filter((invoice) => invoiceDateMatches(invoice, state.trashDateFilter));
  return list;
}

function renderTrashInvoices() {
  const tbody = document.getElementById("invoiceTrashTableBody");
  const modalBody = document.getElementById("invoiceRecycleModalTableBody");
  if (!tbody && !modalBody) return;
  const rowsLimit = getRowsLimit(state.trashRowsFilter, 5);
  const list = getDeletedInvoices();
  const visible = Number.isFinite(rowsLimit) ? list.slice(0, rowsLimit) : list;
  if (!visible.length) {
    const empty = `<tr><td colspan="8" class="text-center text-muted py-4">Recycle bin is empty.</td></tr>`;
    if (tbody) tbody.innerHTML = empty;
    if (modalBody) modalBody.innerHTML = empty;
    return;
  }
  const rowsHtml = visible.map((invoice) => {
    const id = invoice.invoiceNumber || invoice.id || "-";
    return `
      <tr>
        <td class="fw-semibold">${id}</td>
        <td>${escapeHtml(invoice.customerName || "Direct Sale")}</td>
        <td>${escapeHtml(invoice.customerPhone || "-")}</td>
        <td>${formatCurrency(safeNumber(invoice.finalTotal ?? 0))}</td>
        <td>${formatCurrency(safeNumber(invoice.balance ?? 0))}</td>
        <td><span class="badge ${statusBadge(invoice.paymentStatus)} status-pill">${capitalize(invoice.paymentStatus)}</span></td>
        <td>${formatFriendlyDate(invoice.deletedAt || invoice.updatedAt || invoice.createdAt)}</td>
        <td class="text-end text-nowrap">
          <button class="btn btn-sm btn-outline-success me-1" data-action="restore" data-id="${invoice.id || invoice.invoiceNumber}"><i class="bi bi-arrow-counterclockwise"></i></button>
          <button class="btn btn-sm btn-outline-danger" data-action="trash-hard-delete" data-id="${invoice.id || invoice.invoiceNumber}"><i class="bi bi-trash3-fill"></i></button>
        </td>
      </tr>`;
  }).join("");
  if (tbody) tbody.innerHTML = rowsHtml;
  if (modalBody) modalBody.innerHTML = rowsHtml;
}

async function restoreAllDeletedInvoices() {
  const items = getDeletedInvoices();
  if (!items.length) return showToast("Recycle bin is empty.", "info", "Invoice");
  const ok = window.confirm ? window.confirm(`Restore ${items.length} deleted invoice${items.length === 1 ? '' : 's'}?`) : true;
  if (!ok) return;
  try {
    for (const invoice of items) {
      await restoreInvoice(invoice.id || invoice.invoiceNumber);
    }
    showToast("All invoices restored.", "success", "Invoice");
    await loadInvoices();
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not restore all invoices.", "error", "Invoice");
  }
}

async function deleteAllDeletedInvoicesForever() {
  const items = getDeletedInvoices();
  if (!items.length) return showToast("Recycle bin is empty.", "info", "Invoice");
  const ok = window.confirm ? window.confirm(`Delete ${items.length} invoice${items.length === 1 ? '' : 's'} forever? This cannot be undone.`) : true;
  if (!ok) return;
  try {
    for (const invoice of items) {
      await deleteInvoice(invoice.id || invoice.invoiceNumber, { hardDelete: true });
    }
    showToast("All invoices deleted forever.", "success", "Invoice");
    await loadInvoices();
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not delete all invoices.", "error", "Invoice");
  }
}

function openInvoiceDeleteConfirm(invoice, mode = "soft") {
  const modal = document.getElementById("invoiceDeleteConfirmModal");
  const title = document.getElementById("invoiceDeleteConfirmTitle");
  const body = document.getElementById("invoiceDeleteConfirmBody");
  const deleteBtn = document.getElementById("invoiceDeleteBtn");
  const foreverBtn = document.getElementById("invoiceDeleteForeverBtn");
  if (!modal || !invoice) return;
  state.pendingDeleteId = invoice.id || invoice.invoiceNumber;
  state.pendingDeleteMode = mode;
  if (title) title.textContent = mode === "hard" ? "Delete Invoice Forever" : "Move Invoice to Trash";
  if (body) {
    body.innerHTML = `
      <div class="border rounded-4 p-3 bg-body-tertiary">
        <div class="d-flex align-items-center gap-3 mb-3">
          <div class="rounded-4 d-flex align-items-center justify-content-center bg-danger-subtle text-danger" style="width:56px;height:56px;">
            <i class="bi bi-receipt-cutoff fs-4"></i>
          </div>
          <div>
            <div class="fw-bold fs-5">${escapeHtml(invoice.invoiceNumber || invoice.id || "Invoice")}</div>
            <div class="text-muted small">${escapeHtml(invoice.customerName || "Direct Sale")}</div>
          </div>
        </div>
        <div class="row g-2 small">
          <div class="col-6"><div class="p-2 rounded-3 bg-white border"><div class="text-muted">Phone</div><div class="fw-semibold">${escapeHtml(invoice.customerPhone || "-")}</div></div></div>
          <div class="col-6"><div class="p-2 rounded-3 bg-white border"><div class="text-muted">Total</div><div class="fw-semibold">${formatCurrency(safeNumber(invoice.finalTotal ?? 0))}</div></div></div>
          <div class="col-6"><div class="p-2 rounded-3 bg-white border"><div class="text-muted">Balance</div><div class="fw-semibold">${formatCurrency(safeNumber(invoice.balance ?? 0))}</div></div></div>
          <div class="col-6"><div class="p-2 rounded-3 bg-white border"><div class="text-muted">Status</div><div class="fw-semibold">${capitalize(invoice.paymentStatus)}</div></div></div>
        </div>
      </div>`;
  }
  if (deleteBtn) deleteBtn.style.display = mode === "hard" ? "none" : "inline-flex";
  if (foreverBtn) foreverBtn.style.display = "inline-flex";
  openModalOnTop(modal);
}
function getInvoiceBulkControls() {
  return {
    channel: document.getElementById("invoiceBulkChannel"),
    skipToday: document.getElementById("invoiceBulkSkipToday"),
    startBtn: document.getElementById("invoiceBulkSendAllBtn"),
    modal: document.getElementById("invoiceBulkSendModal"),
    modalBody: document.getElementById("invoiceBulkSendModalBody"),
    title: document.getElementById("invoiceBulkSendModalTitle"),
    counter: document.getElementById("invoiceBulkSendCounter"),
    preview: document.getElementById("invoiceBulkSendPreview"),
    sendBtn: document.getElementById("invoiceBulkSendNowBtn"),
    confirmedBtn: document.getElementById("invoiceBulkMarkSentBtn"),
    skipBtn: document.getElementById("invoiceBulkSkipBtn"),
    closeBtn: document.getElementById("invoiceBulkCloseBtn")
  };
}

function getBulkInvoiceQueue() {
  return Array.isArray(state.bulkQueue) ? state.bulkQueue : [];
}

function currentBulkInvoice() {
  const queue = getBulkInvoiceQueue();
  return queue[state.bulkIndex] || null;
}

function renderBulkInvoiceModal() {
  const controls = getInvoiceBulkControls();
  const invoice = currentBulkInvoice();
  if (!controls.modal || !controls.modalBody || !controls.title || !controls.counter || !controls.preview) return;

  if (!invoice) {
    controls.modalBody.innerHTML = `<div class="text-center text-muted py-4">No more invoices in this queue.</div>`;
    controls.title.textContent = "Message queue";
    controls.counter.textContent = "0 / 0";
    controls.preview.textContent = "";
    if (controls.sendBtn) controls.sendBtn.disabled = true;
    if (controls.confirmedBtn) controls.confirmedBtn.disabled = true;
    if (controls.skipBtn) controls.skipBtn.disabled = true;
    return;
  }

  const channel = state.bulkChannel || "whatsapp";
  const message = buildMessage(invoice, channel);
  const status = normalizeStatus(invoice.paymentStatus);
  const invoiceNo = escapeHtml(invoice.invoiceNumber || invoice.id || "—");
  const customer = escapeHtml(invoice.customerName || "Direct Sale");
  const phone = escapeHtml(invoice.customerPhone || "—");
  const current = state.bulkIndex + 1;
  const total = getBulkInvoiceQueue().length;
  controls.title.textContent = `${channel === "sms" ? "SMS" : "WhatsApp"} queue`;
  controls.counter.textContent = `${current} / ${total}`;
  controls.preview.innerHTML = `
    <div class="d-flex justify-content-between gap-3 flex-wrap mb-3">
      <div><div class="text-muted small">Invoice</div><div class="fw-semibold">${invoiceNo}</div></div>
      <div><div class="text-muted small">Customer</div><div class="fw-semibold">${customer}</div></div>
      <div><div class="text-muted small">Phone</div><div class="fw-semibold">${phone}</div></div>
      <div><div class="text-muted small">Status</div><div class="fw-semibold">${escapeHtml(capitalize(status))}</div></div>
    </div>
    <div class="border rounded-4 p-3 bg-body-tertiary">
      <div class="fw-semibold mb-2">Message preview</div>
      <pre class="mb-0 small text-wrap" style="white-space:pre-wrap; word-break:break-word;">${escapeHtml(message)}</pre>
    </div>
  `;
  controls.modalBody.dataset.invoiceId = String(invoice.id || invoice.invoiceNumber || "");
  controls.modalBody.dataset.channel = String(channel);
  if (controls.sendBtn) controls.sendBtn.disabled = false;
  if (controls.confirmedBtn) controls.confirmedBtn.disabled = false;
  if (controls.skipBtn) controls.skipBtn.disabled = false;
}

function showBulkInvoiceModal() {
  const controls = getInvoiceBulkControls();
  if (!controls.modal) return;
  renderBulkInvoiceModal();
  window.bootstrap?.Modal.getOrCreateInstance(controls.modal)?.show();
}

function buildBulkInvoiceQueue() {
  const controls = getInvoiceBulkControls();
  const channel = controls.channel?.value === "sms" ? "sms" : "whatsapp";
  const skipToday = Boolean(controls.skipToday?.checked);
  state.bulkChannel = channel;
  state.bulkSkipToday = skipToday;
  const invoices = Array.isArray(state.filtered) ? state.filtered : [];
  const queue = invoices.filter((invoice) => {
    if (!skipToday) return true;
    return !hasInvoiceBeenSentToday(sanitizeInvoiceId(invoice.id || invoice.invoiceNumber), channel);
  });
  state.bulkQueue = queue.map((item) => snapshotInvoiceForBulk(item));
  state.bulkIndex = 0;
  resetBulkInvoiceSummary(channel, queue.length);
}

function advanceBulkInvoice(closeWhenDone = true) {
  state.bulkIndex += 1;
  if (state.bulkIndex >= getBulkInvoiceQueue().length) {
    const controls = getInvoiceBulkControls();
    if (closeWhenDone && controls.modal) {
      window.bootstrap?.Modal.getInstance(controls.modal)?.hide();
    }
    state.bulkQueue = [];
    state.bulkIndex = 0;
    state.bulkCurrentId = null;
    showBulkInvoiceSummaryModal();
    return;
  }
  renderBulkInvoiceModal();
}

function sendCurrentBulkInvoice() {
  const invoice = currentBulkInvoice();
  if (!invoice) return;
  const channel = state.bulkChannel || "whatsapp";
  openShareInvoice(invoice, channel);
  state.bulkCurrentId = String(invoice.id || invoice.invoiceNumber || "");
  showToast(`${channel === "sms" ? "SMS" : "WhatsApp"} opened for ${invoice.customerName || "customer"}. Mark as sent after you send it.`, "info", "Messages");
}

function confirmCurrentBulkInvoiceSent() {
  const invoice = currentBulkInvoice();
  if (!invoice) return;
  markInvoiceSent(invoice, state.bulkChannel || "whatsapp");
  recordBulkInvoiceSummary("sent", invoice);
  showToast("Message marked as sent.", "success", "Messages");
  advanceBulkInvoice(false);
}

function skipCurrentBulkInvoice() {
  const currentInvoice = currentBulkInvoice();
  if (!currentInvoice) {
    advanceBulkInvoice(false);
    return;
  }
  recordBulkInvoiceSummary("skipped", currentInvoice);
  state.bulkCurrentId = String(currentInvoice.id || currentInvoice.invoiceNumber || "");
  showToast("Skipped.", "secondary", "Messages");
  advanceBulkInvoice(false);
}

function bindBulkInvoiceControls() {
  const controls = getInvoiceBulkControls();
  controls.startBtn?.addEventListener("click", () => {
    buildBulkInvoiceQueue();
    if (!getBulkInvoiceQueue().length) {
      showToast("No invoices matched the current filters.", "warning", "Messages");
      return;
    }
    showBulkInvoiceModal();
  });
  controls.sendBtn?.addEventListener("click", sendCurrentBulkInvoice);
  controls.confirmedBtn?.addEventListener("click", confirmCurrentBulkInvoiceSent);
  controls.skipBtn?.addEventListener("click", skipCurrentBulkInvoice);
  controls.channel?.addEventListener("change", () => {
    if (getBulkInvoiceQueue().length) {
      buildBulkInvoiceQueue();
      showBulkInvoiceModal();
    }
  });
  controls.skipToday?.addEventListener("change", () => {
    if (getBulkInvoiceQueue().length) {
      buildBulkInvoiceQueue();
      showBulkInvoiceModal();
    }
  });
  controls.modal?.addEventListener("hidden.bs.modal", () => {
    state.bulkQueue = [];
    state.bulkIndex = 0;
    state.bulkCurrentId = null;
  });
  document.getElementById("invoiceBulkSummarySentToggle")?.addEventListener("click", () => toggleBulkSummaryList("sent"));
  document.getElementById("invoiceBulkSummarySkippedToggle")?.addEventListener("click", () => toggleBulkSummaryList("skipped"));
  document.getElementById("invoiceBulkResendSkippedBtn")?.addEventListener("click", () => {
    const summary = getBulkInvoiceSummary();
    if (!summary.skipped.length) {
      showToast("No skipped invoices to resend.", "warning", "Messages");
      return;
    }
    showSkippedBulkInvoicesAgain();
    const summaryModal = document.getElementById("invoiceBulkSummaryModal");
    window.bootstrap?.Modal.getInstance(summaryModal)?.hide();
  });
}

async function handleInvoiceAction(action, id) {
  const invoice = getInvoiceById(id);
  if (!invoice) return;

  try {
    if (action === "view") {
      openInvoiceViewModal(invoice);
      return;
    }

    if (action === "history") {
      await openInvoiceCustomerHistory(invoice);
      return;
    }

    if (action === "print") {
      printInvoice(invoice);
      return;
    }

    if (action === "whatsapp") {
      openShareInvoice(invoice, "whatsapp");
      return;
    }

    if (action === "sms") {
      openShareInvoice(invoice, "sms");
      return;
    }

    if (action === "save-invoice") {
      await saveInvoiceFromModal(button);
      return;
    }

    if (action === "edit" || action === "pay") {
      state.editingId = id;
      state.editingMode = action;
      const modalFields = getModalFields();
      const editingInvoice = invoice;
      if (!modalFields) {
        showToast("Invoice form is not ready yet.", "warning", "Invoice");
        return;
      }
      setCreateFieldValues(editingInvoice);
      const modal = modalFields.modal;
      const title = document.getElementById("invoiceModalTitle");
      const saveBtn = document.getElementById("saveInvoiceBtn");
      if (title) title.textContent = action === "pay" ? "Record Payment" : "Update Invoice";
      if (saveBtn) saveBtn.innerHTML = action === "pay" ? '<i class="bi bi-cash-coin me-1"></i> Save Payment' : '<i class="bi bi-check2-circle me-1"></i> Update Invoice';
      syncInvoicePaymentFields(modalFields);
      setInvoicePayModeUI(action === "pay", modalFields, editingInvoice);
      openModalOnTop(modal);
      showToast(action === "pay" ? "Invoice loaded for payment." : "Invoice loaded into the form for editing.", action === "pay" ? "info" : "warning", action === "pay" ? "Payment" : "Edit");
      return;
    }

    if (action === "delete") {
      openInvoiceDeleteConfirm(invoice, "soft");
      return;
    }

    if (action === "toggle-status") {
      await toggleInvoiceStatusAction(id);
      return;
    }

    if (action === "restore") {
      await restoreInvoice(id);
      showToast("Invoice restored successfully.", "restore", "Invoice");
      await loadInvoices();
      return;
    }

    if (action === "trash-hard-delete") {
      openInvoiceDeleteConfirm(invoice, "hard");
      return;
    }

    if (action === "save-edit") {
      const data = getCreateData();
      await updateInvoice(id, {
        ...data,
        updatedAt: Date.now(),
      });
      showToast("Invoice updated successfully.", "success", "Invoice");
      state.editingId = null;
      await loadInvoices();
      return;
    }
  } catch (error) {
    console.error(`Invoice action ${action} failed:`, error);
    showToast(error?.message || "Invoice action failed.", "error", "Invoice");
  }
}

function bindSearchAndFilters() {
  const search = getSearchInput();
  if (search) {
    search.addEventListener(
      "input",
      debounce((event) => {
        state.search = normalizeText(event.target.value);
        renderInvoices();
      }, 180)
    );
  }

  const [dateSelect, typeSelect, statusSelect, sortSelect, rowsSelect] = getFilterSelects();
  if (dateSelect) {
    dateSelect.addEventListener("change", () => {
      const value = normalizeText(dateSelect.value);
      if (value.includes("today")) state.dateFilter = "today";
      else if (value.includes("week")) state.dateFilter = "week";
      else if (value.includes("month")) state.dateFilter = "month";
      else if (value.includes("year")) state.dateFilter = "year";
      else state.dateFilter = "all";
      renderInvoices();
    });
  }
  if (typeSelect) {
    typeSelect.addEventListener("change", () => {
      state.typeFilter = normalizeText(typeSelect.value) || "invoice";
      renderInvoices();
    });
  }
  if (statusSelect) {
    statusSelect.addEventListener("change", () => {
      state.statusFilter = normalizeText(statusSelect.value) || "all";
      renderInvoices();
    });
  }
  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      state.sortFilter = normalizeText(sortSelect.value) || "newest";
      renderInvoices();
    });
  }
  if (rowsSelect) {
    rowsSelect.addEventListener("change", () => {
      state.rowsFilter = rowsSelect.value || "5";
      renderInvoices();
    });
  }

  const resetFiltersBtn = document.getElementById("invoiceResetFiltersBtn");
  resetFiltersBtn?.addEventListener("click", () => {
    state.search = "";
    state.dateFilter = "week";
    state.typeFilter = "invoice";
    state.statusFilter = "all";
    state.sortFilter = "newest";
    state.rowsFilter = "5";
    const searchInput = getSearchInput();
    if (searchInput) searchInput.value = "";
    const date = document.getElementById("invoiceDateFilter");
    const type = document.getElementById("invoiceTypeFilter");
    const rows = document.getElementById("invoiceRowsFilter");
    if (date) date.value = "week";
    if (type) type.value = "invoice";
    if (rows) rows.value = "5";
    renderInvoices();
  });

  const trashDate = document.getElementById("invoiceTrashDateFilter");
  if (trashDate) {
    trashDate.value = state.trashDateFilter || "week";
    trashDate.addEventListener("change", () => {
      state.trashDateFilter = normalizeText(trashDate.value) || "week";
      renderTrashInvoices();
    });
  }
  const trashRows = document.getElementById("invoiceTrashRowsFilter");
  if (trashRows) {
    trashRows.addEventListener("change", () => {
      state.trashRowsFilter = trashRows.value || "5";
      renderTrashInvoices();
    });
  }
}

function bindButtons() {
  document.addEventListener("click", async (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    const button = target.closest("button");
    if (!button) return;

    const action = button.getAttribute("data-action");
    const id = button.getAttribute("data-id");
    if (action && id) {
      event.preventDefault();
      await handleInvoiceAction(action, id);
      return;
    }

    const text = normalizeText(button.textContent);
    if (text.includes("save invoice") || text.includes("save payment") || button.id === "saveInvoiceBtn") {
      event.preventDefault();
      const modalFields = getModalFields();
      if (button.closest("#newInvoiceModal") || modalFields?.modal?.contains(button)) {
        await saveInvoiceFromModal(button);
      } else {
        await saveInvoiceFromPage(button);
      }
      return;
    }

    if (text === "whatsapp" || text.includes("whatsapp")) {
      const invoice = state.lastSavedId ? getInvoiceById(state.lastSavedId) : state.filtered[0];
      if (!invoice) {
        showToast("No saved invoice available for WhatsApp.", "warning", "WhatsApp");
        return;
      }
      openShareInvoice(invoice, "whatsapp");
      return;
    }

    if (button.id === "invoiceDeleteBtn") {
      const id = state.pendingDeleteId;
      const invoice = getInvoiceById(id);
      if (!invoice) return;
      await deleteInvoice(id);
      showToast("Invoice moved to recycle bin.", "delete", "Invoice");
      window.bootstrap?.Modal.getInstance(document.getElementById("invoiceDeleteConfirmModal"))?.hide();
      await loadInvoices();
      return;
    }

    if (button.id === "invoiceDeleteForeverBtn") {
      const id = state.pendingDeleteId;
      const invoice = getInvoiceById(id);
      if (!invoice) return;
      await deleteInvoice(id, { hardDelete: true });
      showToast("Invoice permanently deleted.", "delete", "Invoice");
      window.bootstrap?.Modal.getInstance(document.getElementById("invoiceDeleteConfirmModal"))?.hide();
      await loadInvoices();
      return;
    }

    if (text === "print" || text.includes("print")) {
      const invoice = state.lastSavedId ? getInvoiceById(state.lastSavedId) : state.filtered[0];
      if (!invoice) {
        showToast("No saved invoice available for printing.", "warning", "Print");
        return;
      }
      printInvoice(invoice);
    }
  });
}

function bindPageSaveButtons() {
  const createCard = getCreateCard();
  if (!createCard) return;
  const buttons = Array.from(createCard.querySelectorAll("button"));
  const saveButton = buttons.find((button) => normalizeText(button.textContent).includes("create invoice"));
  const whatsappButton = buttons.find((button) => normalizeText(button.textContent).includes("whatsapp"));
  const smsButton = buttons.find((button) => normalizeText(button.textContent).includes("sms"));

  if (saveButton) {
    saveButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (state.editingId) {
        handleInvoiceAction("save-edit", state.editingId);
      } else {
        saveInvoiceFromPage();
      }
    });
  }

  if (whatsappButton) {
    whatsappButton.addEventListener("click", (event) => {
      event.preventDefault();
      const data = getCreateData();
      if (!data.items.length) {
        showToast("Add products to cart before sending WhatsApp.", "warning", "WhatsApp");
        return;
      }
      openShareInvoice({
        invoiceNumber: buildInvoiceNumber(),
        ...data,
      }, "whatsapp");
    });
  }

  if (smsButton) {
    smsButton.addEventListener("click", (event) => {
      event.preventDefault();
      const data = getCreateData();
      if (!data.items.length) {
        showToast("Add products to cart before sending SMS.", "warning", "SMS");
        return;
      }
      openShareInvoice({
        invoiceNumber: buildInvoiceNumber(),
        ...data,
      }, "sms");
    });
  }
}

function bindModalSaveButton() {
  // Kept for compatibility; the global click handler now manages the save action.
}

function bindInvoiceFormRealtime() {
  const fields = getModalFields();
  if (!fields) return;
  const refresh = () => refreshInvoiceFormTotals();
  [fields.discount, fields.paidAmount, fields.invoiceType, fields.paymentStatus, fields.paymentType, fields.paymentProvider, fields.cashCurrency, fields.senderNumber].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", refresh);
    el.addEventListener("change", () => {
      syncInvoicePaymentFields(fields);
      refresh();
    });
  });
  syncInvoicePaymentFields(fields);
}

function bindCartModal() {
  const modal = document.getElementById("invoiceCartModal");
  if (!modal) return;
  modal.addEventListener("show.bs.modal", async () => {
    await loadProductsForInvoice();
    renderCartModal();
  });
}

function syncCartInfo() {
  const cart = getCartItemsForInvoice();
  const subtotal = getCartTotalFromItems(cart);
  const discount = Math.max(0, safeNumber(document.getElementById("invoiceDiscount")?.value, 0));
  const finalTotal = Math.max(0, subtotal - discount);
  updateCartTotalsPreview(subtotal, discount, finalTotal);
  updateCartBadge();
}

function initInvoicePage() {
  if (!document.querySelector(".page-wrap")) return;
  fillFiltersFromUrl();
  bindSearchAndFilters();
  bindButtons();
  bindPageSaveButtons();
  bindInvoiceFormRealtime();
  bindInvoiceCustomerAutocomplete();
  bindInvoicePaymentControls();
  bindQuickCustomerButton("invoiceNewCustomerBtn", {
    getDefaults: () => {
      const fields = getModalFields();
      return {
        name: fields?.customerName?.value || "",
        phone: fields?.customerPhone?.value || "",
      };
    },
    onCreated: (customer) => {
      const fields = getModalFields();
      if (fields?.customerName) fields.customerName.value = customer?.fullName || customer?.name || "";
      if (fields?.customerPhone) fields.customerPhone.value = customer?.phoneNumber || customer?.phone || "";
      if (fields?.customerWhatsapp) fields.customerWhatsapp.value = customer?.whatsapp || customer?.customerWhatsapp || customer?.phoneNumber || customer?.phone || "";
      if (fields?.senderNumber) fields.senderNumber.value = customer?.phoneNumber || customer?.phone || "";
      renderInvoiceCustomerSuggestions();
    }
  });

  const invoiceModal = document.getElementById("newInvoiceModal");
  invoiceModal?.addEventListener("show.bs.modal", () => {
    renderInvoiceInlinePreview(state.editingMode === 'pay' ? getInvoiceById(state.editingId) : null);
    syncInvoicePaymentFields(getModalFields());
  });
  invoiceModal?.addEventListener("hidden.bs.modal", () => {
    if (!state.savingInvoice) {
      state.editingId = null;
      state.editingMode = "create";
      setInvoicePayModeUI(false);
    }
  });
  bindCartModal();
  bindBulkInvoiceControls();
  updateCartBadge();
  loadProductsForInvoice().then(() => {
    refreshInvoiceFormTotals();
    syncCartInfo();
  });
  loadInvoices();
  renderInvoiceCustomerSuggestions();
  updateInvoiceNotificationBadge();
}

document.addEventListener("DOMContentLoaded", initInvoicePage);

window.ShopInvoice = {
  initInvoicePage,
  loadInvoices,
  renderInvoices,
  saveInvoiceFromPage,
};
