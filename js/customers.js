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
  profileCollapsed: {
    transactions: false,
    invoices: false,
    repairs: false,
    activity: true,
  },
  profileCustomerKey: "",
  currentProfile: null,
  profileCharts: {
    paymentType: null,
    provider: null,
  },
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
      #customerProfileBody .profile-info-grid {
        grid-template-columns: 1fr !important;
      }
      #customerProfileBody .profile-toolbar > div {
        width: 100%;
      }
      #customerProfileBody .profile-toolbar .btn {
        width: 100%;
      }
      #customerProfileBody .profile-toolbar .d-flex {
        width: 100%;
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

      #customerProfileBody {
        --profile-surface: rgba(255,255,255,0.92);
      }
      body.dark-mode #customerProfileBody {
        --profile-surface: rgba(15, 23, 42, 0.92);
      }
      #customerProfileBody .profile-toolbar {
        position: sticky;
        top: 0;
        z-index: 5;
        backdrop-filter: blur(16px);
        background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.78));
      }
      body.dark-mode #customerProfileBody .profile-toolbar {
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(15, 23, 42, 0.82));
      }
      #customerProfileBody .profile-stack {
        display: grid;
        gap: 16px;
      }
      #customerProfileBody .profile-section {
        overflow: hidden;
      }
      #customerProfileBody .profile-section.is-collapsed .profile-section-body {
        display: none !important;
      }
      #customerProfileBody .profile-section .section-header {
        padding-bottom: 16px;
      }
      #customerProfileBody .profile-section .table-responsive {
        border-radius: 18px;
        border: 1px solid rgba(148, 163, 184, 0.12);
        background: var(--profile-surface);
      }
      #customerProfileBody .profile-section .table {
        margin-bottom: 0;
      }
      #customerProfileBody .profile-section .table thead th {
        white-space: nowrap;
        position: sticky;
        top: 0;
        z-index: 1;
      }
      #customerProfileBody .profile-stack-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      #customerProfileBody .profile-stack-cell .main-line {
        font-weight: 700;
        line-height: 1.2;
      }
      #customerProfileBody .profile-stack-cell .sub-line {
        font-size: 0.78rem;
        color: var(--muted);
        line-height: 1.2;
        word-break: break-word;
      }
      body.dark-mode #customerProfileBody .profile-stack-cell .sub-line {
        color: var(--dark-muted);
      }
      #customerProfileBody .profile-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        padding: 7px 11px;
        font-weight: 700;
        font-size: 0.82rem;
        border: 1px solid transparent;
      }
      #customerProfileBody .profile-chip.bg-soft-primary { color: #2563eb; border-color: rgba(37,99,235,.12); }
      #customerProfileBody .profile-chip.bg-soft-success { color: #16a34a; border-color: rgba(22,163,74,.12); }
      #customerProfileBody .profile-chip.bg-soft-warning { color: #b45309; border-color: rgba(245,158,11,.14); }
      #customerProfileBody .profile-chip.bg-soft-danger { color: #dc2626; border-color: rgba(220,38,38,.12); }
      #customerProfileBody .profile-chip.bg-soft-info { color: #0891b2; border-color: rgba(8,145,178,.12); }
      #customerProfileBody .profile-chip.bg-soft-purple { color: #7c3aed; border-color: rgba(124,58,237,.12); }
      body.dark-mode #customerProfileBody .profile-chip.bg-soft-primary { color: #bfdbfe; border-color: rgba(96,165,250,.18); }
      body.dark-mode #customerProfileBody .profile-chip.bg-soft-success { color: #bbf7d0; border-color: rgba(74,222,128,.18); }
      body.dark-mode #customerProfileBody .profile-chip.bg-soft-warning { color: #fde68a; border-color: rgba(251,191,36,.18); }
      body.dark-mode #customerProfileBody .profile-chip.bg-soft-danger { color: #fecaca; border-color: rgba(248,113,113,.18); }
      body.dark-mode #customerProfileBody .profile-chip.bg-soft-info { color: #a5f3fc; border-color: rgba(34,211,238,.18); }
      body.dark-mode #customerProfileBody .profile-chip.bg-soft-purple { color: #ddd6fe; border-color: rgba(167,139,250,.18); }
      #customerProfileBody .profile-info-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      #customerProfileBody .profile-info-card {
        border-radius: 18px;
        padding: 14px;
        border: 1px solid rgba(148, 163, 184, 0.12);
        background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.96));
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
      }
      body.dark-mode #customerProfileBody .profile-info-card {
        background: linear-gradient(180deg, rgba(17,24,39,0.96), rgba(15,23,42,0.94));
        border-color: rgba(148, 163, 184, 0.16);
      }
      #customerProfileBody .profile-info-card .label {
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: .06em;
        font-weight: 800;
        color: var(--muted);
      }
      body.dark-mode #customerProfileBody .profile-info-card .label {
        color: var(--dark-muted);
      }
      #customerProfileBody .profile-info-card .value {
        font-weight: 800;
        word-break: break-word;
      }
      #customerProfileBody .profile-section-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
      }
      #customerProfileBody .profile-section-actions .btn {
        border-radius: 999px;
      }
      #customerProfileBody .profile-scroll-group {
        display: flex;
        flex-wrap: nowrap;
        gap: 8px;
        align-items: center;
      }
      #customerProfileBody .profile-section-actions {
        justify-content: flex-end;
      }
      #customerProfileBody .profile-info-card.bg-soft-primary { background: linear-gradient(180deg, rgba(37,99,235,0.10), rgba(255,255,255,0.96)); }
      #customerProfileBody .profile-info-card.bg-soft-success { background: linear-gradient(180deg, rgba(22,163,74,0.10), rgba(255,255,255,0.96)); }
      #customerProfileBody .profile-info-card.bg-soft-info { background: linear-gradient(180deg, rgba(8,145,178,0.10), rgba(255,255,255,0.96)); }
      #customerProfileBody .profile-info-card.bg-soft-warning { background: linear-gradient(180deg, rgba(245,158,11,0.12), rgba(255,255,255,0.96)); }
      #customerProfileBody .profile-info-card.bg-soft-danger { background: linear-gradient(180deg, rgba(220,38,38,0.10), rgba(255,255,255,0.96)); }
      #customerProfileBody .profile-info-card.bg-soft-purple { background: linear-gradient(180deg, rgba(124,58,237,0.10), rgba(255,255,255,0.96)); }
      body.dark-mode #customerProfileBody .profile-info-card.bg-soft-primary { background: linear-gradient(180deg, rgba(37,99,235,0.18), rgba(17,24,39,0.96)); }
      body.dark-mode #customerProfileBody .profile-info-card.bg-soft-success { background: linear-gradient(180deg, rgba(22,163,74,0.18), rgba(17,24,39,0.96)); }
      body.dark-mode #customerProfileBody .profile-info-card.bg-soft-info { background: linear-gradient(180deg, rgba(8,145,178,0.18), rgba(17,24,39,0.96)); }
      body.dark-mode #customerProfileBody .profile-info-card.bg-soft-warning { background: linear-gradient(180deg, rgba(245,158,11,0.18), rgba(17,24,39,0.96)); }
      body.dark-mode #customerProfileBody .profile-info-card.bg-soft-danger { background: linear-gradient(180deg, rgba(220,38,38,0.18), rgba(17,24,39,0.96)); }
      body.dark-mode #customerProfileBody .profile-info-card.bg-soft-purple { background: linear-gradient(180deg, rgba(124,58,237,0.18), rgba(17,24,39,0.96)); }
  `;
  document.head.appendChild(style);
}

function money(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(safeNumber(value));
}
function dateLabel(value) {
  return formatDateTime(value) || "";
}

function moneyCell(value) {
  return value === null || value === undefined || value === "" ? "—" : money(value);
}

function normalizeProfileChannelLabel(value = "", fallback = "Other") {
  const raw = String(value || "").trim();
  const normalized = normalizeText(raw);
  if (!normalized) return fallback;
  if (normalized.includes("evc") || normalized.includes("hormuud")) return "Evc Plus (Hormuud)";
  if (normalized.includes("edahab") || normalized.includes("somtel")) return "Edahab (Somtel)";
  if (normalized.includes("jeeb") || normalized.includes("somnet")) return "Jeeb (Somnet)";
  if (normalized.includes("cash")) return "Cash";
  return raw;
}

function countByLabel(items = [], picker = (item) => "") {
  const counts = new Map();
  items.forEach((item) => {
    const label = normalizeProfileChannelLabel(picker(item));
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return counts;
}

function buildChartDataset(counts, preferredOrder = []) {
  const seen = new Set();
  const labels = [];
  const values = [];
  preferredOrder.forEach((label) => {
    if (!counts.has(label)) return;
    labels.push(label);
    values.push(counts.get(label));
    seen.add(label);
  });
  [...counts.keys()].sort((a, b) => a.localeCompare(b)).forEach((label) => {
    if (seen.has(label)) return;
    labels.push(label);
    values.push(counts.get(label));
  });
  return { labels, values };
}

function destroyProfileCharts() {
  if (window.CustomerProfileCharts) {
    Object.values(window.CustomerProfileCharts).forEach((chart) => {
      try { chart?.destroy?.(); } catch (_) {}
    });
  }
  window.CustomerProfileCharts = {};
  state.profileCharts.paymentType = null;
  state.profileCharts.provider = null;
}

function renderProfileCharts(rows = []) {
  if (!window.Chart) return;
  const paymentCanvas = document.getElementById("profilePaymentTypeChart");
  const providerCanvas = document.getElementById("profileProviderChart");
  if (!paymentCanvas || !providerCanvas) return;

  destroyProfileCharts();

  const paymentCounts = countByLabel(rows, (row) => row.paymentType || row.type);
  const providerCounts = countByLabel(rows, (row) => row.provider || row.paymentProvider || row.cashCurrency);

  const paymentDataset = buildChartDataset(paymentCounts, ["Mobile Money", "Cash", "Bank Transfer", "Card"]);
  const providerDataset = buildChartDataset(providerCounts, ["Evc Plus (Hormuud)", "Edahab (Somtel)", "Jeeb (Somnet)", "Cash"]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: "bottom" } },
  };

  if (paymentDataset.labels.length) {
    window.CustomerProfileCharts.paymentType = new Chart(paymentCanvas, {
      type: "doughnut",
      data: {
        labels: paymentDataset.labels,
        datasets: [{ data: paymentDataset.values }],
      },
      options: chartOptions,
    });
    state.profileCharts.paymentType = window.CustomerProfileCharts.paymentType;
  }

  if (providerDataset.labels.length) {
    window.CustomerProfileCharts.provider = new Chart(providerCanvas, {
      type: "doughnut",
      data: {
        labels: providerDataset.labels,
        datasets: [{ data: providerDataset.values }],
      },
      options: chartOptions,
    });
    state.profileCharts.provider = window.CustomerProfileCharts.provider;
  }
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



function profileSafeId(value) {
  return String(value || "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60);
}
function profileCell(main, sub = "", tone = "") {
  const toneClass = tone ? ` ${tone}` : "";
  return `<div class="profile-stack-cell${toneClass}"><div class="main-line">${main || "—"}</div>${sub ? `<div class="sub-line">${sub}</div>` : ""}</div>`;
}
function profileCompactList(items = []) {
  const filtered = items.filter(Boolean);
  return filtered.length ? filtered.map((item) => `<div>${item}</div>`).join("") : "—";
}
function profileToggleIcon(collapsed) {
  return collapsed ? '<i class="bi bi-chevron-down"></i>' : '<i class="bi bi-chevron-up"></i>';
}
function profileScrollButtons(sectionKey) {
  return `
    <div class="profile-section-actions">
      <button class="btn btn-sm btn-outline-secondary" type="button" data-profile-action="scroll-left" data-section="${sectionKey}" aria-label="Scroll left"><i class="bi bi-chevron-left"></i></button>
      <button class="btn btn-sm btn-outline-secondary" type="button" data-profile-action="scroll-right" data-section="${sectionKey}" aria-label="Scroll right"><i class="bi bi-chevron-right"></i></button>
      <button class="btn btn-sm btn-outline-primary" type="button" data-profile-action="toggle-section" data-section="${sectionKey}" aria-label="Toggle section"><span class="me-1">${sectionKey === "activity" ? "Show/Hide" : "Show/Hide"}</span><i class="bi bi-chevron-up"></i></button>
    </div>`;
}


function renderProfile(customer) {
  const body = el("customerProfileBody");
  const profileName = el("profileCustomerName");
  if (!body || !profileName) return;

  const key = customerKey(customer) || customer.id || customer.phoneNumber || customer.fullName || "customer";
  const isSameCustomer = state.profileCustomerKey === key;
  if (!isSameCustomer) {
    state.profileCollapsed = {
      transactions: false,
      invoices: false,
      repairs: false,
      activity: true,
    };
    state.profileCustomerKey = key;
  }

  const invoices = linkedInvoices(customer).slice().sort((a, b) => safeNumber(b.createdAt) - safeNumber(a.createdAt));
  const repairs = linkedRepairs(customer).slice().sort((a, b) => safeNumber(b.createdAt) - safeNumber(a.createdAt));
  const payments = linkedPayments(customer).slice().sort((a, b) => safeNumber(b.createdAt) - safeNumber(a.createdAt));
  const stats = customerStats(customer);

  profileName.textContent = customer.fullName || "Customer";

  const createdLabel = dateLabel(customer.createdAt || customer.joinedAt || customer.addedAt);
  const recentActivity = [
    ...invoices.map((item) => ({ type: "Invoice", ts: safeNumber(item.createdAt), title: item.invoiceNumber || item.id || "Invoice", amount: item.finalTotal ?? item.total ?? item.amount ?? 0, status: item.paymentStatus || "—" })),
    ...repairs.map((item) => ({ type: "Repair", ts: safeNumber(item.createdAt), title: item.repairNumber || item.id || "Repair", amount: item.finalTotal ?? item.price ?? item.cost ?? 0, status: item.status || "—" })),
    ...payments.map((item) => ({ type: "Payment", ts: safeNumber(item.createdAt), title: item.relatedNumber || item.id || "Payment", amount: item.paidNow ?? item.amount ?? item.paidAmount ?? 0, status: item.paymentType || item.paymentProvider || "—" })),
  ].sort((a, b) => b.ts - a.ts).slice(0, 12);

  const transactionRows = [
    ...invoices.map((inv) => ({
      type: "Invoice",
      ts: safeNumber(inv.createdAt),
      ref: inv.invoiceNumber || inv.id || "—",
      date: dateLabel(inv.createdAt),
      phone: inv.customerPhone || customer.phoneNumber || "—",
      whatsapp: inv.customerWhatsapp || inv.customerPhone || customer.whatsapp || "—",
      sender: inv.senderNumber || inv.customerPhone || "—",
      paymentType: inv.paymentType || "Mobile Money",
      provider: inv.paymentProvider || inv.cashCurrency || "Evc Plus",
      paid: money(inv.paidAmount),
      total: money(inv.finalTotal ?? inv.total ?? inv.amount),
      remaining: money(inv.balance),
      status: inv.paymentStatus || "—",
      notes: inv.notes || "—",
    })),
    ...repairs.map((rep) => ({
      type: "Repair",
      ts: safeNumber(rep.createdAt),
      ref: rep.repairNumber || rep.id || "—",
      date: dateLabel(rep.createdAt),
      phone: rep.customerPhone || customer.phoneNumber || "—",
      whatsapp: rep.customerWhatsapp || rep.customerPhone || customer.whatsapp || "—",
      sender: rep.senderNumber || rep.customerPhone || "—",
      paymentType: rep.paymentType || "Mobile Money",
      provider: rep.paymentProvider || rep.cashCurrency || "Evc Plus",
      paid: money(rep.paidAmount),
      total: money(rep.finalTotal ?? rep.price ?? rep.cost),
      remaining: money(rep.balance),
      status: rep.status || "—",
      notes: rep.notes || "—",
    })),
    ...payments.map((pay) => ({
      type: "Payment",
      ts: safeNumber(pay.createdAt),
      ref: pay.relatedNumber || pay.id || "—",
      date: dateLabel(pay.createdAt),
      phone: pay.customerPhone || customer.phoneNumber || "—",
      whatsapp: pay.customerWhatsapp || pay.customerPhone || customer.whatsapp || "—",
      sender: pay.senderNumber || pay.customerPhone || "—",
      paymentType: pay.paymentType || "Mobile Money",
      provider: pay.paymentProvider || pay.cashCurrency || "Evc Plus",
      paid: pay.paidNow ?? pay.amount ?? pay.paidAmount ?? null,
      total: pay.totalAmount ?? pay.totalPaid ?? pay.amount ?? pay.paidNow ?? pay.paidAmount ?? null,
      remaining: pay.totalRemaining ?? pay.remaining ?? null,
      status: pay.relatedType || "Payment",
      notes: pay.notes || "—",
    })),
  ].sort((a, b) => b.ts - a.ts);

  const customerInfoCards = [
    ["Name", customer.fullName || "—", "bg-soft-primary"],
    ["Phone", customer.phoneNumber || "—", "bg-soft-success"],
    ["WhatsApp", customer.whatsapp || customer.whatsappNumber || customer.phoneNumber || "—", "bg-soft-info"],
    ["Created", createdLabel || "—", "bg-soft-purple"],
    ["Gender", customer.gender || "—", "bg-soft-warning"],
    ["Address", customer.address || "—", "bg-soft-danger"],
    ["Email", customer.email || "—", "bg-soft-primary"],
    ["Notes", customer.notes || "—", "bg-soft-success"],
  ].map(([label, value, tone]) => `
    <div class="profile-info-card ${tone}">
      <div class="label">${label}</div>
      <div class="value mt-1">${String(value || "—")}</div>
    </div>
  `).join("");

  const invoiceRows = invoices.map((inv) => `
    <tr>
      <td>${profileCell(`<span class="profile-chip bg-soft-primary">${inv.invoiceNumber || inv.id || "—"}</span>`, dateLabel(inv.createdAt))}</td>
      <td>${profileCell(inv.customerPhone || customer.phoneNumber || "—", inv.customerWhatsapp || customer.whatsapp || "—")}</td>
      <td>${profileCell(inv.senderNumber || inv.customerPhone || "—", inv.paymentType || "Mobile Money")}</td>
      <td>${profileCell(inv.paymentProvider || inv.cashCurrency || "Evc Plus", (inv.items || []).map((i) => i.name || i.productName || i).join(", ") || "—")}</td>
      <td>${money(inv.finalTotal ?? inv.total ?? inv.amount)}</td>
      <td>${money(inv.paidAmount)}</td>
      <td>${money(inv.balance)}</td>
      <td><span class="profile-chip ${String(inv.paymentStatus || "").toLowerCase() === "paid" ? "bg-soft-success" : "bg-soft-warning"}">${inv.paymentStatus || "—"}</span></td>
      <td><button class="btn btn-sm btn-outline-primary rounded-pill" type="button" onclick="window.location.href='invoice.html'"><i class="bi bi-eye"></i></button></td>
    </tr>
  `).join("") || `<tr><td colspan="9" class="text-muted text-center py-4">No invoices yet</td></tr>`;

  const repairRows = repairs.map((rep) => `
    <tr>
      <td>${profileCell(`<span class="profile-chip bg-soft-purple">${rep.repairNumber || rep.id || "—"}</span>`, dateLabel(rep.createdAt))}</td>
      <td>${profileCell(rep.customerPhone || customer.phoneNumber || "—", rep.customerWhatsapp || customer.whatsapp || "—")}</td>
      <td>${profileCell(rep.senderNumber || rep.customerPhone || "—", rep.paymentType || "Mobile Money")}</td>
      <td>${profileCell(rep.paymentProvider || rep.cashCurrency || "Evc Plus", rep.deviceName || rep.device || "—")}</td>
      <td>${profileCell(rep.problem || "—", rep.technician || "—")}</td>
      <td>${money(rep.finalTotal ?? rep.price ?? rep.cost)}</td>
      <td>${money(rep.paidAmount)}</td>
      <td>${money(rep.balance)}</td>
      <td><span class="profile-chip ${String(rep.status || "").toLowerCase().includes("done") || String(rep.status || "").toLowerCase().includes("completed") ? "bg-soft-success" : "bg-soft-info"}">${rep.status || "—"}</span></td>
      <td class="text-muted">${dateLabel(rep.createdAt)}</td>
    </tr>
  `).join("") || `<tr><td colspan="10" class="text-muted text-center py-4">No repairs yet</td></tr>`;

  const activityRows = recentActivity.map((item) => `
    <tr>
      <td><span class="profile-chip bg-soft-primary">${item.type}</span></td>
      <td>${item.title}</td>
      <td>${dateLabel(item.ts)}</td>
      <td>${money(item.amount)}</td>
      <td><span class="profile-chip bg-soft-info">${item.status}</span></td>
    </tr>
  `).join("") || `<tr><td colspan="5" class="text-muted text-center py-4">No activity yet</td></tr>`;

  const profileInsightsCard = `
    <div class="card-shell profile-section">
      <div class="section-header d-flex flex-wrap justify-content-between align-items-start gap-2">
        <div>
          <h6 class="fw-bold mb-1">Payment Insights</h6>
          <p class="text-muted mb-0">How this customer usually pays and which providers are used most.</p>
        </div>
      </div>
      <div class="section-body pt-3 profile-section-body">
        <div class="row g-3">
          <div class="col-12 col-lg-6">
            <div class="card-shell p-3 h-100" style="min-height: 320px;">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <div class="fw-bold">Payment type</div>
                  <small class="text-muted">Invoice, repair, and payment records</small>
                </div>
                <i class="bi bi-pie-chart text-primary fs-5"></i>
              </div>
              <div style="height: 240px;">
                <canvas id="profilePaymentTypeChart"></canvas>
              </div>
            </div>
          </div>
          <div class="col-12 col-lg-6">
            <div class="card-shell p-3 h-100" style="min-height: 320px;">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <div>
                  <div class="fw-bold">Provider / cash</div>
                  <small class="text-muted">Evc Plus, Edahab, Jeeb, cash</small>
                </div>
                <i class="bi bi-graph-up-arrow text-success fs-5"></i>
              </div>
              <div style="height: 240px;">
                <canvas id="profileProviderChart"></canvas>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  state.currentProfile = {
    customer,
    invoices,
    repairs,
    payments,
    recentActivity,
    transactionRows,
  };

  const sectionClass = (section) => `card-shell profile-section ${state.profileCollapsed?.[section] ? "is-collapsed" : ""}`;
  const sectionIcon = (section) => state.profileCollapsed?.[section] ? "bi-chevron-down" : "bi-chevron-up";

  body.innerHTML = `
    <div class="profile-toolbar card-shell p-3 mb-3">
      <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center">
        <div class="d-flex flex-wrap gap-2">
          <button class="btn btn-primary rounded-pill" type="button" data-profile-action="print-profile"><i class="bi bi-printer me-1"></i>Print</button>
          <button class="btn btn-outline-primary rounded-pill" type="button" data-profile-action="export-profile-pdf"><i class="bi bi-file-earmark-pdf me-1"></i>Export PDF</button>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <button class="btn btn-outline-secondary rounded-pill" type="button" data-profile-action="scroll-left" data-section="transactions"><i class="bi bi-chevron-left me-1"></i>Left</button>
          <button class="btn btn-outline-secondary rounded-pill" type="button" data-profile-action="scroll-right" data-section="transactions"><i class="bi bi-chevron-right me-1"></i>Right</button>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-4">
      <div class="col-12 col-md-6 col-xl-3"><div class="card-shell summary-card h-100"><div class="summary-label">Total Purchases</div><div class="summary-value">${money(stats.totalPurchases)}</div></div></div>
      <div class="col-12 col-md-6 col-xl-3"><div class="card-shell summary-card h-100"><div class="summary-label">Invoices</div><div class="summary-value">${stats.totalInvoices}</div></div></div>
      <div class="col-12 col-md-6 col-xl-3"><div class="card-shell summary-card h-100"><div class="summary-label">Repairs</div><div class="summary-value">${stats.totalRepairs}</div></div></div>
      <div class="col-12 col-md-6 col-xl-3"><div class="card-shell summary-card h-100"><div class="summary-label">Remaining Balance</div><div class="summary-value">${money(stats.remainingBalance)}</div></div></div>
    </div>

    <div class="profile-stack">
      <div class="card-shell profile-section">
        <div class="section-header d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div>
            <h6 class="fw-bold mb-1">Customer Information</h6>
            <p class="text-muted mb-0">Profile details and contact information.</p>
          </div>
        </div>
        <div class="section-body pt-3 profile-section-body">
          <div class="profile-info-grid">
            ${customerInfoCards}
          </div>
        </div>
      </div>

      ${profileInsightsCard}

      <div class="${sectionClass("transactions")}">
        <div class="section-header d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div>
            <h6 class="fw-bold mb-1">Transactions</h6>
            <p class="text-muted mb-0">All invoices, repairs, and payments linked to this customer.</p>
          </div>
          <div class="profile-section-actions">
            <div class="profile-scroll-group">
              <button class="btn btn-sm btn-outline-secondary" type="button" data-profile-action="scroll-left" data-section="transactions"><i class="bi bi-chevron-left"></i></button>
              <button class="btn btn-sm btn-outline-secondary" type="button" data-profile-action="scroll-right" data-section="transactions"><i class="bi bi-chevron-right"></i></button>
            </div>
            <button class="btn btn-sm btn-outline-primary" type="button" data-profile-action="toggle-section" data-section="transactions">${profileToggleIcon(state.profileCollapsed.transactions)}</button>
          </div>
        </div>
        <div class="section-body pt-2 profile-section-body" data-profile-scroll-target="transactions">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr>
                  <th>Type</th><th>Reference / Date</th><th>Contact</th><th>Payment Type / Provider</th><th>Paid</th><th>Total</th><th>Remaining</th><th>Status</th><th>Notes</th>
                </tr>
              </thead>
              <tbody>${transactionRows.map((item) => `
                <tr>
                  <td><span class="profile-chip ${item.type === "Invoice" ? "bg-soft-primary" : item.type === "Repair" ? "bg-soft-purple" : "bg-soft-info"}">${item.type}</span></td>
                  <td>${profileCell(item.ref, item.date)}</td>
                  <td>${profileCell(item.phone, `${item.whatsapp} • ${item.sender}`)}</td>
                  <td>${profileCell(item.paymentType, item.provider)}</td>
                  <td>${moneyCell(item.paid)}</td>
                  <td>${moneyCell(item.total)}</td>
                  <td>${moneyCell(item.remaining)}</td>
                  <td><span class="profile-chip ${String(item.status || "").toLowerCase() === "paid" ? "bg-soft-success" : "bg-soft-warning"}">${item.status}</span></td>
                  <td class="text-muted">${item.notes}</td>
                </tr>
              `).join("")}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="${sectionClass("invoices")}">
        <div class="section-header d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div>
            <h6 class="fw-bold mb-1">Invoices</h6>
            <p class="text-muted mb-0">Customer purchase history.</p>
          </div>
          <div class="profile-section-actions">
            <div class="profile-scroll-group">
              <button class="btn btn-sm btn-outline-secondary" type="button" data-profile-action="scroll-left" data-section="invoices"><i class="bi bi-chevron-left"></i></button>
              <button class="btn btn-sm btn-outline-secondary" type="button" data-profile-action="scroll-right" data-section="invoices"><i class="bi bi-chevron-right"></i></button>
            </div>
            <button class="btn btn-sm btn-outline-primary" type="button" data-profile-action="toggle-section" data-section="invoices">${profileToggleIcon(state.profileCollapsed.invoices)}</button>
          </div>
        </div>
        <div class="section-body pt-2 profile-section-body" data-profile-scroll-target="invoices">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr><th>Invoice #</th><th>Phone / WhatsApp</th><th>Sender / Payment</th><th>Provider / Items</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>${invoiceRows}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="${sectionClass("repairs")}">
        <div class="section-header d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div>
            <h6 class="fw-bold mb-1">Repairs</h6>
            <p class="text-muted mb-0">Customer repair history.</p>
          </div>
          <div class="profile-section-actions">
            <div class="profile-scroll-group">
              <button class="btn btn-sm btn-outline-secondary" type="button" data-profile-action="scroll-left" data-section="repairs"><i class="bi bi-chevron-left"></i></button>
              <button class="btn btn-sm btn-outline-secondary" type="button" data-profile-action="scroll-right" data-section="repairs"><i class="bi bi-chevron-right"></i></button>
            </div>
            <button class="btn btn-sm btn-outline-primary" type="button" data-profile-action="toggle-section" data-section="repairs">${profileToggleIcon(state.profileCollapsed.repairs)}</button>
          </div>
        </div>
        <div class="section-body pt-2 profile-section-body" data-profile-scroll-target="repairs">
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr><th>Repair #</th><th>Phone / WhatsApp</th><th>Sender / Payment</th><th>Provider / Device</th><th>Problem / Tech</th><th>Cost</th><th>Paid</th><th>Remaining</th><th>Status</th><th>Date</th></tr>
              </thead>
              <tbody>${repairRows}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="${sectionClass("activity")}">
        <div class="section-header d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div>
            <h6 class="fw-bold mb-1">Recent Activity</h6>
            <p class="text-muted mb-0">Latest invoices and repairs.</p>
          </div>
          <div class="profile-section-actions">
            <div class="profile-scroll-group">
              <button class="btn btn-sm btn-outline-secondary" type="button" data-profile-action="scroll-left" data-section="activity"><i class="bi bi-chevron-left"></i></button>
              <button class="btn btn-sm btn-outline-secondary" type="button" data-profile-action="scroll-right" data-section="activity"><i class="bi bi-chevron-right"></i></button>
            </div>
            <button class="btn btn-sm btn-outline-primary" type="button" data-profile-action="toggle-section" data-section="activity">${profileToggleIcon(state.profileCollapsed.activity)}</button>
          </div>
        </div>
        <div class="section-body pt-2 profile-section-body" data-profile-scroll-target="activity">
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

  renderProfileCharts(transactionRows);
  window.bootstrap?.Modal.getOrCreateInstance(el("customerProfileModal")).show();
}
function printCustomerProfile() {
  const profile = state.currentProfile;
  if (!profile) {
    showToast("Open a customer profile first.", "warning", "Customers");
    return;
  }
  const { customer, invoices, repairs, payments, recentActivity } = profile;
  const win = window.open("", "_blank", "width=1200,height=900");
  if (!win) {
    showToast("Popup blocked. Please allow popups to print.", "warning", "Customers");
    return;
  }

  const rows = [...invoices.map((row) => ({ ...row, kind: "Invoice" })), ...repairs.map((row) => ({ ...row, kind: "Repair" })), ...payments.map((row) => ({ ...row, kind: "Payment" }))].sort((a, b) => safeNumber(b.createdAt) - safeNumber(a.createdAt));
  const customerLine = [
    customer.fullName || "—",
    customer.phoneNumber || "—",
    customer.whatsapp || "—",
    customer.address || "—",
    customer.email || "—",
  ].join(" | ");

  win.document.write(`
    <html>
    <head>
      <title>${(customer.fullName || "Customer").replace(/</g, "&lt;")}</title>
      <meta charset="utf-8" />
      <style>
        body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;color:#0f172a;background:#f8fafc}
        .sheet{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:22px}
        h1{margin:0 0 6px;font-size:22px}
        .meta{color:#64748b;font-size:12px;margin-bottom:12px}
        .pill{display:inline-block;border:1px solid #dbe3ee;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:700;margin:0 8px 8px 0}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}
        th,td{border-bottom:1px solid #e2e8f0;padding:8px 6px;text-align:left;vertical-align:top}
        th{background:#eff6ff;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
        .sub{color:#64748b;font-size:11px;display:block;margin-top:2px}
        @media print {.no-print{display:none} body{background:#fff;padding:0}.sheet{border:none;border-radius:0;padding:0}}
      </style>
    </head>
    <body>
      <div class="sheet">
        <h1>${customer.fullName || "Customer Profile"}</h1>
        <div class="meta">${customerLine}</div>
        <div>
          <span class="pill">Invoices: ${invoices.length}</span>
          <span class="pill">Repairs: ${repairs.length}</span>
          <span class="pill">Payments: ${payments.length}</span>
          <span class="pill">Recent Activity: ${recentActivity.length}</span>
        </div>
        <table>
          <thead>
            <tr><th>Type</th><th>Reference</th><th>Date</th><th>Contact</th><th>Payment</th><th>Paid</th><th>Total</th><th>Remaining</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${row.kind}</td>
                <td>${row.invoiceNumber || row.repairNumber || row.relatedNumber || row.id || "—"}</td>
                <td>${dateLabel(row.createdAt)}</td>
                <td>${row.customerPhone || row.phoneNumber || customer.phoneNumber || "—"}<span class="sub">${row.customerWhatsapp || row.whatsapp || customer.whatsapp || "—"}${row.senderNumber ? ` • ${row.senderNumber}` : ""}</span></td>
                <td>${row.paymentType || "Mobile Money"}<span class="sub">${row.paymentProvider || row.cashCurrency || "Evc Plus"}</span></td>
                <td>${row.kind === "Payment" ? moneyCell(row.paidNow ?? row.amount ?? row.paidAmount) : moneyCell(row.paidAmount ?? row.paidNow)}</td>
                <td>${row.kind === "Payment" ? moneyCell(row.totalAmount ?? row.totalPaid ?? row.amount ?? row.paidNow ?? row.paidAmount) : moneyCell(row.finalTotal ?? row.total ?? row.amount ?? row.price)}</td>
                <td>${row.kind === "Payment" ? moneyCell(row.totalRemaining ?? row.remaining) : moneyCell(row.balance ?? row.remaining ?? 0)}</td>
                <td>${row.paymentStatus || row.status || row.relatedType || "—"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
      <script>window.onload=()=>{window.focus();window.print();window.onafterprint=()=>window.close();};</script>
    </body>
    </html>
  `);
  win.document.close();
}

async function exportCustomerProfilePdf() {
  const profile = state.currentProfile;
  if (!profile) {
    showToast("Open a customer profile first.", "warning", "Customers");
    return;
  }
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    showToast("PDF library not available.", "warning", "Customers");
    return;
  }

  const { customer, invoices, repairs, payments } = profile;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("Customer Profile Report", 14, 13);
  doc.setFontSize(9);
  doc.text(customer.fullName || "Customer", 14, 18);
  doc.setTextColor(17, 24, 39);

  const summary = [
    ["Phone", customer.phoneNumber || "—"],
    ["WhatsApp", customer.whatsapp || "—"],
    ["Created", dateLabel(customer.createdAt || customer.joinedAt || customer.addedAt) || "—"],
    ["Invoices", String(invoices.length)],
    ["Repairs", String(repairs.length)],
    ["Payments", String(payments.length)],
  ];
  let y = 30;
  summary.forEach(([label, value], index) => {
    const x = 14 + (index % 3) * 90;
    const rowY = y + Math.floor(index / 3) * 12;
    doc.setFont(undefined, "bold");
    doc.text(`${label}:`, x, rowY);
    doc.setFont(undefined, "normal");
    doc.text(String(value ?? "—"), x + 24, rowY);
  });

  const addSection = (title, rows, columns) => {
    doc.setFont(undefined, "bold");
    doc.text(title, 14, y + 28);
    if (doc.autoTable) {
      doc.autoTable({
        startY: y + 32,
        head: [columns],
        body: rows,
        styles: { fontSize: 8, cellPadding: 2, valign: "top" },
        headStyles: { fillColor: [37, 99, 235] },
        margin: { left: 14, right: 14 },
      });
      y = doc.lastAutoTable.finalY + 10;
    } else {
      y += 36;
    }
  };

  const invoiceBody = invoices.map((inv) => [
    inv.invoiceNumber || inv.id || "—",
    dateLabel(inv.createdAt),
    inv.customerPhone || customer.phoneNumber || "—",
    inv.paymentType || "Mobile Money",
    inv.paymentProvider || inv.cashCurrency || "Evc Plus",
    money(inv.finalTotal ?? inv.total ?? inv.amount),
    money(inv.paidAmount),
    money(inv.balance),
    inv.paymentStatus || "—",
  ]);
  const repairBody = repairs.map((rep) => [
    rep.repairNumber || rep.id || "—",
    dateLabel(rep.createdAt),
    rep.customerPhone || customer.phoneNumber || "—",
    rep.paymentType || "Mobile Money",
    rep.paymentProvider || rep.cashCurrency || "Evc Plus",
    rep.deviceName || rep.device || "—",
    rep.problem || "—",
    money(rep.finalTotal ?? rep.price ?? rep.cost),
    money(rep.paidAmount),
    money(rep.balance),
    rep.status || "—",
  ]);
  const paymentBody = payments.map((pay) => [
    pay.relatedNumber || pay.id || "—",
    dateLabel(pay.createdAt),
    pay.customerPhone || customer.phoneNumber || "—",
    pay.paymentType || "Mobile Money",
    pay.paymentProvider || pay.cashCurrency || "Evc Plus",
    money(pay.paidNow ?? pay.amount ?? pay.paidAmount),
    money(pay.totalAmount ?? pay.totalPaid ?? pay.paidAmount),
    money(pay.totalRemaining ?? pay.remaining),
    pay.relatedType || "Payment",
  ]);

  addSection("Invoices", invoiceBody, ["Invoice #", "Date", "Phone", "Type", "Provider", "Total", "Paid", "Remaining", "Status"]);
  addSection("Repairs", repairBody, ["Repair #", "Date", "Phone", "Type", "Provider", "Device", "Problem", "Cost", "Paid", "Remaining", "Status"]);
  addSection("Payments", paymentBody, ["Ref", "Date", "Phone", "Type", "Provider", "Paid", "Total", "Remaining", "Status"]);

  doc.save(`${profileSafeId(customer.fullName || "customer")}-profile.pdf`);
}
async function deleteCustomerById
(id) {
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

  el("customerProfileBody")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-profile-action]");
    if (!btn) return;
    const section = btn.dataset.section;
    if (btn.dataset.profileAction === "toggle-section" && section) {
      state.profileCollapsed = state.profileCollapsed || {};
      state.profileCollapsed[section] = !state.profileCollapsed[section];
      const profile = state.currentProfile?.customer;
      if (profile) renderProfile(profile);
      return;
    }
    if ((btn.dataset.profileAction === "scroll-left" || btn.dataset.profileAction === "scroll-right") && section) {
      const target = el("customerProfileBody")?.querySelector(`[data-profile-scroll-target="${section}"]`);
      const scroller = target?.querySelector(".table-responsive");
      if (!scroller) return;
      const delta = btn.dataset.profileAction === "scroll-left" ? -320 : 320;
      scroller.scrollBy({ left: delta, behavior: "smooth" });
      return;
    }
    if (btn.dataset.profileAction === "print-profile") return printCustomerProfile();
    if (btn.dataset.profileAction === "export-profile-pdf") return exportCustomerProfilePdf();
  });

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
