// js/customers.js
import {
  getCustomers,
  getInvoices,
  getRepairs,
  getPayments,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  toArray,
  safeNumber,
  normalizeText,
  filterActive,
} from "./database.js";
import { showToast, setPageLoading, formatDateTime } from "./main.js";
import {
  buildCustomerStats,
  getAllCustomers,
  rebuildCustomerStats,
  updateCustomerLinks,
  createQuickCustomerModal,
  openQuickCustomerModal,
  toCustomerRecord,
  normalizePhone,
  checkCustomerPhoneAvailability,
} from "./customer-utils.js";

const state = {
  customers: [],
  deletedCustomers: [],
  invoices: [],
  repairs: [],
  payments: [],
  search: "",
  genderFilter: "all",
  balanceFilter: "all",
  typeFilter: "all",
  sortFilter: "newest",
  selectedId: null,
};

function el(id) { return document.getElementById(id); }

function injectCustomerPageStyles() {
  if (document.getElementById("customer-page-tweaks")) return;
  const style = document.createElement("style");
  style.id = "customer-page-tweaks";
  style.textContent = `
    #customersTableBody td:nth-child(3),
    #customersTableBody th:nth-child(3) {
      display: table-cell !important;
    }
    @media (max-width: 767.98px) {
      .sticky-top-actions { position: static !important; }
      .section-body { padding: 14px !important; }
      .summary-value { font-size: 1.25rem; }
      .card-shell { border-radius: 18px; }
      .btn-group.flex-wrap { flex-wrap: wrap !important; }
      #customersTableBody td, #customersTableBody th {
        white-space: nowrap;
      }
      #customerProfileBody .customer-profile-grid {
        grid-template-columns: 1fr !important;
      }
      #customerProfileBody .profile-stack {
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
      }
      #customerProfileBody .profile-section {
        width: 100%;
      }
      #customerProfileBody .profile-section .table-responsive {
        overflow-x: auto;
      }
      #customerProfileBody .profile-section .table-responsive::-webkit-scrollbar,
      #invoiceCustomerSuggestions::-webkit-scrollbar,
      #repairCustomerSuggestions::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      #customerProfileBody .profile-section .table-responsive::-webkit-scrollbar-thumb,
      #invoiceCustomerSuggestions::-webkit-scrollbar-thumb,
      #repairCustomerSuggestions::-webkit-scrollbar-thumb {
        background: #ef4444;
        border-radius: 999px;
      }
      #customerProfileBody .profile-section .table-responsive,
      #invoiceCustomerSuggestions,
      #repairCustomerSuggestions {
        scrollbar-color: #ef4444 transparent;
        scrollbar-width: thin;
      }
    }
  `;
  document.head.appendChild(style);
}

function money(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(safeNumber(value));
}
function dateLabel(value) {
  return formatDateTime(value) || "";
}

function setCustomerSaveLoading(isSaving, editing = false) {
  const btn = el("saveCustomerBtn");
  if (!btn) return;
  if (isSaving) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>${editing ? "Updating..." : "Saving..."}`;
    return;
  }
  btn.disabled = false;
  btn.innerHTML = `<i class="bi bi-save2 me-1"></i>${editing ? "Update Customer" : "Save Customer"}`;
}

function setCustomerPhoneAvailability(text, available = null) {
  const label = document.getElementById("customerPhoneAvailability");
  if (!label) return;
  const icon = available === true ? "bi-check-circle-fill" : available === false ? "bi-x-circle-fill" : "bi-info-circle";
  label.innerHTML = `<i class="bi ${icon} me-1"></i>${text}`;
  label.classList.remove("text-success", "text-danger", "text-muted", "fw-semibold");
  const isDark = document.body.classList.contains("dark-mode") || document.documentElement.getAttribute("data-bs-theme") === "dark";
  if (available === true) {
    label.classList.add("fw-semibold");
    label.style.color = isDark ? "#4ade80" : "#16a34a";
  } else if (available === false) {
    label.classList.add("fw-semibold");
    label.style.color = isDark ? "#f87171" : "#dc2626";
  } else {
    label.classList.add("text-muted");
    label.style.color = "";
  }
}

function bindCustomerPhoneAvailability(ignoreId = "") {
  const phoneInput = el("customerPhoneField");
  if (!phoneInput) return;
  let timer = null;
  const check = async () => {
    const phone = phoneInput.value.trim();
    if (!phone) {
      setCustomerPhoneAvailability("Enter a phone number to check availability.");
      return;
    }
    const normalized = normalizePhone(phone);
    const existing = state.customers.find((item) => {
      if (!item) return false;
      if (ignoreId && String(item.id || item.customerId || "") === String(ignoreId)) return false;
      return normalizePhone(item.phoneNumber || item.phone || item.whatsapp) === normalized;
    });
    setCustomerPhoneAvailability(existing ? "This phone number is not available." : "This phone number is available.", !existing);
  };
  phoneInput.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(check, 180);
  };
  check();
}
function customerKey(customer = {}) {
  return String(customer.customerId || customer.id || customer.key || "");
}
function matchesCustomer(customer, query) {
  if (!query) return true;
  const text = normalizeText([
    customer.fullName,
    customer.phoneNumber,
    customer.whatsapp,
    customer.address,
    customer.gender,
    customer.email,
    customer.notes,
    customer.customerId,
  ].join(" "));
  return text.includes(normalizeText(query));
}

function linkedInvoices(customer) {
  const id = customerKey(customer);
  const phone = normalizePhone(customer.phoneNumber || customer.whatsapp || "");
  const name = normalizeText(customer.fullName || "");
  return filterActive(state.invoices).filter((inv) => {
    const invPhone = normalizePhone(inv.customerPhone || inv.phone || "");
    const invName = normalizeText(inv.customerName || "");
    if (id && String(inv.customerId || "") === id) return true;
    if (phone && invPhone) return invPhone === phone;
    return Boolean(!id && !phone && name && invName === name);
  });
}

function linkedRepairs(customer) {
  const id = customerKey(customer);
  const phone = normalizePhone(customer.phoneNumber || customer.whatsapp || "");
  const name = normalizeText(customer.fullName || "");
  return filterActive(state.repairs).filter((rep) => {
    const repPhone = normalizePhone(rep.customerPhone || rep.phone || "");
    const repName = normalizeText(rep.customerName || "");
    if (id && String(rep.customerId || "") === id) return true;
    if (phone && repPhone) return repPhone === phone;
    return Boolean(!id && !phone && name && repName === name);
  });
}

function linkedPayments(customer) {
  const id = customerKey(customer);
  const phone = normalizePhone(customer.phoneNumber || customer.whatsapp || "");
  const name = normalizeText(customer.fullName || "");
  return filterActive(state.payments).filter((payment) => {
    const payPhone = normalizePhone(payment.customerPhone || payment.phone || "");
    const payName = normalizeText(payment.customerName || "");
    if (id && String(payment.customerId || "") === id) return true;
    if (phone && payPhone) return payPhone === phone;
    return Boolean(!id && !phone && name && payName === name);
  });
}

function customerStats(customer) {
  const invoices = linkedInvoices(customer);
  const repairs = linkedRepairs(customer);
  const payments = linkedPayments(customer);
  const totalPurchases = invoices.reduce((sum, item) => sum + safeNumber(item.finalTotal ?? item.total ?? item.amount), 0);
  const paidInvoices = invoices.reduce((sum, item) => sum + safeNumber(item.paidAmount ?? 0), 0);
  const paidRepairs = repairs.reduce((sum, item) => sum + safeNumber(item.paidAmount ?? 0), 0);
  const paidPayments = payments.reduce((sum, item) => sum + safeNumber(item.paidNow ?? item.amount ?? item.paidAmount ?? 0), 0);
  const remainingInvoices = invoices.reduce((sum, item) => sum + safeNumber(item.balance ?? Math.max(0, safeNumber(item.finalTotal ?? item.total ?? 0) - safeNumber(item.paidAmount ?? 0))), 0);
  const remainingRepairs = repairs.reduce((sum, item) => sum + safeNumber(item.balance ?? Math.max(0, safeNumber(item.finalTotal ?? item.price ?? 0) - safeNumber(item.paidAmount ?? 0))), 0);
  return {
    totalPurchases,
    totalInvoices: invoices.length,
    totalRepairs: repairs.length,
    amountPaid: paidInvoices + paidRepairs + paidPayments,
    remainingBalance: Math.max(0, remainingInvoices + remainingRepairs),
  };
}

function renderStats() {
  const stats = buildCustomerStats(state.customers, state.invoices, state.repairs);
  const recycleCount = state.deletedCustomers.length;
  const cards = [
    ["Total Customers", stats.totalCustomers, "bi-people-fill", "All records", "text-primary-soft", "bg-soft-primary"],
    ["Male Customers", stats.maleCustomers, "bi-gender-male", "Male profiles", "text-success-soft", "bg-soft-success"],
    ["Female Customers", stats.femaleCustomers, "bi-gender-female", "Female profiles", "text-warning-soft", "bg-soft-warning"],
    ["Customers With Balance", stats.customersWithBalance, "bi-wallet2", "Pending balances", "text-danger-soft", "bg-soft-danger"],
    ["Today's New Customers", stats.todaysNewCustomers, "bi-calendar-event", "New today", "text-info-soft", "bg-soft-info"],
    ["Recycle Bin ♻️", recycleCount, "bi-trash3", "Soft deleted", "text-purple-soft", "bg-soft-purple", true],
    ["Total Sales From Customers", money(stats.totalSalesFromCustomers), "bi-cash-stack", "All customer sales", "text-primary-soft", "bg-soft-primary"],
  ];
  const row = el("customerStatsRow");
  if (!row) return;
  row.innerHTML = cards.map(([label, value, icon, trend, trendClass, iconClass, clickable = false], index) => `
    <div class="col-12 col-sm-6 col-xl-3">
      <div class="card-shell summary-card h-100 ${clickable ? 'customer-recycle-card' : ''}" ${clickable ? 'role="button" tabindex="0" id="recycleBinCard"' : ''}>
        <div class="d-flex align-items-center justify-content-between gap-3">
          <div>
            <p class="summary-label mb-1">${label}</p>
            <div class="summary-value">${value}</div>
            <div class="summary-trend ${trendClass}"><i class="bi ${icon} me-1"></i>${trend}</div>
          </div>
          <div class="summary-icon ${iconClass}"><i class="bi ${icon}"></i></div>
        </div>
      </div>
    </div>
  `).join("");
  const recycleCard = el("recycleBinCard");
  recycleCard?.addEventListener("click", openRecycleBinModal);
  recycleCard?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") openRecycleBinModal(); });
}

function customerFilterValue(customer) {
  const stats = customerStats(customer);
  const gender = normalizeText(customer.gender);
  const hasBalance = stats.remainingBalance > 0;
  const isPurchase = stats.totalInvoices > 0;
  const isRepair = stats.totalRepairs > 0;
  return { gender, hasBalance, isPurchase, isRepair, stats };
}

function getFilteredCustomers() {
  const list = state.customers
    .filter((customer) => matchesCustomer(customer, state.search))
    .filter((customer) => state.genderFilter === "all" || normalizeText(customer.gender) === state.genderFilter)
    .filter((customer) => {
      const meta = customerFilterValue(customer);
      if (state.balanceFilter === "balance") return meta.hasBalance;
      if (state.balanceFilter === "paid") return !meta.hasBalance;
      return true;
    })
    .filter((customer) => {
      const meta = customerFilterValue(customer);
      if (state.typeFilter === "purchase") return meta.isPurchase;
      if (state.typeFilter === "repair") return meta.isRepair;
      return true;
    });

  const sortKey = normalizeText(state.sortFilter || "newest");
  return list.sort((a, b) => {
    const metaA = customerFilterValue(a);
    const metaB = customerFilterValue(b);
    const createdA = safeNumber(a.createdAt);
    const createdB = safeNumber(b.createdAt);
    const nameA = normalizeText(a.fullName || "");
    const nameB = normalizeText(b.fullName || "");

    if (sortKey === "oldest") return createdA - createdB;
    if (sortKey === "name-az") return nameA.localeCompare(nameB);
    if (sortKey === "name-za") return nameB.localeCompare(nameA);
    if (sortKey === "highest-paid") return safeNumber(metaB.stats.amountPaid) - safeNumber(metaA.stats.amountPaid);
    if (sortKey === "lowest-paid") return safeNumber(metaA.stats.amountPaid) - safeNumber(metaB.stats.amountPaid);
    if (sortKey === "most-invoices") return safeNumber(metaB.stats.totalInvoices) - safeNumber(metaA.stats.totalInvoices);
    if (sortKey === "most-repairs") return safeNumber(metaB.stats.totalRepairs) - safeNumber(metaA.stats.totalRepairs);
    if (sortKey === "biggest-remaining" || sortKey === "remaining-high") return safeNumber(metaB.stats.remainingBalance) - safeNumber(metaA.stats.remainingBalance);
    if (sortKey === "smallest-remaining" || sortKey === "remaining-low") return safeNumber(metaA.stats.remainingBalance) - safeNumber(metaB.stats.remainingBalance);
    return createdB - createdA;
  });
}

function emptyRow(message = "No customers found") {
  return `<tr><td colspan="11" class="text-center py-5 text-muted">${message}</td></tr>`;
}

function renderTable() {
  const tbody = el("customersTableBody");
  if (!tbody) return;
  const rows = getFilteredCustomers();
  el("visibleCustomerCount").textContent = `${rows.length} customers`;

  if (!rows.length) {
    tbody.innerHTML = emptyRow();
    return;
  }

  tbody.innerHTML = rows.map((customer, index) => {
    const stats = customerStats(customer);
    const id = customerKey(customer);
    return `
      <tr>
        <td class="fw-semibold text-muted">${index + 1}</td>
        <td>
          <div class="fw-semibold">${customer.fullName || "—"}</div>
        </td>
        <td class="text-nowrap">${customer.phoneNumber || "—"}</td>
        <td>${customer.gender || "—"}</td>
        <td class="text-truncate" style="max-width:180px;">${customer.address || "—"}</td>
        <td class="text-nowrap">${money(stats.totalPurchases)}</td>
        <td class="text-nowrap">${stats.totalInvoices}</td>
        <td class="text-nowrap">${stats.totalRepairs}</td>
        <td class="text-nowrap">${money(stats.amountPaid)}</td>
        <td><span class="badge ${stats.remainingBalance > 0 ? 'bg-warning text-dark' : 'bg-success'} rounded-pill">${money(stats.remainingBalance)}</span></td>
        <td class="text-end">
          <div class="btn-group btn-group-sm flex-wrap justify-content-end gap-1">
            <button class="btn btn-outline-primary" data-action="view" data-id="${id}"><i class="bi bi-eye"></i></button>
            <button class="btn btn-outline-secondary" data-action="edit" data-id="${id}"><i class="bi bi-pencil-square"></i></button>
            <button class="btn btn-outline-danger" data-action="delete" data-id="${id}"><i class="bi bi-trash3"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function openCustomerModal(customer = null) {
  const editing = Boolean(customer);
  el("customerModalMode").textContent = editing ? "Edit Customer" : "New Customer";
  el("customerIdField").value = customer?.id || customer?.customerId || "";
  el("customerNameField").value = customer?.fullName || "";
  el("customerPhoneField").value = customer?.phoneNumber || "";
  el("customerWhatsappField").value = customer?.whatsapp || customer?.phoneNumber || "";
  el("customerGenderField").value = customer?.gender || "";
  el("customerAddressField").value = customer?.address || "";
  el("customerEmailField").value = customer?.email || "";
  el("customerNotesField").value = customer?.notes || "";
  const phoneField = el("customerPhoneField");
  if (phoneField && !document.getElementById("customerPhoneAvailability")) {
    const label = document.createElement("div");
    label.id = "customerPhoneAvailability";
    label.className = "form-text mt-1 text-muted";
    phoneField.insertAdjacentElement("afterend", label);
  }
  setCustomerSaveLoading(false, editing);
  bindCustomerPhoneAvailability(customer?.id || customer?.customerId || "");
  window.bootstrap?.Modal.getOrCreateInstance(el("customerModal")).show();
}

async function saveCustomerFromModal() {
  const id = el("customerIdField").value.trim();
  const editing = Boolean(id);
  const payload = {
    fullName: el("customerNameField").value.trim(),
    phoneNumber: el("customerPhoneField").value.trim(),
    whatsapp: el("customerWhatsappField").value.trim() || el("customerPhoneField").value.trim(),
    gender: el("customerGenderField").value.trim(),
    address: el("customerAddressField").value.trim(),
    email: el("customerEmailField").value.trim(),
    notes: el("customerNotesField").value.trim(),
    sourcePage: "customers.html",
    moduleSource: "customers",
    updatedAt: Date.now(),
  };
  if (!payload.fullName || !payload.phoneNumber) {
    showToast("Customer name and phone are required.", "warning", "Customers");
    return;
  }
  setCustomerSaveLoading(true, editing);
  try {
    const duplicate = state.customers.find((item) => item.id !== id && normalizePhone(item.phoneNumber) === normalizePhone(payload.phoneNumber));
    if (duplicate) {
      setCustomerPhoneAvailability("This phone number is not available.", false);
      showToast("A customer with this phone number already exists.", "warning", "Customers");
      return;
    }
    if (id) {
      const previousCustomer = state.customers.find((item) => String(item.id || item.customerId || "") === String(id)) || null;
      await updateCustomer(id, payload);
      await updateCustomerLinks(id, payload, previousCustomer);
      await rebuildCustomerStats(id);
      showToast("Customer updated successfully.", "success", "Customers");
    } else {
      const created = await addCustomer({
        ...payload,
        createdAt: Date.now(),
        deleted: false,
        isDeleted: false,
      });
      await rebuildCustomerStats(created.id || created.customerId);
      showToast("Customer created successfully.", "success", "Customers");
    }
    window.bootstrap?.Modal.getOrCreateInstance(el("customerModal")).hide();
    await loadData();
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not save customer.", "error", "Customers");
  } finally {
    setCustomerSaveLoading(false, editing);
  }
}


function renderProfile(customer) {
  const body = el("customerProfileBody");
  const profileName = el("profileCustomerName");
  if (!body || !profileName) return;

  const invoices = linkedInvoices(customer);
  const repairs = linkedRepairs(customer);
  const payments = linkedPayments(customer);
  const stats = customerStats(customer);

  profileName.textContent = customer.fullName || "Customer";

  const recentActivity = [
    ...invoices.map((item) => ({ type: "Invoice", date: safeNumber(item.createdAt), title: item.invoiceNumber || item.id || "Invoice", amount: item.finalTotal ?? item.total ?? item.amount ?? 0, status: item.paymentStatus || "—" })),
    ...repairs.map((item) => ({ type: "Repair", date: safeNumber(item.createdAt), title: item.repairNumber || item.id || "Repair", amount: item.finalTotal ?? item.price ?? item.cost ?? 0, status: item.status || "—" })),
    ...payments.map((item) => ({ type: "Payment", date: safeNumber(item.createdAt), title: item.relatedNumber || item.id || "Payment", amount: item.paidNow ?? item.amount ?? item.paidAmount ?? 0, status: item.paymentType || item.paymentProvider || "—" })),
  ].sort((a, b) => b.date - a.date).slice(0, 12);

  const paymentRows = payments.map((pay) => ({
    type: 'Payment', ref: pay.relatedNumber || pay.id || '—', date: dateLabel(pay.createdAt), phone: pay.customerPhone || customer.phoneNumber || '—', whatsapp: pay.customerWhatsapp || pay.customerPhone || customer.whatsapp || '—', sender: pay.senderNumber || pay.customerPhone || '—', paymentType: pay.paymentType || 'Mobile Money', provider: pay.paymentProvider || pay.cashCurrency || 'Evc Plus', paid: money(pay.paidNow ?? pay.amount ?? pay.paidAmount), total: money(pay.totalAmount ?? pay.totalPaid ?? pay.paidAmount), remaining: money(pay.totalRemaining ?? pay.remaining), status: pay.relatedType || 'Payment', notes: pay.notes || '—'
  }));

  const transactionRows = [
    ...invoices.map((inv) => ({
      type: 'Invoice', ref: inv.invoiceNumber || inv.id || '—', date: dateLabel(inv.createdAt), phone: inv.customerPhone || customer.phoneNumber || '—', whatsapp: inv.customerWhatsapp || inv.customerPhone || customer.whatsapp || '—', sender: inv.senderNumber || inv.customerPhone || '—', paymentType: inv.paymentType || 'Mobile Money', provider: inv.paymentProvider || inv.cashCurrency || 'Evc Plus', paid: money(inv.paidAmount), total: money(inv.finalTotal ?? inv.total ?? inv.amount), remaining: money(inv.balance), status: inv.paymentStatus || '—', notes: inv.notes || '—'
    })),
    ...repairs.map((rep) => ({
      type: 'Repair', ref: rep.repairNumber || rep.id || '—', date: dateLabel(rep.createdAt), phone: rep.customerPhone || customer.phoneNumber || '—', whatsapp: rep.customerWhatsapp || rep.customerPhone || customer.whatsapp || '—', sender: rep.senderNumber || rep.customerPhone || '—', paymentType: rep.paymentType || 'Mobile Money', provider: rep.paymentProvider || rep.cashCurrency || 'Evc Plus', paid: money(rep.paidAmount), total: money(rep.finalTotal ?? rep.price ?? rep.cost), remaining: money(rep.balance), status: rep.status || '—', notes: rep.notes || '—'
    })),
    ...paymentRows
  ];

  const customerInfoRows = [
    ["Name", customer.fullName || "—"],
    ["Phone", customer.phoneNumber || "—"],
    ["Gender", customer.gender || "—"],
    ["Address", customer.address || "—"],
    ["Email", customer.email || "—"],
    ["Notes", customer.notes || "—"],
  ].map(([label, value]) => `
    <div class="d-flex justify-content-between gap-3 py-2 border-bottom">
      <div class="text-muted small fw-semibold">${label}</div>
      <div class="fw-semibold text-end">${String(value || "—")}</div>
    </div>
  `).join("");

  const invoiceRows = invoices.map((inv) => `
    <tr>
      <td>${inv.invoiceNumber || inv.id || "—"}</td>
      <td>${dateLabel(inv.createdAt)}</td>
      <td>${inv.customerPhone || customer.phoneNumber || "—"}</td>
      <td>${inv.customerWhatsapp || inv.customerPhone || customer.whatsapp || "—"}</td>
      <td>${inv.senderNumber || inv.customerPhone || "—"}</td>
      <td>${inv.paymentType || "Mobile Money"}</td>
      <td>${inv.paymentProvider || inv.cashCurrency || "Evc Plus"}</td>
      <td>${(inv.items || []).map((i) => i.name || i.productName || i).join(", ") || "—"}</td>
      <td>${money(inv.finalTotal ?? inv.total ?? inv.amount)}</td>
      <td>${money(inv.paidAmount)}</td>
      <td>${money(inv.balance)}</td>
      <td><span class="badge bg-${String(inv.paymentStatus || '').toLowerCase() === 'paid' ? 'success' : 'warning'}">${inv.paymentStatus || "—"}</span></td>
      <td><button class="btn btn-sm btn-outline-primary" type="button" onclick="window.location.href='invoice.html'"><i class="bi bi-eye"></i></button></td>
    </tr>
  `).join("") || `<tr><td colspan="13" class="text-muted text-center py-4">No invoices yet</td></tr>`;

  const repairRows = repairs.map((rep) => `
    <tr>
      <td>${rep.repairNumber || rep.id || "—"}</td>
      <td>${rep.customerPhone || customer.phoneNumber || "—"}</td>
      <td>${rep.customerWhatsapp || rep.customerPhone || customer.whatsapp || "—"}</td>
      <td>${rep.senderNumber || rep.customerPhone || "—"}</td>
      <td>${rep.paymentType || "Mobile Money"}</td>
      <td>${rep.paymentProvider || rep.cashCurrency || "Evc Plus"}</td>
      <td>${rep.deviceName || rep.device || "—"}</td>
      <td>${rep.brand || "—"}</td>
      <td>${rep.model || "—"}</td>
      <td>${rep.imei || "—"}</td>
      <td>${rep.problem || "—"}</td>
      <td>${rep.technician || "—"}</td>
      <td>${rep.status || "—"}</td>
      <td>${money(rep.finalTotal ?? rep.price)}</td>
      <td>${money(rep.paidAmount)}</td>
      <td>${money(rep.balance)}</td>
      <td>${dateLabel(rep.createdAt)}</td>
    </tr>
  `).join("") || `<tr><td colspan="17" class="text-muted text-center py-4">No repairs yet</td></tr>`;

  const activityRows = recentActivity.map((item) => `
    <tr>
      <td><span class="badge bg-soft-primary text-primary-soft">${item.type}</span></td>
      <td>${item.title}</td>
      <td>${dateLabel(item.date)}</td>
      <td>${money(item.amount)}</td>
      <td>${item.status}</td>
    </tr>
  `).join("") || `<tr><td colspan="5" class="text-muted text-center py-4">No activity yet</td></tr>`;

  body.innerHTML = `
    <div class="row g-3 mb-4">
      <div class="col-12 col-md-6 col-xl-3"><div class="card-shell summary-card h-100"><div class="summary-label">Total Purchases</div><div class="summary-value">${money(stats.totalPurchases)}</div></div></div>
      <div class="col-12 col-md-6 col-xl-3"><div class="card-shell summary-card h-100"><div class="summary-label">Invoices</div><div class="summary-value">${stats.totalInvoices}</div></div></div>
      <div class="col-12 col-md-6 col-xl-3"><div class="card-shell summary-card h-100"><div class="summary-label">Repairs</div><div class="summary-value">${stats.totalRepairs}</div></div></div>
      <div class="col-12 col-md-6 col-xl-3"><div class="card-shell summary-card h-100"><div class="summary-label">Remaining Balance</div><div class="summary-value">${money(stats.remainingBalance)}</div></div></div>
    </div>

    <div class="profile-stack">
      <div class="card-shell profile-section">
        <div class="section-header">
          <h6 class="fw-bold mb-1">Customer Information</h6>
          <p class="text-muted mb-0">Profile details and contact information.</p>
        </div>
        <div class="section-body pt-3">
          <div class="card-shell p-3 p-md-4">
            ${customerInfoRows}
          </div>
        </div>
      </div>

      <div class="card-shell profile-section">
        <div class="section-header">
          <h6 class="fw-bold mb-1">Transactions</h6>
          <p class="text-muted mb-0">All invoices and repairs linked to this customer.</p>
        </div>
        <div class="section-body pt-2">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light"><tr><th>Type</th><th>Reference</th><th>Date</th><th>Phone</th><th>WhatsApp</th><th>Sender</th><th>Payment Type</th><th>Provider / Cash</th><th>Paid</th><th>Total</th><th>Remaining</th><th>Status</th><th>Notes</th></tr></thead>
              <tbody>${transactionRows.map((item) => `
                <tr>
                  <td><span class="badge bg-soft-primary text-primary-soft">${item.type}</span></td>
                  <td>${item.ref}</td>
                  <td>${item.date}</td>
                  <td>${item.phone}</td>
                  <td>${item.whatsapp}</td>
                  <td>${item.sender}</td>
                  <td>${item.paymentType}</td>
                  <td>${item.provider}</td>
                  <td>${item.paid}</td>
                  <td>${item.total}</td>
                  <td>${item.remaining}</td>
                  <td>${item.status}</td>
                  <td>${item.notes}</td>
                </tr>
              `).join("")}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card-shell profile-section">
        <div class="section-header">
          <h6 class="fw-bold mb-1">Invoices</h6>
          <p class="text-muted mb-0">Customer purchase history.</p>
        </div>
        <div class="section-body pt-2">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light"><tr><th>Invoice #</th><th>Date</th><th>Phone</th><th>WhatsApp</th><th>Sender</th><th>Payment Type</th><th>Provider / Cash</th><th>Items</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>${invoiceRows}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card-shell profile-section">
        <div class="section-header">
          <h6 class="fw-bold mb-1">Repairs</h6>
          <p class="text-muted mb-0">Customer repair history.</p>
        </div>
        <div class="section-body pt-2">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light"><tr><th>Repair #</th><th>Phone</th><th>WhatsApp</th><th>Sender</th><th>Payment Type</th><th>Provider / Cash</th><th>Device</th><th>Brand</th><th>Model</th><th>IMEI</th><th>Problem</th><th>Technician</th><th>Status</th><th>Cost</th><th>Paid</th><th>Remaining</th><th>Date</th></tr></thead>
              <tbody>${repairRows}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="card-shell profile-section">
        <div class="section-header">
          <h6 class="fw-bold mb-1">Recent Activity</h6>
          <p class="text-muted mb-0">Latest invoices and repairs.</p>
        </div>
        <div class="section-body pt-2">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light"><tr><th>Type</th><th>Reference</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>${activityRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  window.bootstrap?.Modal.getOrCreateInstance(el("customerProfileModal")).show();
}
async function deleteCustomerById(id) {
  const customer = state.customers.find((item) => String(item.id) === String(id));
  if (!customer) return;
  const invoices = linkedInvoices(customer);
  const repairs = linkedRepairs(customer);
  if (invoices.length || repairs.length) {
    showToast("Cannot delete this customer because there are invoices or repair records linked to this customer.", "warning", "Customers");
    return;
  }
  const modal = await ensureDeleteConfirmModal();
  const body = document.getElementById("customerDeleteModalBody");
  const confirmBtn = document.getElementById("customerDeleteConfirmBtn");
  if (body) {
    body.innerHTML = `
      <div class="d-flex align-items-start gap-3">
        <div class="summary-icon bg-soft-danger flex-shrink-0"><i class="bi bi-trash3"></i></div>
        <div>
          <div class="fw-bold fs-5 mb-1">Move customer to Recycle Bin?</div>
          <div class="text-muted">Customer <strong>${customer.fullName || "—"}</strong> ${customer.phoneNumber ? `(${customer.phoneNumber})` : ""} will be soft deleted and can be restored later.</div>
        </div>
      </div>
    `;
  }
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      try {
        await deleteCustomer(id, { hardDelete: false });
        showToast("Customer moved to Recycle Bin.", "success", "Customers");
        window.bootstrap?.Modal.getOrCreateInstance(document.getElementById("customerDeleteModal"))?.hide();
        await loadData();
      } catch (error) {
        console.error(error);
        showToast(error?.message || "Could not delete customer.", "error", "Customers");
      }
    };
  }
  window.bootstrap?.Modal.getOrCreateInstance(document.getElementById("customerDeleteModal"))?.show();
}

async function ensureDeleteConfirmModal() {
  if (document.getElementById("customerDeleteModal")) return document.getElementById("customerDeleteModal");
  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div class="modal fade" id="customerDeleteModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content rounded-4">
        <div class="modal-header border-bottom">
          <h5 class="modal-title fw-bold mb-0">Recycle Bin</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body p-4" id="customerDeleteModalBody"></div>
        <div class="modal-footer border-top">
          <button class="btn btn-light border rounded-4" data-bs-dismiss="modal" type="button">Cancel</button>
          <button class="btn btn-danger rounded-4" id="customerDeleteConfirmBtn" type="button"><i class="bi bi-trash3 me-1"></i> Move to Recycle Bin</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
  return document.getElementById("customerDeleteModal");
}

async function ensureRecycleBinModal() {
  if (document.getElementById("customerRecycleModal")) return document.getElementById("customerRecycleModal");
  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div class="modal fade" id="customerRecycleModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content rounded-4">
        <div class="modal-header border-bottom flex-wrap gap-2">
          <div>
            <div class="small text-uppercase fw-bold text-muted">Recycle bin ♻️</div>
            <h5 class="modal-title fw-bold mb-0">Soft deleted customers</h5>
          </div>
          <div class="d-flex flex-wrap gap-2 ms-auto me-2">
            <button type="button" class="btn btn-sm btn-outline-success rounded-3" id="restoreAllCustomersBtn"><i class="bi bi-arrow-counterclockwise me-1"></i> Restore All</button>
            <button type="button" class="btn btn-sm btn-outline-danger rounded-3" id="deleteAllCustomersBtn"><i class="bi bi-trash3 me-1"></i> Delete All</button>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body p-4">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>No</th><th>Full Name</th><th>Phone</th><th>Gender</th><th>Address</th><th class="text-end">Actions</th>
                </tr>
              </thead>
              <tbody id="recycleBinBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
  return document.getElementById("customerRecycleModal");
}

function renderRecycleBin() {
  const body = document.getElementById("recycleBinBody");
  if (!body) return;
  const rows = state.deletedCustomers || [];
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Recycle bin is empty.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map((customer, index) => `
    <tr>
      <td class="fw-semibold text-muted">${index + 1}</td>
      <td class="fw-semibold">${customer.fullName || "—"}</td>
      <td class="text-nowrap">${customer.phoneNumber || "—"}</td>
      <td>${customer.gender || "—"}</td>
      <td class="text-truncate" style="max-width:180px;">${customer.address || "—"}</td>
      <td class="text-end">
        <div class="btn-group btn-group-sm">
          <button class="btn btn-outline-success" data-recycle-action="restore" data-id="${customer.id || customer.customerId}"><i class="bi bi-arrow-clockwise"></i></button>
          <button class="btn btn-outline-danger" data-recycle-action="purge" data-id="${customer.id || customer.customerId}"><i class="bi bi-trash3"></i></button>
        </div>
      </td>
    </tr>
  `).join("");
}

async function confirmRecycleBinAction({ title, message, confirmText = "Continue", danger = false } = {}) {
  return new Promise((resolve) => {
    let modal = document.getElementById("customerConfirmModal");
    if (!modal) {
      const wrap = document.createElement("div");
      wrap.innerHTML = `
      <div class="modal fade" id="customerConfirmModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content rounded-4">
            <div class="modal-header border-bottom">
              <h5 class="modal-title fw-bold mb-0" id="customerConfirmTitle">Confirm action</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-4" id="customerConfirmBody"></div>
            <div class="modal-footer border-top">
              <button type="button" class="btn btn-light border rounded-3" data-bs-dismiss="modal">Cancel</button>
              <button type="button" class="btn btn-danger rounded-3" id="customerConfirmOkBtn">Continue</button>
            </div>
          </div>
        </div>
      </div>`;
      document.body.appendChild(wrap.firstElementChild);
      modal = document.getElementById("customerConfirmModal");
    }
    const titleEl = document.getElementById("customerConfirmTitle");
    const bodyEl = document.getElementById("customerConfirmBody");
    const okBtn = document.getElementById("customerConfirmOkBtn");
    if (titleEl) titleEl.textContent = title || "Confirm action";
    if (bodyEl) bodyEl.innerHTML = `<div class="border rounded-4 p-3 ${danger ? 'bg-danger-subtle border-danger-subtle' : 'bg-body-tertiary'}"><div class="fw-bold mb-1">${message || ''}</div></div>`;
    if (okBtn) {
      okBtn.className = danger ? 'btn btn-danger rounded-3' : 'btn btn-primary rounded-3';
      okBtn.textContent = confirmText;
      okBtn.onclick = () => { window.bootstrap?.Modal.getOrCreateInstance(modal).hide(); resolve(true); };
    }
    modal.addEventListener('hidden.bs.modal', () => resolve(false), { once: true });
    window.bootstrap?.Modal.getOrCreateInstance(modal).show();
  });
}

async function restoreAllDeletedCustomers() {
  const items = state.deletedCustomers || [];
  if (!items.length) return showToast("Recycle bin is empty.", "info", "Customers");
  const ok = await confirmRecycleBinAction({ title: "Restore all customers", message: `Restore ${items.length} deleted customer${items.length === 1 ? '' : 's'}?`, confirmText: "Restore All" });
  if (!ok) return;
  try {
    const { restoreCustomer } = await import("./database.js");
    for (const item of items) {
      await restoreCustomer(item.id || item.customerId);
    }
    showToast("All customers restored.", "success", "Customers");
    await loadData();
    renderRecycleBin();
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not restore all customers.", "error", "Customers");
  }
}

async function deleteAllDeletedCustomers() {
  const items = state.deletedCustomers || [];
  if (!items.length) return showToast("Recycle bin is empty.", "info", "Customers");
  const ok = await confirmRecycleBinAction({ title: "Delete all customers forever", message: `Permanently delete ${items.length} customer${items.length === 1 ? '' : 's'}? This cannot be undone.`, confirmText: "Delete Forever", danger: true });
  if (!ok) return;
  try {
    for (const item of items) {
      await deleteCustomer(item.id || item.customerId, { hardDelete: true });
    }
    showToast("All deleted customers removed forever.", "success", "Customers");
    await loadData();
    renderRecycleBin();
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not delete all customers.", "error", "Customers");
  }
}

async function openRecycleBinModal() {
  await ensureRecycleBinModal();
  renderRecycleBin();
  document.getElementById("restoreAllCustomersBtn")?.addEventListener("click", restoreAllDeletedCustomers);
  document.getElementById("deleteAllCustomersBtn")?.addEventListener("click", deleteAllDeletedCustomers);
  window.bootstrap?.Modal.getOrCreateInstance(document.getElementById("customerRecycleModal")).show();
}

async function restoreCustomerFromRecycle(id) {
  try {
    const { restoreCustomer } = await import("./database.js");
    await restoreCustomer(id);
    showToast("Customer restored from Recycle Bin.", "success", "Customers");
    await loadData();
    renderRecycleBin();
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not restore customer.", "error", "Customers");
  }
}

async function purgeCustomerForever(id) {
  const customer = state.deletedCustomers.find((item) => String(item.id) === String(id));
  if (!customer) return;
  const ok = await confirmRecycleBinAction({ title: "Delete customer forever", message: `Delete permanently "${customer.fullName || "this customer"}"? This cannot be undone.`, confirmText: "Delete Forever", danger: true });
  if (!ok) return;
  try {
    await deleteCustomer(id, { hardDelete: true });
    showToast("Customer deleted permanently.", "success", "Customers");
    await loadData();
    renderRecycleBin();
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not delete permanently.", "error", "Customers");
  }
}

async function exportCsv() {
  const rows = getFilteredCustomers();
  const header = ["No", "Full Name", "Phone", "Gender", "Address", "T-Purchase", "T-Invoice.", "T-Repairs", "T-Paid", "T-Balance"];
  const csv = [header, ...rows.map((c, index) => {
    const stats = customerStats(c);
    return [
      index + 1,
      c.fullName || "",
      c.phoneNumber || "",
      c.gender || "",
      c.address || "",
      stats.totalPurchases,
      stats.totalInvoices,
      stats.totalRepairs,
      stats.amountPaid,
      stats.remainingBalance
    ];
  })].map((r) => r.map((v) => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "customers.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportExcel() {
  const rows = getFilteredCustomers();
  const html = `
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; color: #111827; }
      h1 { margin: 0 0 6px; font-size: 20px; }
      .meta { color: #6b7280; margin-bottom: 14px; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; font-size: 12px; }
      th { background: #eff6ff; font-weight: 700; }
      tr:nth-child(even) td { background: #f9fafb; }
    </style>
  </head>
  <body>
    <h1>Waasuge Electronics - Customers</h1>
    <div class="meta">Generated ${new Date().toLocaleString()}</div>
    <table>
      <tr><th>No</th><th>Full Name</th><th>Phone</th><th>Gender</th><th>Address</th><th>T-Purchase</th><th>T-Invoice.</th><th>T-Repairs</th><th>T-Paid</th><th>T-Balance</th></tr>
      ${rows.map((c, index) => { const stats = customerStats(c); return `<tr><td>${index + 1}</td><td>${c.fullName || ""}</td><td>${c.phoneNumber || ""}</td><td>${c.gender || ""}</td><td>${c.address || ""}</td><td>${money(stats.totalPurchases)}</td><td>${stats.totalInvoices}</td><td>${stats.totalRepairs}</td><td>${money(stats.amountPaid)}</td><td>${money(stats.remainingBalance)}</td></tr>`; }).join("")}
    </table>
  </body>
  </html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "customers.xls";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportPdf() {
  const rows = getFilteredCustomers();
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    showToast("PDF library not available.", "warning", "Customers");
    return;
  }
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(13, 110, 253);
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("Waasuge Electronics - Customers", 14, 13);
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 18);
  doc.setTextColor(17, 24, 39);

  let y = 30;
  const colWidths = [10, 44, 30, 18, 36, 24, 24, 24, 24, 24];
  const headers = ["No","Full Name","Phone","Gender","Address","T-Purchase","T-Invoice.","T-Repairs","T-Paid","T-Balance"];
  const drawRow = (cells, isHeader = false) => {
    const rowHeight = isHeader ? 9 : 8;
    let x = 10;
    if (y + rowHeight > 190) {
      doc.addPage();
      y = 14;
    }
    if (isHeader) {
      doc.setFillColor(226, 232, 240);
      doc.rect(10, y - 4, pageWidth - 20, rowHeight + 1, "F");
      doc.setFont(undefined, "bold");
    }
    cells.forEach((cell, idx) => {
      const text = String(cell ?? "");
      doc.text(text.length > 28 ? `${text.slice(0, 26)}…` : text, x + 1.5, y);
      x += colWidths[idx];
    });
    y += rowHeight;
    if (!isHeader) {
      doc.setDrawColor(229, 231, 235);
      doc.line(10, y - 2, pageWidth - 10, y - 2);
    }
    doc.setFont(undefined, "normal");
  };

  drawRow(headers, true);
  rows.forEach((c, index) => {
    const stats = customerStats(c);
    drawRow([
      index + 1,
      c.fullName || "",
      c.phoneNumber || "",
      c.gender || "",
      c.address || "",
      money(stats.totalPurchases),
      stats.totalInvoices,
      stats.totalRepairs,
      money(stats.amountPaid),
      money(stats.remainingBalance),
    ]);
  });
  doc.save("customers.pdf");
}


function printCustomers() {
  const rows = getFilteredCustomers();
  const htmlRows = rows.map((c, index) => {
    const stats = customerStats(c);
    return `
      <tr>
        <td>${index + 1}</td>
        <td>${c.fullName || ""}</td>
        <td>${c.phoneNumber || ""}</td>
        <td>${c.gender || ""}</td>
        <td>${c.address || ""}</td>
        <td>${money(stats.totalPurchases)}</td>
        <td>${stats.totalInvoices}</td>
        <td>${stats.totalRepairs}</td>
        <td>${money(stats.amountPaid)}</td>
        <td>${money(stats.remainingBalance)}</td>
      </tr>`;
  }).join("") || `<tr><td colspan="10" style="text-align:center;padding:18px;color:#6b7280;">No customers found</td></tr>`;

  const win = window.open("", "_blank", "width=1200,height=900");
  if (!win) {
    showToast("Popup blocked. Please allow popups to print.", "warning", "Customers");
    return;
  }

  const dateText = new Date().toLocaleString();
  win.document.write(`
    <html>
    <head>
      <title>Customers Print</title>
      <meta charset="utf-8" />
      <style>
        :root { color-scheme: light; }
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 24px; color: #0f172a; background: #f8fafc; }
        .sheet { background: #fff; border: 1px solid #e2e8f0; border-radius: 18px; padding: 22px; box-shadow: 0 18px 40px rgba(15,23,42,.08); }
        .head { display:flex; justify-content:space-between; gap:16px; align-items:flex-end; margin-bottom: 18px; }
        .brand { font-size: 22px; font-weight: 800; margin: 0; }
        .meta { color:#64748b; font-size:12px; margin-top:4px; }
        .stats { display:flex; flex-wrap:wrap; gap:10px; margin: 14px 0 18px; }
        .pill { border:1px solid #dbe3ee; border-radius:999px; padding:8px 12px; font-size:12px; font-weight:700; background:#f8fafc; }
        table { width:100%; border-collapse: collapse; font-size: 12px; }
        th, td { border-bottom: 1px solid #e2e8f0; padding: 9px 8px; text-align:left; vertical-align: top; }
        th { background:#eff6ff; color:#0f172a; font-size:11px; text-transform:uppercase; letter-spacing:.04em; }
        tbody tr:nth-child(even) td { background: #f8fafc; }
        @media print {
          body { background:#fff; padding:0; }
          .sheet { border:none; box-shadow:none; border-radius:0; padding:0; }
          .no-print { display:none !important; }
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        <div class="head">
          <div>
            <h1 class="brand">Waasuge Electronics - Customers</h1>
            <div class="meta">Generated ${dateText}</div>
          </div>
          <div class="meta">Premium customer report</div>
        </div>
        <div class="stats">
          <div class="pill">Total Customers: ${rows.length}</div>
          <div class="pill">With Balance: ${rows.filter(r => customerStats(r).remainingBalance > 0).length}</div>
          <div class="pill">Paid Customers: ${rows.filter(r => customerStats(r).remainingBalance <= 0).length}</div>
        </div>
        <table>
          <thead>
            <tr><th>No</th><th>Full Name</th><th>Phone</th><th>Gender</th><th>Address</th><th>T-Purchase</th><th>T-Invoice.</th><th>T-Repairs</th><th>T-Paid</th><th>T-Balance</th></tr>
          </thead>
          <tbody>${htmlRows}</tbody>
        </table>
      </div>
      <script>
        window.onload = () => { window.focus(); window.print(); window.onafterprint = () => window.close(); };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}

async function loadData() {
  setPageLoading?.([".page-wrap"], true);
  try {
    const [cust, inv, rep, pay] = await Promise.all([
      getCustomers().catch(() => null),
      getInvoices().catch(() => null),
      getRepairs().catch(() => null),
      getPayments().catch(() => null),
    ]);
    const allCustomers = toArray(cust).map((item) => toCustomerRecord(item));
    state.deletedCustomers = allCustomers.filter((item) => item.deleted || item.isDeleted);
    state.customers = allCustomers.filter((item) => !item.deleted && !item.isDeleted);
    state.invoices = filterActive(inv);
    state.repairs = filterActive(rep);
    state.payments = filterActive(pay);
    renderStats();
    renderTable();
  } catch (error) {
    console.error(error);
    showToast("Could not load customer data.", "error", "Customers");
  } finally {
    setPageLoading?.([".page-wrap"], false);
  }
}

function bindEvents() {
  const syncSearch = (value = "") => {
    state.search = value;
    const top = el("topCustomerSearch");
    const main = el("customerSearch");
    if (top && top.value !== value) top.value = value;
    if (main && main.value !== value) main.value = value;
    renderTable();
  };

  el("customerSearch")?.addEventListener("input", (e) => syncSearch(e.target.value));
  el("topCustomerSearch")?.addEventListener("input", (e) => syncSearch(e.target.value));
  el("genderFilter")?.addEventListener("change", (e) => { state.genderFilter = e.target.value; renderTable(); });
  el("balanceFilter")?.addEventListener("change", (e) => { state.balanceFilter = e.target.value; renderTable(); });
  el("typeFilter")?.addEventListener("change", (e) => { state.typeFilter = e.target.value; renderTable(); });
  el("sortFilter")?.addEventListener("change", (e) => { state.sortFilter = e.target.value; renderTable(); });
  el("resetFiltersBtn")?.addEventListener("click", () => {
    state.search = "";
    state.genderFilter = "all";
    state.balanceFilter = "all";
    state.typeFilter = "all";
    state.sortFilter = "newest";
    ["customerSearch","topCustomerSearch"].forEach((id) => { const n = el(id); if (n) n.value = ""; });
    if (el("genderFilter")) el("genderFilter").value = "all";
    if (el("balanceFilter")) el("balanceFilter").value = "all";
    if (el("typeFilter")) el("typeFilter").value = "all";
    if (el("sortFilter")) el("sortFilter").value = "newest";
    renderTable();
  });
  el("addCustomerBtn")?.addEventListener("click", () => openCustomerModal());
  el("addCustomerBtnTop")?.addEventListener("click", () => openCustomerModal());
  el("printCustomersBtn")?.addEventListener("click", printCustomers);
  el("saveCustomerBtn")?.addEventListener("click", saveCustomerFromModal);
  el("customersTableBody")?.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const customer = state.customers.find((item) => String(item.id) === String(id));
    if (!customer) return;
    if (btn.dataset.action === "view") return renderProfile(customer);
    if (btn.dataset.action === "edit") return openCustomerModal(customer);
    if (btn.dataset.action === "delete") return deleteCustomerById(id);
  });
  el("exportCsvBtn")?.addEventListener("click", exportCsv);
  el("exportExcelBtn")?.addEventListener("click", exportExcel);
  el("exportPdfBtn")?.addEventListener("click", exportPdf);
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-recycle-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.recycleAction === "restore") return restoreCustomerFromRecycle(id);
    if (btn.dataset.recycleAction === "purge") return purgeCustomerForever(id);
  }, { once: false });
}

async function init() {
  if (!document.getElementById("customersTableBody")) return;
  injectCustomerPageStyles();
  await createQuickCustomerModal();
  await ensureRecycleBinModal();
  await ensureDeleteConfirmModal();
  bindEvents();
  await loadData();
}

document.addEventListener("DOMContentLoaded", init);
