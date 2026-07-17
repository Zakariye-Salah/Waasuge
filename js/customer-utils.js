
// js/customer-utils.js
import {
  PATHS,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomers,
  getInvoices,
  getRepairs,
  getPayments,
  toArray,
  normalizeText,
  safeNumber,
  filterActive,
  getOnce,
  editRecord,
} from "./database.js";
import { showToast } from "./main.js";

const CUSTOMER_MODAL_ID = "quickCustomerModal";

function now() {
  return Date.now();
}

export function normalizePhone(value = "") {
  return String(value || "").replace(/\D/g, "");
}

export function ensureCustomerPhoneLabel(labelId = "quickCustomerPhoneAvailability") {
  let label = document.getElementById(labelId);
  if (label) return label;
  const phoneInput = document.getElementById("quickCustomerPhone");
  if (!phoneInput) return null;
  label = document.createElement("div");
  label.id = labelId;
  label.className = "form-text mt-1";
  label.textContent = "Enter a phone number to check availability.";
  phoneInput.insertAdjacentElement("afterend", label);
  return label;
}

export async function checkCustomerPhoneAvailability(phone = "", ignoreId = "") {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { available: false, message: "Phone number is required." };
  }
  const customers = await getAllCustomers().catch(() => []);
  const exists = customers.find((item) => {
    if (!item) return false;
    if (ignoreId && String(item.id || item.customerId || "") === String(ignoreId)) return false;
    return normalizePhone(item.phoneNumber || item.phone || item.customerPhone || item.whatsapp) === normalized;
  });
  return exists
    ? { available: false, message: "This phone number is not available ✖" }
    : { available: true, message: "This phone number is available ✓" };
}

export function customerIdentity(customer = {}) {
  const phone = normalizePhone(customer.phoneNumber || customer.phone || customer.customerPhone || customer.whatsapp);
  const name = normalizeText(customer.fullName || customer.name || customer.customerName || "");
  return phone || String(customer.id || customer.customerId || "");
}

export function toCustomerRecord(item = {}) {
  const id = String(item?.id || item?.key || item?.customerId || "");
  const fullName = String(item?.fullName || item?.name || item?.customerName || "").trim();
  const phoneNumber = String(item?.phoneNumber || item?.phone || item?.customerPhone || "").trim();
  const whatsapp = String(item?.whatsapp || item?.customerWhatsapp || item?.phoneNumber || item?.phone || "").trim();
  const gender = String(item?.gender || "").trim();
  const address = String(item?.address || "").trim();
  const email = String(item?.email || "").trim();
  const notes = String(item?.notes || "").trim();
  const createdAt = safeNumber(item?.createdAt || item?.timestamp || now());
  const updatedAt = safeNumber(item?.updatedAt || createdAt);
  const customerId = String(item?.customerId || id || "").trim();
  return {
    ...item,
    id,
    customerId,
    fullName,
    name: fullName,
    customerName: fullName,
    phoneNumber,
    phone: phoneNumber,
    customerPhone: phoneNumber,
    whatsapp,
    customerWhatsapp: whatsapp,
    gender,
    address,
    email,
    notes,
    createdAt,
    updatedAt,
    sourcePage: String(item?.sourcePage || item?.source || "").trim(),
    moduleSource: String(item?.moduleSource || item?.origin || "").trim(),
    customerKey: customerIdentity({ fullName, phoneNumber, whatsapp }),
  };
}

async function readCollection(path) {
  const data = await getOnce(path);
  return toArray(data).map((item, index) => toCustomerRecord(item?.id ? item : { ...item, id: item?.id || String(index) }));
}

export async function getAllCustomers() {
  const data = await getCustomers().catch(() => null);
  const list = toArray(data).map((item) => toCustomerRecord(item));
  return list.filter((item) => !item.deleted && !item.isDeleted);
}

export async function findMatchingCustomer(input = {}) {
  const list = await getAllCustomers();
  const id = String(input.customerId || input.id || "").trim();
  const phone = normalizePhone(input.phoneNumber || input.phone || input.customerPhone || input.whatsapp);
  const name = normalizeText(input.fullName || input.name || input.customerName || "");

  if (id) {
    const match = list.find((item) => String(item.id) === id || String(item.customerId) === id);
    if (match) return match;
  }
  if (phone) {
    const match = list.find((item) => normalizePhone(item.phoneNumber || item.phone || item.whatsapp) === phone);
    if (match) return match;
  }
  return null;
}

export async function createCustomer(data = {}) {
  const { existingCustomers, ...input } = data || {};
  const payload = toCustomerRecord({
    ...input,
    fullName: input.fullName || input.name || input.customerName || "",
    phoneNumber: input.phoneNumber || input.phone || input.customerPhone || "",
    whatsapp: input.whatsapp || input.customerWhatsapp || input.phoneNumber || input.phone || "",
    sourcePage: input.sourcePage || "customers.html",
    moduleSource: input.moduleSource || "customers",
    createdAt: input.createdAt || now(),
    updatedAt: now(),
    deleted: false,
    isDeleted: false,
  });

  const phone = normalizePhone(payload.phoneNumber || payload.phone || payload.customerPhone || payload.whatsapp);
  if (phone) {
    const existing = Array.isArray(data.existingCustomers) ? data.existingCustomers : await getAllCustomers().catch(() => []);
    const duplicate = existing.find((item) => normalizePhone(item.phoneNumber || item.phone || item.customerPhone || item.whatsapp) === phone);
    if (duplicate) {
      throw new Error("A customer with this phone number already exists.");
    }
  }

  const created = await addCustomer(payload);
  return toCustomerRecord(created);
}

export async function upsertCustomer(data = {}) {
  const existing = await findMatchingCustomer(data);
  if (!existing) return createCustomer(data);
  return existing;
}

export function getTaggedCustomerList(customers = []) {
  return toArray(customers)
    .map((item) => toCustomerRecord(item))
    .filter((item) => !item.deleted && !item.isDeleted && (item.moduleSource === "customers" || item.sourcePage === "customers.html"));
}

export function sumCustomerMoney(records = [], customerId, matchFn = null) {
  return toArray(records).reduce((sum, item) => {
    const byId = customerId && (String(item?.customerId || "") === String(customerId));
    const byMatch = matchFn ? Boolean(matchFn(item)) : false;
    if (!byId && !byMatch) return sum;
    return sum + safeNumber(item?.finalTotal ?? item?.total ?? item?.amount ?? item?.cost ?? 0);
  }, 0);
}

export function countCustomerRecords(records = [], customerId, matchFn = null) {
  return toArray(records).reduce((count, item) => {
    const byId = customerId && (String(item?.customerId || "") === String(customerId));
    const byMatch = matchFn ? Boolean(matchFn(item)) : false;
    return count + (byId || byMatch ? 1 : 0);
  }, 0);
}

function customerMatchByLegacyIdentity(customer, record = {}) {
  const customerId = String(customer.id || customer.customerId || "");
  const recordId = String(record?.customerId || "");
  if (customerId && recordId) return customerId === recordId;

  const customerPhone = normalizePhone(customer.phoneNumber || customer.whatsapp || customer.phone || "");
  const recordPhone = normalizePhone(record?.customerPhone || record?.phone || record?.phoneNumber || record?.whatsapp || "");
  if (customerPhone && recordPhone) return customerPhone === recordPhone;

  const customerName = normalizeText(customer.fullName || customer.name || customer.customerName || "");
  const recordName = normalizeText(record?.customerName || record?.name || record?.fullName || "");
  return Boolean(!customerPhone && !customerId && customerName && recordName && customerName === recordName);
}

export async function rebuildCustomerStats(customerId) {
  const customer = await getCustomerById(customerId);
  if (!customer) return null;
  const [invoicesData, repairsData, paymentsData] = await Promise.all([
    getInvoices().catch(() => null),
    getRepairs().catch(() => null),
    getPayments().catch(() => null),
  ]);
  const invoices = filterActive(invoicesData);
  const repairs = filterActive(repairsData);
  const payments = filterActive(paymentsData);

  const invoiceMatches = invoices.filter((item) => String(item?.customerId || "") === String(customerId) || customerMatchByLegacyIdentity(customer, item));
  const repairMatches = repairs.filter((item) => String(item?.customerId || "") === String(customerId) || customerMatchByLegacyIdentity(customer, item));
  const paymentMatches = payments.filter((item) => String(item?.customerId || "") === String(customerId) || customerMatchByLegacyIdentity(customer, item));

  const totalPurchases = invoiceMatches.reduce((sum, item) => sum + safeNumber(item?.finalTotal ?? item?.total ?? item?.amount), 0);
  const amountPaidInvoices = invoiceMatches.reduce((sum, item) => sum + safeNumber(item?.paidAmount ?? 0), 0);
  const amountPaidRepairs = repairMatches.reduce((sum, item) => sum + safeNumber(item?.paidAmount ?? 0), 0);
  const amountPaidPayments = paymentMatches.reduce((sum, item) => sum + safeNumber(item?.amount ?? item?.paidAmount ?? 0), 0);
  const amountPaid = amountPaidInvoices + amountPaidRepairs + amountPaidPayments;
  const remainingInvoices = invoiceMatches.reduce((sum, item) => sum + safeNumber(item?.balance ?? Math.max(0, safeNumber(item?.finalTotal ?? item?.total ?? 0) - safeNumber(item?.paidAmount ?? 0))), 0);
  const remainingRepairs = repairMatches.reduce((sum, item) => sum + safeNumber(item?.balance ?? Math.max(0, safeNumber(item?.finalTotal ?? item?.price ?? 0) - safeNumber(item?.paidAmount ?? 0))), 0);
  const remaining = Math.max(0, remainingInvoices + remainingRepairs - amountPaidPayments);

  const payload = {
    totalPurchases,
    totalInvoices: invoiceMatches.length,
    totalRepairs: repairMatches.length,
    amountPaid,
    remainingBalance: remaining,
    updatedAt: now(),
  };
  await updateCustomer(customerId, payload);
  return { ...customer, ...payload };
}

export async function refreshCustomerStatsForRecord(record = {}) {
  const exact = await findMatchingCustomer({
    customerId: record?.customerId || record?.id || "",
    fullName: record?.customerName || record?.fullName || record?.name || record?.customer || "",
    phoneNumber: record?.customerPhone || record?.phoneNumber || record?.phone || "",
    whatsapp: record?.customerWhatsapp || record?.whatsapp || "",
  }).catch(() => null);

  if (exact?.id) {
    return rebuildCustomerStats(exact.id);
  }

  const customers = await getAllCustomers().catch(() => []);
  const normalizedName = normalizeText(record?.customerName || record?.fullName || record?.name || record?.customer || "");
  const normalizedPhone = normalizePhone(record?.customerPhone || record?.phoneNumber || record?.phone || record?.whatsapp || "");
  const fallback = customers.find((item) => {
    if (record?.customerId && String(item.id || item.customerId || "") === String(record.customerId)) return true;
    const itemPhone = normalizePhone(item.phoneNumber || item.phone || item.customerPhone || item.whatsapp || "");
    const itemName = normalizeText(item.fullName || item.name || item.customerName || "");
    if (normalizedPhone && itemPhone && normalizedPhone === itemPhone) return true;
    if (normalizedName && itemName && normalizedName === itemName) return true;
    return false;
  });
  return fallback?.id ? rebuildCustomerStats(fallback.id) : null;
}

function buildCustomerMatchers(customer = {}, previousCustomer = null) {
  const candidates = [customer, previousCustomer].filter(Boolean);
  const customerIds = new Set();
  const phones = new Set();
  const names = new Set();

  for (const item of candidates) {
    const id = String(item?.id || item?.customerId || "").trim();
    const phone = normalizePhone(item?.phoneNumber || item?.phone || item?.customerPhone || item?.whatsapp);
    const name = normalizeText(item?.fullName || item?.name || item?.customerName || "");
    if (id) customerIds.add(id);
    if (phone) phones.add(phone);
    if (name) names.add(name);
  }

  return { customerIds, phones, names };
}

export async function updateCustomerLinks(customerId, updates = {}, previousCustomer = null) {
  if (!customerId) return;
  const [invoicesData, repairsData, paymentsData] = await Promise.all([
    getInvoices().catch(() => null),
    getRepairs().catch(() => null),
    getPayments().catch(() => null),
  ]);
  const invoiceEntries = toArray(invoicesData);
  const repairEntries = toArray(repairsData);
  const paymentEntries = toArray(paymentsData);
  const currentCustomer = await getCustomerById(customerId);
  const matchers = buildCustomerMatchers(currentCustomer || { id: customerId }, previousCustomer);

  const match = (item = {}) => {
    const itemId = String(item?.customerId || "").trim();
    const itemPhone = normalizePhone(item?.customerPhone || item?.phone || item?.whatsapp || "");
    const itemName = normalizeText(item?.customerName || item?.name || item?.fullName || "");
    if (matchers.customerIds.has(itemId)) return true;
    if (itemPhone && matchers.phones.has(itemPhone)) return true;
    if (itemName && matchers.names.has(itemName)) return true;
    return false;
  };

  const nextCustomerName = updates.fullName || updates.name || updates.customerName || currentCustomer?.fullName || previousCustomer?.fullName || previousCustomer?.name || previousCustomer?.customerName;
  const nextPhone = updates.phoneNumber || updates.phone || updates.customerPhone || currentCustomer?.phoneNumber || previousCustomer?.phoneNumber || previousCustomer?.phone || previousCustomer?.customerPhone;
  const nextWhatsapp = updates.whatsapp || updates.customerWhatsapp || currentCustomer?.whatsapp || nextPhone || previousCustomer?.whatsapp || previousCustomer?.customerWhatsapp;
  const nextAddress = updates.address || currentCustomer?.address || previousCustomer?.address || "";
  const nextGender = updates.gender || currentCustomer?.gender || previousCustomer?.gender || "";
  const nextEmail = updates.email || currentCustomer?.email || previousCustomer?.email || "";

  const patch = {
    customerId,
    customerName: nextCustomerName,
    customerPhone: nextPhone,
    customerWhatsapp: nextWhatsapp,
    customerAddress: nextAddress,
    customerGender: nextGender,
    customerEmail: nextEmail,
    updatedAt: now(),
  };

  await Promise.all([
    ...invoiceEntries.filter(match).map((item) => editRecord(PATHS.invoices, item.id || item.invoiceId, patch).catch(() => null)),
    ...repairEntries.filter(match).map((item) => editRecord(PATHS.repairs, item.id || item.repairId, patch).catch(() => null)),
    ...paymentEntries.filter(match).map((item) => editRecord(PATHS.payments, item.id || item.paymentId, {
      ...patch,
      relatedType: item.relatedType || item.type || "payment",
    }).catch(() => null)),
  ]);
}

export async function getCustomerById(id) {
  if (!id) return null;
  const customers = await getAllCustomers();
  return customers.find((item) => String(item.id) === String(id) || String(item.customerId) === String(id)) || null;
}

export async function removeCustomer(id) {
  return deleteCustomer(id, { hardDelete: true });
}

export async function createQuickCustomerModal() {
  if (document.getElementById(CUSTOMER_MODAL_ID)) return;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
<div class="modal fade" id="${CUSTOMER_MODAL_ID}" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-lg">
    <div class="modal-content rounded-4">
      <div class="modal-header border-bottom">
        <div>
          <div class="small text-uppercase fw-bold text-muted">Quick customer</div>
          <h5 class="modal-title fw-bold mb-0">Add Customer</h5>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body p-4">
        <div class="row g-3">
          <div class="col-12 col-md-6"><label class="form-label fw-semibold">Name *</label><input id="quickCustomerName" class="form-control" type="text" /></div>
          <div class="col-12 col-md-6">
            <label class="form-label fw-semibold">Phone *</label>
            <input id="quickCustomerPhone" class="form-control" type="tel" />
            <div id="quickCustomerPhoneAvailability" class="form-text mt-1 text-muted">Enter a phone number to check availability.</div>
          </div>
          <div class="col-12 col-md-6"><label class="form-label fw-semibold">WhatsApp</label><input id="quickCustomerWhatsapp" class="form-control" type="tel" /></div>
          <div class="col-12 col-md-6"><label class="form-label fw-semibold">Gender</label><select id="quickCustomerGender" class="form-select"><option value="">Select</option><option>Male</option><option>Female</option></select></div>
          <div class="col-12 col-md-6"><label class="form-label fw-semibold">Address</label><input id="quickCustomerAddress" class="form-control" type="text" /></div>
          <div class="col-12 col-md-6"><label class="form-label fw-semibold">Email</label><input id="quickCustomerEmail" class="form-control" type="email" /></div>
          <div class="col-12"><label class="form-label fw-semibold">Notes</label><textarea id="quickCustomerNotes" class="form-control" rows="3"></textarea></div>
        </div>
      </div>
      <div class="modal-footer border-top">
        <button class="btn btn-light border rounded-4" data-bs-dismiss="modal" type="button">Cancel</button>
        <button class="btn btn-primary rounded-4" id="quickCustomerSaveBtn" type="button"><i class="bi bi-save2 me-1"></i> Save Customer</button>
      </div>
    </div>
  </div>
</div>`;
  document.body.appendChild(wrapper.firstElementChild);
}

export async function openQuickCustomerModal({ onCreated = null, defaults = {} } = {}) {
  await createQuickCustomerModal();
  const modalEl = document.getElementById(CUSTOMER_MODAL_ID);
  const modal = window.bootstrap?.Modal.getOrCreateInstance(modalEl);
  const setVal = (id, value = "") => { const el = document.getElementById(id); if (el) el.value = value; };
  const availabilityLabel = ensureCustomerPhoneLabel();
  setVal("quickCustomerName", defaults.name || "");
  setVal("quickCustomerPhone", defaults.phone || "");
  setVal("quickCustomerWhatsapp", defaults.whatsapp || defaults.phone || "");
  setVal("quickCustomerGender", defaults.gender || "");
  setVal("quickCustomerAddress", defaults.address || "");
  setVal("quickCustomerEmail", defaults.email || "");
  setVal("quickCustomerNotes", defaults.notes || "");

  const saveBtn = document.getElementById("quickCustomerSaveBtn");
  const phoneInput = document.getElementById("quickCustomerPhone");
  const availabilityLabelEl = document.getElementById("quickCustomerPhoneAvailability") || ensureCustomerPhoneLabel();
  let availabilityTimer = null;
  const cachedCustomers = await getAllCustomers().catch(() => []);

  const refreshAvailability = () => {
    const current = phoneInput?.value?.trim() || "";
    if (!current) {
      if (availabilityLabelEl) {
        availabilityLabelEl.innerHTML = '<i class="bi bi-info-circle me-1"></i> Enter a phone number to check availability.';
        availabilityLabelEl.className = "form-text mt-1 text-muted";
      }
      return;
    }
    const normalized = normalizePhone(current);
    const duplicate = cachedCustomers.find((item) => normalizePhone(item.phoneNumber || item.phone || item.customerPhone || item.whatsapp) === normalized);
    if (availabilityLabelEl) {
      const isAvailable = !duplicate;
      availabilityLabelEl.innerHTML = isAvailable
        ? '<i class="bi bi-check-circle-fill me-1"></i> This phone number is available ✓'
        : '<i class="bi bi-x-circle-fill me-1"></i> This phone number is not available ✖';
      availabilityLabelEl.className = `form-text mt-1 fw-semibold ${isAvailable ? "text-success" : "text-danger"}`;
      availabilityLabelEl.style.color = isAvailable ? "#16a34a" : "#dc2626";
    }
  };

  phoneInput?.addEventListener("input", () => {
    clearTimeout(availabilityTimer);
    availabilityTimer = setTimeout(refreshAvailability, 180);
  });
  refreshAvailability();

  const onSave = async () => {
    const data = {
      fullName: document.getElementById("quickCustomerName")?.value?.trim(),
      phoneNumber: document.getElementById("quickCustomerPhone")?.value?.trim(),
      whatsapp: document.getElementById("quickCustomerWhatsapp")?.value?.trim() || document.getElementById("quickCustomerPhone")?.value?.trim(),
      gender: document.getElementById("quickCustomerGender")?.value?.trim(),
      address: document.getElementById("quickCustomerAddress")?.value?.trim(),
      email: document.getElementById("quickCustomerEmail")?.value?.trim(),
      notes: document.getElementById("quickCustomerNotes")?.value?.trim(),
      sourcePage: "customers.html",
      moduleSource: "customers",
    };
    if (!data.fullName || !data.phoneNumber) {
      showToast("Customer name and phone are required.", "warning", "Customers");
      return;
    }
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Saving...';
    }
    try {
      const customer = await createCustomer({ ...data, existingCustomers: cachedCustomers });
      await rebuildCustomerStats(customer.id);
      showToast("Customer saved successfully.", "success", "Customers");
      modal.hide();
      onCreated?.(customer);
    } catch (error) {
      console.error("Quick customer save failed", error);
      showToast(error?.message || "Could not save customer.", "error", "Customers");
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-save2 me-1"></i> Save Customer';
      }
    }
  };
  if (saveBtn) saveBtn.onclick = onSave;
  modal.show();
}

export function bindQuickCustomerButton(buttonId, options = {}) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const defaults = typeof options.getDefaults === "function" ? options.getDefaults() : {};
    await openQuickCustomerModal({
      defaults,
      onCreated: async (customer) => {
        options.onCreated?.(customer);
      }
    });
  });
}

export function buildCustomerStats(customers = [], invoices = [], repairs = []) {
  const list = filterActive(customers).map((item) => toCustomerRecord(item));
  const today = new Date().toDateString();

  const matchesCustomer = (customer, record = {}) => {
    const customerId = String(customer.id || customer.customerId || "");
    const recordId = String(record.customerId || "");
    if (customerId && recordId && customerId === recordId) return true;

    const customerPhone = normalizePhone(customer.phoneNumber || customer.whatsapp || customer.phone || "");
    const recordPhone = normalizePhone(record.customerPhone || record.phone || record.whatsapp || "");
    if (customerPhone && recordPhone) return customerPhone === recordPhone;

    const customerName = normalizeText(customer.fullName || customer.name || customer.customerName || "");
    const recordName = normalizeText(record.customerName || record.name || record.fullName || "");
    return Boolean(!customerId && !customerPhone && customerName && recordName && customerName === recordName);
  };

  const customerSales = list.reduce((sum, customer) => {
    const customerInvoices = toArray(invoices).filter((item) => matchesCustomer(customer, item));
    return sum + customerInvoices.reduce((inner, item) => inner + safeNumber(item?.finalTotal ?? item?.total ?? item?.amount), 0);
  }, 0);

  const male = list.filter((item) => normalizeText(item.gender) === "male").length;
  const female = list.filter((item) => normalizeText(item.gender) === "female").length;
  const withBalance = list.filter((item) => {
    const invoiceTotal = toArray(invoices).filter((inv) => matchesCustomer(item, inv)).reduce((sum, inv) => sum + safeNumber(inv?.balance ?? Math.max(0, safeNumber(inv?.finalTotal ?? inv?.total ?? 0) - safeNumber(inv?.paidAmount ?? 0))), 0);
    const repairTotal = toArray(repairs).filter((rep) => matchesCustomer(item, rep)).reduce((sum, rep) => sum + safeNumber(rep?.balance ?? Math.max(0, safeNumber(rep?.finalTotal ?? rep?.price ?? 0) - safeNumber(rep?.paidAmount ?? 0))), 0);
    return invoiceTotal + repairTotal > 0;
  }).length;
  const newToday = list.filter((item) => new Date(safeNumber(item.createdAt)).toDateString() === today).length;

  return {
    totalCustomers: list.length,
    maleCustomers: male,
    femaleCustomers: female,
    customersWithBalance: withBalance,
    todaysNewCustomers: newToday,
    totalSalesFromCustomers: customerSales,
  };
}


if (typeof window !== 'undefined') {
  window.bindQuickCustomerButton = bindQuickCustomerButton;
  window.getAllCustomers = getAllCustomers;
  window.getCustomers = getAllCustomers;
  window.refreshCustomerStatsForRecord = refreshCustomerStatsForRecord;
}
