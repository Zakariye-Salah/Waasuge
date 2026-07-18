// js/report.js
import {
  getProducts,
  getInvoices,
  getRepairs,
  getCustomers,
  getExpenses,
  filterActive,
  toArray,
  safeNumber,
  normalizeText,
  normalizeStatus,
  sortByDate,
  filterByDateRange,
  createDateBucket,
  filterRecordsByBucket,
  buildProductSummary,
  buildInvoiceSummary,
  buildRepairSummary,
  buildExpenseSummary,
  buildExpenseTotal
} from "./database.js";
import { debounce, formatCurrency, formatDate, showToast, safeNumber as safeNumMain, setHeaderBadgeCount, renderNotificationMenu, setPageLoading } from "./main.js";
import { DEFAULT_SETTINGS, getGeneralSettings, getStockSettings } from "./settings-config.js";

function showReportSkeleton() {
  document.querySelectorAll('.summary-value').forEach((el) => {
    el.innerHTML = '<span class="skeleton-line d-inline-block" style="width:72px;height:18px;"></span>';
  });
  document.querySelectorAll('.chart-placeholder, .report-card, .report-stat-card').forEach((el) => {
    if (!el.querySelector('.skeleton-box')) {
      const skeleton = document.createElement('div');
      skeleton.className = 'skeleton-box mt-2';
      skeleton.style.minHeight = '120px';
      el.prepend(skeleton);
    }
  });
}

function reportLoadingTargets() {
  return [".page-wrap", ".report-card", ".report-stat-card", ".card-shell", ".table-responsive", ".chart-placeholder"];
}

function updateReportNotificationBadge({ products = [], invoices = [], repairs = [] } = {}) {
  const activeProducts = filterActive(products);
  const activeInvoices = filterActive(invoices);
  const activeRepairs = filterActive(repairs);

  const lowStockItems = activeProducts
    .filter((item) => safeNumber(item?.quantity) <= getLowStockThreshold())
    .sort((a, b) => safeNumber(a?.quantity) - safeNumber(b?.quantity))
    .slice(0, 3);

  const unpaidItems = activeInvoices
    .filter((invoice) => {
      const status = normalizeStatus(invoice?.paymentStatus);
      return status === "unpaid" || status === "partial";
    })
    .slice(0, 3);

  const openItems = activeRepairs
    .filter((repair) => {
      const status = normalizeStatus(repair?.status);
      return status === "pending" || status === "processing" || status === "waiting for parts" || status === "in repair";
    })
    .slice(0, 3);

  const lowStock = activeProducts.filter((item) => safeNumber(item?.quantity) <= getLowStockThreshold()).length;
  const unpaidInvoices = activeInvoices.filter((invoice) => {
    const status = normalizeStatus(invoice?.paymentStatus);
    return status === "unpaid" || status === "partial";
  }).length;
  const openRepairs = activeRepairs.filter((repair) => {
    const status = normalizeStatus(repair?.status);
    return status === "pending" || status === "processing" || status === "waiting for parts" || status === "in repair";
  }).length;

  const items = [
    ...lowStockItems.map((item) => ({
      icon: "bi-box-seam",
      iconClass: "text-primary",
      title: `${item?.name || "Product"} is low stock`,
      text: `Only ${safeNumber(item?.quantity, 0)} left in inventory.`,
      href: "#report-products-section",
      timestamp: item?.createdAt ?? item?.updatedAt ?? Date.now()
    })),
    ...unpaidItems.map((invoice) => ({
      icon: "bi-receipt",
      iconClass: "text-warning",
      title: `Invoice ${invoice?.invoiceNumber || invoice?.id || "—"} unpaid`,
      text: `${invoice?.customerName || "Customer"} • ${formatCurrency(safeNumMain(invoice?.finalTotal ?? invoice?.total ?? 0))}`,
      href: "#report-invoices-section",
      timestamp: invoice?.createdAt ?? invoice?.updatedAt ?? Date.now()
    })),
    ...openItems.map((repair) => ({
      icon: "bi-tools",
      iconClass: "text-success",
      title: `${repair?.customerName || "Repair"} • ${repair?.deviceName || "Device"}`,
      text: `Status: ${repair?.status || "Pending"} • ${formatCurrency(safeNumMain(repair?.finalTotal ?? repair?.price ?? 0))}`,
      href: "#report-repairs-section",
      timestamp: repair?.createdAt ?? repair?.repairDate ?? Date.now()
    }))
  ];

  const count = lowStock + unpaidInvoices + openRepairs;
  renderNotificationMenu(items, { count, title: "Notifications", emptyText: "No report notifications right now." });
  setHeaderBadgeCount(count, 'button[aria-label="Notifications"] .badge');
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
const escapeHtmlPlain = escapeHtml;
window.escapeHtml = escapeHtmlPlain;
globalThis.escapeHtml = escapeHtmlPlain;
function getLowStockThreshold() {
  const value = Number(getStockSettings()?.lowStockLevel ?? 5);
  return Number.isFinite(value) ? value : 5;
}

const REPORT_STATE = {
  products: [],
  invoices: [],
  repairs: [],
  customers: [],
  expenses: [],
  charts: {},
  filters: {
    period: "Today",
    metric: "Revenue",
    category: "All",
    search: ""
  }
};

function titleCase(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\S/g, (s) => s.toUpperCase());
}

function getRecordTime(record) {
  return safeNumber(
    record?.createdAt ??
    record?.date ??
    record?.updatedAt ??
    record?.repairDate ??
    record?.invoiceDate ??
    0
  );
}

function getActiveRecords(records) {
  return filterActive(records).filter((item) => getRecordTime(item) > 0 || Object.keys(item || {}).length > 0);
}

function weekBucket() {
  const now = new Date();
  const day = now.getDay(); // Sun=0 ... Sat=6
  const daysSinceSaturday = (day + 1) % 7;
  const start = new Date(now);
  start.setDate(now.getDate() - daysSinceSaturday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { startDate: start, endDate: end };
}

function monthBucket() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { startDate: start, endDate: end };
}

function yearBucket() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear(), 11, 31);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { startDate: start, endDate: end };
}

function todayBucket() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { startDate: start, endDate: end };
}

function allTimeBucket() {
  return { startDate: null, endDate: null };
}

function periodBucket(period) {
  const key = normalizeText(period);
  if (key === "weekly") return weekBucket();
  if (key === "monthly") return monthBucket();
  if (key === "yearly") return yearBucket();
  if (key === "all time") return allTimeBucket();
  return todayBucket();
}

function toBucketRange(bucket) {
  if (!bucket.startDate && !bucket.endDate) {
    return createDateBucket(null, null);
  }
  const startDate = bucket.startDate ? new Date(bucket.startDate) : null;
  const endDate = bucket.endDate ? new Date(bucket.endDate) : null;
  return createDateBucket(
    startDate ? startDate.toISOString() : null,
    endDate ? endDate.toISOString() : null
  );
}

function getDateLabel(date, period) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const key = normalizeText(period);
  if (key === "today") {
    return `${String(d.getHours()).padStart(2, "0")}:00`;
  }
  if (key === "yearly") {
    return d.toLocaleDateString(undefined, { month: "short" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildSeries(records, period, valueGetter) {
  const filtered = getActiveRecords(records).filter((item) => getRecordTime(item) > 0);
  const now = new Date();
  const key = normalizeText(period);

  const series = new Map();
  const add = (label, value) => {
    series.set(label, (series.get(label) || 0) + safeNumber(value));
  };

  if (key === "today") {
    for (let h = 0; h < 24; h += 1) series.set(`${String(h).padStart(2, "0")}:00`, 0);
    filtered.forEach((item) => {
      const d = new Date(getRecordTime(item));
      if (d.toDateString() !== now.toDateString()) return;
      add(`${String(d.getHours()).padStart(2, "0")}:00`, valueGetter(item));
    });
    return series;
  }

  if (key === "yearly") {
    for (let m = 0; m < 12; m += 1) {
      const label = new Date(now.getFullYear(), m, 1).toLocaleDateString(undefined, { month: "short" });
      series.set(label, 0);
    }
    filtered.forEach((item) => {
      const d = new Date(getRecordTime(item));
      if (d.getFullYear() !== now.getFullYear()) return;
      const label = d.toLocaleDateString(undefined, { month: "short" });
      add(label, valueGetter(item));
    });
    return series;
  }

  let start;
  let end;
  if (key === "weekly") {
    const bucket = weekBucket();
    start = new Date(bucket.startDate);
    end = new Date(bucket.endDate);
  } else if (key === "monthly") {
    const bucket = monthBucket();
    start = new Date(bucket.startDate);
    end = new Date(bucket.endDate);
  } else {
    // all time: last 8 weeks or 12 months depending on range size
    const times = filtered.map((item) => getRecordTime(item)).filter(Boolean).sort((a, b) => a - b);
    if (!times.length) return series;
    const first = new Date(times[0]);
    const last = new Date(times[times.length - 1]);
    const monthSpan = (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth());
    if (monthSpan > 5) {
      start = new Date(last.getFullYear(), last.getMonth() - 11, 1);
      end = new Date(last.getFullYear(), last.getMonth() + 1, 0);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else {
      start = new Date(last);
      start.setDate(last.getDate() - 55);
      start.setHours(0, 0, 0, 0);
      end = new Date(last);
      end.setHours(23, 59, 59, 999);
    }
  }

  const bucketKey = key === "all time" && (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) > 5
    ? "month"
    : "day";

  const cursor = new Date(start);
  if (bucketKey === "month") {
    while (cursor <= end) {
      const label = cursor.toLocaleDateString(undefined, { month: "short" });
      series.set(label, 0);
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    while (cursor <= end) {
      const label = cursor.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      series.set(label, 0);
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  filtered.forEach((item) => {
    const time = getRecordTime(item);
    if (time < start.getTime() || time > end.getTime()) return;
    const d = new Date(time);
    const label = bucketKey === "month"
      ? d.toLocaleDateString(undefined, { month: "short" })
      : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    add(label, valueGetter(item));
  });

  return series;
}

function getProductStock(product) {
  const candidates = [
    product?.quantity,
    product?.stock,
    product?.available,
    product?.count,
    product?.qty
  ];
  const found = candidates.find((value) => Number.isFinite(Number(value)));
  return safeNumber(found);
}

function buildStockMovement(products, period) {
  const bucket = periodBucket(period);
  const range = toBucketRange(bucket);
  const scoped = filterRecordsByBucket(getActiveRecords(products), "createdAt", range)
    .concat(filterRecordsByBucket(getActiveRecords(products), "updatedAt", range));
  const unique = Array.from(new Map(scoped.map((item) => [item.id || JSON.stringify(item), item])).values());

  return unique.reduce((sum, product) => {
    const stockIn = safeNumber(product?.stockIn ?? product?.received ?? product?.added ?? product?.quantityAdded);
    const stockOut = safeNumber(product?.stockOut ?? product?.sold ?? product?.removed ?? product?.quantitySold);
    const adjustment = safeNumber(product?.adjustment ?? product?.movement ?? 0);
    if (stockIn || stockOut || adjustment) return sum + Math.abs(stockIn) + Math.abs(stockOut) + Math.abs(adjustment);
    return sum + Math.abs(getProductStock(product));
  }, 0);
}

function getCurrentProducts(products) {
  return sortByDate(getActiveRecords(products), "createdAt", true);
}

function buildInvoiceStatusSummary(invoices, period) {
  const bucket = toBucketRange(periodBucket(period));
  const scoped = filterRecordsByBucket(getActiveRecords(invoices), "createdAt", bucket);
  const list = scoped.length ? scoped : getActiveRecords(invoices);
  const byStatus = list.reduce((acc, invoice) => {
    const status = normalizeStatus(invoice?.paymentStatus || invoice?.status || "unpaid");
    const amount = safeNumber(invoice?.finalTotal ?? invoice?.total ?? invoice?.amount ?? 0);
    if (!acc[status]) acc[status] = { count: 0, amount: 0 };
    acc[status].count += 1;
    acc[status].amount += amount;
    return acc;
  }, {});
  return byStatus;
}

function buildSoldProductRows(invoices, period) {
  const bucket = toBucketRange(periodBucket(period));
  const list = filterRecordsByBucket(getActiveRecords(invoices), "createdAt", bucket);
  const rows = new Map();

  list.forEach((invoice) => {
    const items = toArray(invoice?.items || []);
    const invoiceDiscount = safeNumber(invoice?.discount ?? 0);
    const subtotal = items.reduce((sum, item) => sum + safeNumber(item?.qty, 1) * safeNumber(item?.price ?? item?.unitPrice ?? item?.salePrice, 0), 0) || 0;

    items.forEach((item) => {
      const qty = safeNumber(item?.qty, 1);
      const price = safeNumber(item?.price ?? item?.unitPrice ?? item?.salePrice, 0);
      const lineTotal = qty * price;
      const discountShare = subtotal > 0 ? invoiceDiscount * (lineTotal / subtotal) : 0;
      const total = Math.max(0, lineTotal - discountShare);
      const productId = String(item?.productId || item?.productKey || item?.id || item?.name || "-").trim();
      const key = productId || `${item?.name || item?.productName || "item"}-${rows.size}`;
      const current = rows.get(key) || {
        productId,
        name: String(item?.name || item?.productName || item?.title || "Item").trim(),
        qty: 0,
        discount: 0,
        total: 0,
      };
      current.qty += qty;
      current.discount += discountShare;
      current.total += total;
      rows.set(key, current);
    });
  });

  return Array.from(rows.values()).sort((a, b) => b.total - a.total);
}

function buildRepairStatusSummary(repairs, period) {
  const bucket = toBucketRange(periodBucket(period));
  const scoped = filterRecordsByBucket(getActiveRecords(repairs), "createdAt", bucket);
  const list = scoped.length ? scoped : getActiveRecords(repairs);
  const byStatus = list.reduce((acc, repair) => {
    const status = normalizeStatus(repair?.status || "pending");
    const amount = safeNumber(repair?.finalTotal ?? repair?.total ?? repair?.price ?? repair?.amount ?? 0);
    if (!acc[status]) acc[status] = { count: 0, amount: 0 };
    acc[status].count += 1;
    acc[status].amount += amount;
    return acc;
  }, {});
  return byStatus;
}


function buildPerformanceProgress(value, total) {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((safeNumber(value) / total) * 100)));
}


function getPerformanceTone(percent) {
  const value = Math.max(0, Math.min(100, Math.round(safeNumber(percent))));
  if (value <= 10) return { fill: "progress-tone-red", text: "tone-red-text" };
  if (value <= 25) return { fill: "progress-tone-orange", text: "tone-orange-text" };
  if (value <= 40) return { fill: "progress-tone-amber", text: "tone-amber-text" };
  if (value <= 60) return { fill: "progress-tone-blue", text: "tone-blue-text" };
  if (value <= 80) return { fill: "progress-tone-purple", text: "tone-purple-text" };
  if (value <= 99) return { fill: "progress-tone-lightgreen", text: "tone-lightgreen-text" };
  return { fill: "progress-tone-green", text: "tone-green-text" };
}

function buildInvoicePerformanceRows(snapshot = getReportSnapshot()) {
  const summary = buildInvoiceStatusSummary(snapshot.invoices, snapshot.period);
  const totalCount = Object.values(summary).reduce((sum, row) => sum + safeNumber(row?.count), 0) || 1;
  const totalAmount = Object.values(summary).reduce((sum, row) => sum + safeNumber(row?.amount), 0) || 1;
  const rows = [
    { key: "paid", label: "Paid", badge: "bg-soft-success text-success-soft" },
    { key: "partial", label: "Partial", badge: "bg-soft-warning text-warning-soft" },
    { key: "unpaid", label: "Unpaid", badge: "bg-soft-danger text-danger-soft" }
  ];
  return {
    headers: ["Status", "Count", "Amount", "Progress"],
    rows: rows.map((row) => {
      const count = safeNumber(summary[row.key]?.count);
      const amount = safeNumber(summary[row.key]?.amount);
      const progress = buildPerformanceProgress(count, totalCount);
      return [
        row.label,
        formatCount(count),
        formatCurrency(amount),
        `${progress}%`
      ];
    }),
    meta: rows.map((row) => ({
      key: row.key,
      label: row.label,
      badge: row.badge,
      count: safeNumber(summary[row.key]?.count),
      amount: safeNumber(summary[row.key]?.amount),
      progress: buildPerformanceProgress(summary[row.key]?.amount, totalAmount)
    }))
  };
}

function buildRepairPerformanceRows(snapshot = getReportSnapshot()) {
  const summary = buildRepairStatusSummary(snapshot.repairs, snapshot.period);
  const rows = [
    { key: "device received", label: "Device Received", badge: "bg-soft-warning text-warning-soft" },
    { key: "inspection started", label: "Inspection Started", badge: "bg-soft-info text-info-soft" },
    { key: "diagnosis completed", label: "Diagnosis Completed", badge: "bg-soft-primary text-primary-soft" },
    { key: "waiting for approval", label: "Waiting for Approval", badge: "bg-soft-purple text-purple-soft" },
    { key: "waiting for parts", label: "Waiting for Parts", badge: "bg-soft-purple text-purple-soft" },
    { key: "repair in progress", label: "Repair in Progress", badge: "bg-soft-primary text-primary-soft" },
    { key: "quality testing", label: "Quality Testing", badge: "bg-soft-success text-success-soft" },
    { key: "ready for pickup", label: "Ready for Pickup", badge: "bg-soft-info text-info-soft" },
    { key: "delivered", label: "Delivered", badge: "bg-soft-danger text-danger-soft" }
  ];
  const totalCount = rows.reduce((sum, row) => sum + safeNumber(summary[row.key]?.count), 0) || 1;
  return {
    headers: ["Status", "Count", "Amount", "Progress"],
    rows: rows.map((row) => {
      const count = safeNumber(summary[row.key]?.count);
      const amount = safeNumber(summary[row.key]?.amount);
      const progress = buildPerformanceProgress(count, totalCount);
      return [
        row.label,
        formatCount(count),
        formatCurrency(amount),
        `${progress}%`
      ];
    }),
    meta: rows.map((row) => ({
      key: row.key,
      label: row.label,
      badge: row.badge,
      count: safeNumber(summary[row.key]?.count),
      amount: safeNumber(summary[row.key]?.amount),
      progress: buildPerformanceProgress(summary[row.key]?.count, totalCount)
    }))
  };
}

function formatCount(value) {
  return new Intl.NumberFormat(undefined).format(safeNumMain(value));
}

function findSectionCard(titleText) {
  const headings = Array.from(document.querySelectorAll(".card-shell h5, .card-shell h4, .card-shell h3"));
  const aliases = {
    "Best Customers": ["Top 5 Customers", "Top Customers"],
    "Top 5 Customers": ["Best Customers", "Top Customers"],
  };
  const targets = [titleText, ...(aliases[titleText] || [])].map((item) => normalizeText(item));
  const heading = headings.find((el) => targets.includes(normalizeText(el.textContent)));
  return heading ? heading.closest(".card-shell") : null;
}

function setSummaryCard(label, value, trendHtml) {
  const cards = Array.from(document.querySelectorAll(".summary-card"));
  const card = cards.find((el) => {
    const labelEl = el.querySelector(".summary-label");
    return normalizeText(labelEl?.textContent) === normalizeText(label);
  });
  if (!card) return;
  const valueEl = card.querySelector(".summary-value");
  const trendEl = card.querySelector(".summary-trend");
  if (valueEl) valueEl.textContent = value;
  if (trendEl && trendHtml) trendEl.innerHTML = trendHtml;
}

function ensureCanvas(placeholder, id) {
  if (!placeholder) return null;
  placeholder.innerHTML = `<canvas id="${id}" style="width:100%;height:320px;"></canvas>`;
  return placeholder.querySelector("canvas");
}

function destroyChart(chartKey) {
  const existing = REPORT_STATE.charts[chartKey];
  if (existing && typeof existing.destroy === "function") existing.destroy();
  REPORT_STATE.charts[chartKey] = null;
}

function renderFinancialChart(period, invoices, expenses) {
  const placeholder = document.querySelectorAll(".chart-placeholder")[0];
  if (!placeholder || typeof window.Chart === "undefined") return;
  const canvas = ensureCanvas(placeholder, "financialChart");
  if (!canvas) return;
  destroyChart("financial");

  const invoiceSeries = buildSeries(invoices, period, (item) => safeNumber(item?.finalTotal ?? item?.total ?? item?.amount));
  const expenseSeries = buildSeries(expenses, period, (item) => safeNumber(item?.amount));

  const labels = Array.from(new Set([...invoiceSeries.keys(), ...expenseSeries.keys()]));
  const revenue = labels.map((label) => safeNumber(invoiceSeries.get(label)));
  const expense = labels.map((label) => safeNumber(expenseSeries.get(label)));
  const profit = labels.map((_, index) => revenue[index] - expense[index]);

  REPORT_STATE.charts.financial = new window.Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Revenue", data: revenue, tension: 0.35 },
        { label: "Expense", data: expense, tension: 0.35 },
        { label: "Profit", data: profit, tension: 0.35 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderInvoiceChart(period, invoices) {
  const placeholder = document.querySelectorAll(".chart-placeholder")[1];
  if (!placeholder || typeof window.Chart === "undefined") return;
  const canvas = ensureCanvas(placeholder, "paymentChart");
  if (!canvas) return;
  destroyChart("invoice");

  const statuses = buildInvoiceStatusSummary(invoices, period);
  const order = ["paid", "partial", "unpaid"];
  const labels = order.map((key) => titleCase(key));
  const counts = order.map((key) => statuses[key]?.count || 0);

  REPORT_STATE.charts.invoice = new window.Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: counts }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom" } }
    }
  });
}

function renderRepairChart(period, repairs) {
  const placeholder = document.querySelectorAll(".chart-placeholder")[2];
  if (!placeholder || typeof window.Chart === "undefined") return;
  const canvas = ensureCanvas(placeholder, "repairChart");
  if (!canvas) return;
  destroyChart("repair");

  const statuses = buildRepairStatusSummary(repairs, period);
  const order = ["pending", "processing", "in repair", "waiting for parts", "completed", "delivered"];
  const labels = order.map(titleCase);
  const counts = order.map((key) => statuses[key]?.count || 0);

  REPORT_STATE.charts.repair = new window.Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Repairs", data: counts }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderProductChart(products) {
  const placeholder = document.querySelectorAll(".chart-placeholder")[3];
  if (!placeholder || typeof window.Chart === "undefined") return;
  const canvas = ensureCanvas(placeholder, "productChart");
  if (!canvas) return;
  destroyChart("product");

  const topProducts = getCurrentProducts(products)
    .map((item) => ({
      label: item?.name || item?.productName || item?.title || item?.id || "Product",
      value: getProductStock(item)
    }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const labels = topProducts.length ? topProducts.map((item) => item.label) : ["No data"];
  const values = topProducts.length ? topProducts.map((item) => item.value) : [0];

  REPORT_STATE.charts.product = new window.Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{ label: "Stock", data: values }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true } }
    }
  });
}


function renderImportantProductSummary(products) {
  const tbody = document.getElementById("importantProductSummaryBody");
  if (!tbody) return;
  const rows = getCurrentProducts(products)
    .filter((item) => Boolean(item?.important || item?.isImportant || item?.importantThreshold || item?.alertThreshold))
    .map((item) => ({
      item,
      stock: getProductStock(item),
      threshold: safeNumber(item?.importantThreshold ?? item?.alertThreshold ?? 10)
    }))
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 8);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">No important products yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(({ item, stock, threshold }) => {
    const name = item?.name || item?.productName || item?.title || item?.id || "Product";
    const badge = stock <= 0
      ? '<span class="badge bg-soft-danger text-danger-soft report-badge">Critical</span>'
      : stock <= threshold
        ? '<span class="badge bg-soft-warning text-warning-soft report-badge">Alert</span>'
        : '<span class="badge bg-soft-success text-success-soft report-badge">Safe</span>';
    return `
      <tr>
        <td class="fw-semibold">${name}</td>
        <td>${threshold}</td>
        <td>${stock}</td>
        <td>${badge}</td>
      </tr>
    `;
  }).join("");
}

function renderLowStockTable(products) {
  const card = findSectionCard("Low Stock Summary");
  if (!card) return;
  const tbody = card.querySelector("tbody");
  if (!tbody) return;

  const list = getCurrentProducts(products)
    .map((item) => ({
      item,
      stock: getProductStock(item),
      threshold: safeNumber(item?.importantThreshold ?? item?.alertThreshold ?? 10)
    }))
    .filter((row) => row.stock <= row.threshold)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 5);

  if (!list.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="text-center text-muted py-4">No low stock items right now.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(({ item, stock, threshold }) => {
    const name = item?.name || item?.productName || item?.title || item?.id || "Product";
    const category = item?.category || item?.type || item?.group || "—";
    const isZero = stock <= 0;
    const badge = isZero
      ? '<span class="badge bg-soft-danger text-danger-soft report-badge">Out of stock</span>'
      : '<span class="badge bg-soft-warning text-warning-soft report-badge">Low</span>';
    return `
      <tr>
        <td class="fw-semibold">${name}</td>
        <td>${category}</td>
        <td>${stock}</td>
        <td>${badge}</td>
      </tr>
    `;
  }).join("");
}

function renderInvoicePerformanceTable(invoices, period) {
  const card = findSectionCard("Invoice Performance");
  if (!card) return;
  const tbody = card.querySelector("tbody");
  if (!tbody) return;

  const summary = buildInvoiceStatusSummary(invoices, period);
  const rows = [
    { key: "paid", label: "Paid", badge: "bg-soft-success text-success-soft", trend: "Leading" },
    { key: "partial", label: "Partial", badge: "bg-soft-warning text-warning-soft", trend: "Mixed" },
    { key: "unpaid", label: "Unpaid", badge: "bg-soft-danger text-danger-soft", trend: "Needs attention" }
  ];
  const maxAmount = Math.max(...rows.map((row) => summary[row.key]?.amount || 0), 1);
  const totalAmount = rows.reduce((sum, row) => sum + safeNumber(summary[row.key]?.amount), 0) || 1;

  tbody.innerHTML = rows.map((row) => {
    const count = summary[row.key]?.count || 0;
    const amount = summary[row.key]?.amount || 0;
    const percent = Math.max(8, Math.min(100, Math.round((amount / maxAmount) * 100)));
    const share = Math.max(0, Math.min(100, Math.round((amount / totalAmount) * 100)));
    const tone = getPerformanceTone(percent);
    return `
      <tr>
        <td><span class="badge ${row.badge} report-badge">${row.label}</span></td>
        <td class="fw-semibold">${count}</td>
        <td class="fw-semibold">${formatCurrency(amount)}</td>
        <td>
          <div class="d-flex flex-column gap-1">
            <span class="fw-semibold ${tone.text}"><i class="bi bi-arrow-up-right"></i> ${row.trend}</span>
            <div class="progress-soft">
              <div class="progress-bar ${tone.fill}" style="width: ${percent}%;"></div>
            </div>
            <div class="small fw-semibold ${tone.text}">${share}% of total</div>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderRepairPerformanceTable(repairs, period) {
  const card = findSectionCard("Repair Performance");
  if (!card) return;
  const tbody = card.querySelector("tbody");
  if (!tbody) return;

  const summary = buildRepairStatusSummary(repairs, period);
  const rows = [
    { key: "device received", label: "Device Received", badge: "bg-soft-warning text-warning-soft" },
    { key: "inspection started", label: "Inspection Started", badge: "bg-soft-info text-info-soft" },
    { key: "diagnosis completed", label: "Diagnosis Completed", badge: "bg-soft-primary text-primary-soft" },
    { key: "waiting for approval", label: "Waiting for Approval", badge: "bg-soft-purple text-purple-soft" },
    { key: "waiting for parts", label: "Waiting for Parts", badge: "bg-soft-purple text-purple-soft" },
    { key: "repair in progress", label: "Repair in Progress", badge: "bg-soft-primary text-primary-soft" },
    { key: "quality testing", label: "Quality Testing", badge: "bg-soft-success text-success-soft" },
    { key: "ready for pickup", label: "Ready for Pickup", badge: "bg-soft-info text-info-soft" },
    { key: "delivered", label: "Delivered", badge: "bg-soft-danger text-danger-soft" }
  ];
  const totalCount = rows.reduce((sum, row) => sum + safeNumber(summary[row.key]?.count), 0) || 1;
  const totalAmount = rows.reduce((sum, row) => sum + safeNumber(summary[row.key]?.amount), 0) || 1;

  tbody.innerHTML = rows.map((row) => {
    const count = summary[row.key]?.count || 0;
    const amount = summary[row.key]?.amount || 0;
    const width = Math.max(8, Math.round((count / totalCount) * 100));
    const share = Math.max(0, Math.min(100, Math.round((amount / totalAmount) * 100)));
    const tone = getPerformanceTone(width);
    return `
      <tr>
        <td><span class="badge ${row.badge} report-badge">${row.label}</span></td>
        <td class="fw-semibold">${count}</td>
        <td class="fw-semibold">${formatCurrency(amount)}</td>
        <td>
          <div class="d-flex flex-column gap-1">
            <div class="progress-soft">
              <div class="progress-bar ${tone.fill}" style="width: ${width}%;"></div>
            </div>
            <div class="small fw-semibold ${tone.text}">Progress ${width}% • ${share}% of amount</div>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderPeriodNotes(period) {
  const chips = Array.from(document.querySelectorAll(".mini-pill"));
  chips.forEach((chip) => {
    const text = normalizeText(chip.textContent);
    if (text === "today" || text === "weekly" || text === "monthly") {
      chip.classList.toggle("bg-soft-primary", normalizeText(period) === text);
      chip.classList.toggle("bg-soft-success", normalizeText(period) === text);
    }
  });
}

function renderSoldProducts(period, invoices) {
  const tbody = document.getElementById("soldProductsTbody");
  const amountPill = document.getElementById("soldProductsTotalAmount");
  if (!tbody) return;

  const rows = buildSoldProductRows(invoices, period);
  const totalAmount = rows.reduce((sum, row) => sum + safeNumber(row.total), 0);
  if (amountPill) amountPill.textContent = formatCurrency(totalAmount);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No sold products in this period.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td class="fw-semibold">${row.productId || '-'}</td>
      <td>${row.name || '-'}</td>
      <td class="fw-semibold">${formatCount(row.qty)}</td>
      <td>${formatCurrency(row.discount)}</td>
      <td class="fw-semibold">${formatCurrency(row.total)}</td>
    </tr>
  `).join('');
}

function renderBestCustomersTable(invoices, repairs, period) {
  const tbody = document.getElementById("bestCustomersBody") || findSectionCard("Top 5 Customers")?.querySelector("tbody") || findSectionCard("Best Customers")?.querySelector("tbody");
  if (!tbody) return;
  const rows = buildBestCustomerRows(invoices, repairs, 5, REPORT_STATE.customers || []);
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">No customer activity in this period.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((row, index) => `
    <tr>
      <td class="fw-semibold">${index + 1}</td>
      <td>${row[0]}</td>
      <td>${row[1]}</td>
      <td class="fw-semibold">${row[2]}</td>
      <td class="fw-semibold">${row[3]}</td>
      <td class="fw-semibold">${row[4]}</td>
      <td class="fw-semibold">${row[5]}</td>
      <td class="fw-semibold">${row[6]}</td>
      <td>${row[7]}</td>
    </tr>
  `).join("");
}

function renderLargestRemainingInvoicesTable(invoices, period) {
  const card = findSectionCard("Largest Remaining Invoices");
  if (!card) return;
  const tbody = card.querySelector("tbody");
  if (!tbody) return;
  const rows = buildLargestRemainingInvoiceRows(invoices);
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">No unpaid or partial invoices in this period.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td class="fw-semibold">${row[0]}</td>
      <td>${row[1]}</td>
      <td>${row[2]}</td>
      <td><span class="badge bg-soft-warning text-warning-soft report-badge">${row[3]}</span></td>
      <td class="fw-semibold">${row[4]}</td>
      <td>${row[5]}</td>
      <td class="fw-semibold">${row[6]}</td>
      <td>${row[7]}</td>
    </tr>
  `).join("");
}

function renderRepairHistoryTable(repairs, period) {
  const card = findSectionCard("Repair History");
  if (!card) return;
  const tbody = card.querySelector("tbody");
  if (!tbody) return;
  const rows = buildRepairHistoryRows(repairs);
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">No repair history in this period.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td class="fw-semibold">${row[0]}</td>
      <td>${row[1]}</td>
      <td>${row[2]}</td>
      <td><span class="badge bg-soft-primary text-primary-soft report-badge">${row[3]}</span></td>
      <td class="fw-semibold">${row[4]}</td>
      <td>${row[5]}</td>
      <td class="fw-semibold">${row[6]}</td>
      <td>${row[7]}</td>
    </tr>
  `).join("");
}

function renderReportChips(period, revenue, expense, profit) {
  const summary = [
    { label: "Revenue", value: formatCurrency(revenue) },
    { label: "Expense", value: formatCurrency(expense) },
    { label: "Profit", value: formatCurrency(profit) }
  ];
  const headerPills = Array.from(document.querySelectorAll(".filter-chip, .mini-pill"));
  if (!headerPills.length) return;
  const textMap = new Map(summary.map((item) => [normalizeText(item.label), item.value]));
  headerPills.forEach((pill) => {
    const text = normalizeText(pill.textContent);
    if (textMap.has(text)) pill.title = textMap.get(text);
  });
}

function filterSearchAcrossPage(query) {
  const value = normalizeText(query);
  const sections = [
    "Invoice Performance",
    "Repair Performance",
    "Best Customers",
    "Top 5 Customers",
    "Largest Remaining Invoices",
    "Repair History",
    "Low Stock Summary"
  ];
  sections.forEach((title) => {
    const card = findSectionCard(title);
    if (!card) return;
    const rows = Array.from(card.querySelectorAll("tbody tr"));
    rows.forEach((row) => {
      const text = normalizeText(row.textContent);
      row.style.display = !value || text.includes(value) ? "" : "none";
    });
  });
}

async function loadReportData() {
  const [products, invoices, repairs, customers, expenses] = await Promise.all([
    getProducts(),
    getInvoices(),
    getRepairs(),
    getCustomers().catch(() => null),
    getExpenses()
  ]);

  REPORT_STATE.products = toArray(products);
  REPORT_STATE.invoices = toArray(invoices);
  REPORT_STATE.repairs = toArray(repairs);
  REPORT_STATE.customers = filterActive(toArray(customers));
  REPORT_STATE.expenses = toArray(expenses);
  REPORT_STATE.bestCustomerRows = [];
}

function renderReport() {
  const period = REPORT_STATE.filters.period || "Today";
  const bucket = periodBucket(period);
  const bucketRange = toBucketRange(bucket);

  const invoices = filterRecordsByBucket(getActiveRecords(REPORT_STATE.invoices), "createdAt", bucketRange);
  const repairs = filterRecordsByBucket(getActiveRecords(REPORT_STATE.repairs), "createdAt", bucketRange);
  const expenses = filterRecordsByBucket(getActiveRecords(REPORT_STATE.expenses), "createdAt", bucketRange);
  const products = getActiveRecords(REPORT_STATE.products);

  const invoiceSummary = buildInvoiceSummary(invoices);
  const expenseSummary = buildExpenseSummary(expenses);
  const repairSummary = buildRepairSummary(repairs);
  const productSummary = buildProductSummary(products);
  const totalExpense = expenseSummary.totalAmount;
  const totalRevenue = invoiceSummary.revenue;
  const totalProfit = totalRevenue - totalExpense;
  const stockMovement = buildStockMovement(products, period);

  setSummaryCard("Revenue", formatCurrency(totalRevenue), `<i class="bi bi-cash-coin me-1"></i> ${titleCase(period)} income`);
  setSummaryCard("Total Customers", formatCount(filterActive(REPORT_STATE.customers).length), `<i class="bi bi-people-fill me-1"></i> Active customer records`);
  setSummaryCard("Expense", formatCurrency(totalExpense), `<i class="bi bi-receipt me-1"></i> ${titleCase(period)} spend`);
  setSummaryCard("Profit", formatCurrency(totalProfit), `<i class="bi bi-graph-up-arrow me-1"></i> Net gain`);
  setSummaryCard("Stock Movement", formatCount(stockMovement), `<i class="bi bi-arrow-left-right me-1"></i> In / out`);
  setSummaryCard("Paid", formatCount(invoiceSummary.paidInvoices), `<i class="bi bi-check-circle-fill me-1"></i> Successful payments`);
  setSummaryCard("Partial", formatCount(invoiceSummary.partialInvoices), `<i class="bi bi-cash-coin me-1"></i> Part payments`);
  setSummaryCard("Unpaid", formatCount(invoiceSummary.unpaidInvoices), `<i class="bi bi-exclamation-circle-fill me-1"></i> Pending balance`);
  setSummaryCard("Low Stock", formatCount(productSummary.lowStockProducts), `<i class="bi bi-exclamation-triangle-fill me-1"></i> Restock soon`);
  setSummaryCard("Total Products", formatCount(productSummary.totalProducts), `<i class="bi bi-box-seam me-1"></i> All active products`);
  setSummaryCard("Total Invoices", formatCount(invoiceSummary.totalInvoices), `<i class="bi bi-receipt-cutoff me-1"></i> ${titleCase(period)} invoices`);
  setSummaryCard("Total Repairs", formatCount(repairSummary.totalRepairs), `<i class="bi bi-tools me-1"></i> ${titleCase(period)} repairs`);
  setSummaryCard("Product Sale", formatCurrency(totalRevenue), `<i class="bi bi-cart-check me-1"></i> ${titleCase(period)} product sales`);

  renderFinancialChart(period, invoices, expenses);
  renderInvoiceChart(period, invoices);
  renderRepairChart(period, repairs);
  renderProductChart(products);
  renderSoldProducts(period, invoices);

  renderInvoicePerformanceTable(invoices, period);
  renderRepairPerformanceTable(repairs, period);
  REPORT_STATE.bestCustomerRows = buildBestCustomerRows(invoices, repairs, 5, REPORT_STATE.customers || []);
  renderBestCustomersTable(invoices, repairs, period);
  renderLargestRemainingInvoicesTable(invoices, period);
  renderRepairHistoryTable(repairs, period);
  renderLowStockTable(products);
  renderImportantProductSummary(products);
  updateReportNotificationBadge({ products: REPORT_STATE.products, invoices: REPORT_STATE.invoices, repairs: REPORT_STATE.repairs });

  const activeRange = bucketRange.startDate || bucketRange.endDate
    ? `${formatDate(bucketRange.startDate || new Date())} - ${formatDate(bucketRange.endDate || new Date())}`
    : "All records";

  const subtitle = document.querySelector(".page-subtitle, .text-muted.mb-0");
  if (subtitle) {
    subtitle.textContent = `${titleCase(period)} report · ${activeRange}`;
  }

  renderReportChips(period, totalRevenue, totalExpense, totalProfit);
}


function escapeCsvValue(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getReportSnapshot() {
  const period = REPORT_STATE.filters.period || "Today";
  const bucket = periodBucket(period);
  const bucketRange = toBucketRange(bucket);
  const invoices = filterRecordsByBucket(getActiveRecords(REPORT_STATE.invoices), "createdAt", bucketRange);
  const repairs = filterRecordsByBucket(getActiveRecords(REPORT_STATE.repairs), "createdAt", bucketRange);
  const expenses = filterRecordsByBucket(getActiveRecords(REPORT_STATE.expenses), "createdAt", bucketRange);
  const products = getActiveRecords(REPORT_STATE.products);
  const customers = Array.isArray(REPORT_STATE.customers) ? REPORT_STATE.customers : [];
  const soldRows = buildSoldProductRows(invoices, period);
  const customerHistoryRows = buildCustomerHistoryRows(invoices, repairs);
  const warrantyRows = buildWarrantyRows(repairs);
  const bestCustomerRows = buildBestCustomerRows(invoices, repairs, 5, customers);
  const largestRemainingRows = buildLargestRemainingInvoiceRows(invoices);
  const repairHistoryRows = buildRepairHistoryRows(repairs);
  return { period, bucketRange, invoices, repairs, expenses, products, customers, soldRows, customerHistoryRows, warrantyRows, bestCustomerRows, largestRemainingRows, repairHistoryRows };
}



function getCustomerHistoryKey(record) {
  const id = normalizeText(record?.customerId || record?.clientId || record?.id || "");
  const phone = normalizeText(record?.customerPhone || record?.phone || record?.customerPhoneNumber || record?.phoneNumber || "");
  const name = normalizeText(record?.customerName || record?.customer || record?.clientName || "");
  return id || phone || name;
}

function buildCustomerHistoryRows(invoices = [], repairs = []) {
  const rows = new Map();

  const upsert = (record, kind) => {
    const key = getCustomerHistoryKey(record);
    if (!key) return;
    const current = rows.get(key) || {
      customerName: "",
      phone: "—",
      invoiceCount: 0,
      repairCount: 0,
      totalAll: 0,
      totalPaid: 0,
      totalRemaining: 0,
      lastActivity: 0
    };

    const customerName = String(record?.customerName || record?.customer || record?.clientName || current.customerName || "Customer").trim() || "Customer";
    const phone = String(record?.customerPhone || record?.phone || record?.customerPhoneNumber || record?.phoneNumber || current.phone || "—").trim() || "—";
    const total = safeNumber(record?.finalTotal ?? record?.total ?? record?.amount ?? record?.price ?? 0);
    const paid = safeNumber(record?.paidAmount ?? record?.paid ?? 0);
    const remaining = Math.max(0, total - paid);
    const activity = safeNumber(record?.updatedAt ?? record?.createdAt ?? record?.repairDate ?? record?.invoiceDate ?? 0);

    current.customerName = customerName;
    current.phone = phone;
    current.totalAll += total;
    current.totalPaid += paid;
    current.totalRemaining += remaining;
    current.lastActivity = Math.max(current.lastActivity, activity);
    if (kind === "invoice") current.invoiceCount += 1;
    if (kind === "repair") current.repairCount += 1;
    rows.set(key, current);
  };

  invoices.forEach((invoice) => upsert(invoice, "invoice"));
  repairs.forEach((repair) => upsert(repair, "repair"));

  return [...rows.values()]
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .slice(0, 12)
    .map((item) => [
      item.customerName || "Customer",
      item.phone || "—",
      formatCount(item.invoiceCount),
      formatCount(item.repairCount),
      formatCurrency(item.totalAll),
      formatCurrency(item.totalPaid),
      formatCurrency(item.totalRemaining),
      formatDate(item.lastActivity || Date.now())
    ]);
}

function buildBestCustomerRows(invoices = [], repairs = [], limit = 8, customers = REPORT_STATE.customers || []) {
  const rows = new Map();

  const seedCustomer = (customer = {}) => {
    const key = getCustomerHistoryKey(customer);
    if (!key || rows.has(key)) return;
    rows.set(key, {
      customerName: String(customer?.fullName || customer?.customerName || customer?.name || "Customer").trim() || "Customer",
      phone: String(customer?.phoneNumber || customer?.customerPhone || customer?.phone || customer?.whatsapp || "—").trim() || "—",
      invoices: 0,
      repairs: 0,
      totalAll: 0,
      totalPaid: 0,
      totalRemaining: 0,
      lastActivity: safeNumber(customer?.updatedAt ?? customer?.createdAt ?? 0)
    });
  };

  const upsert = (record, kind) => {
    const key = getCustomerHistoryKey(record);
    if (!key) return;
    const current = rows.get(key) || {
      customerName: "Customer",
      phone: "—",
      invoices: 0,
      repairs: 0,
      totalAll: 0,
      totalPaid: 0,
      totalRemaining: 0,
      lastActivity: 0
    };
    current.customerName = String(record?.customerName || record?.customer || record?.clientName || current.customerName || "Customer").trim() || "Customer";
    current.phone = String(record?.customerPhone || record?.phone || record?.customerPhoneNumber || record?.phoneNumber || current.phone || "—").trim() || "—";
    const total = safeNumber(record?.finalTotal ?? record?.total ?? record?.amount ?? record?.price ?? 0);
    const paid = safeNumber(record?.paidAmount ?? record?.paid ?? 0);
    current.totalAll += total;
    current.totalPaid += paid;
    current.totalRemaining += Math.max(0, total - paid);
    current.lastActivity = Math.max(current.lastActivity, safeNumber(record?.updatedAt ?? record?.createdAt ?? record?.repairDate ?? record?.invoiceDate ?? 0));
    if (kind === "invoice") current.invoices += 1;
    if (kind === "repair") current.repairs += 1;
    rows.set(key, current);
  };

  customers.forEach((customer) => seedCustomer(customer));
  invoices.forEach((invoice) => upsert(invoice, "invoice"));
  repairs.forEach((repair) => upsert(repair, "repair"));
  return [...rows.values()]
    .sort((a, b) => b.totalAll - a.totalAll || b.invoices - a.invoices || b.repairs - a.repairs || b.lastActivity - a.lastActivity)
    .slice(0, limit)
    .map((item) => [item.customerName, item.phone, formatCount(item.invoices), formatCount(item.repairs), formatCurrency(item.totalAll), formatCurrency(item.totalPaid), formatCurrency(item.totalRemaining), formatDate(item.lastActivity || Date.now())]);
}

function buildLargestRemainingInvoiceRows(invoices = []) {
  return [...invoices]
    .map((invoice) => ({
      invoice,
      total: safeNumber(invoice?.finalTotal ?? invoice?.total ?? invoice?.amount ?? 0),
      paid: safeNumber(invoice?.paidAmount ?? invoice?.paid ?? 0)
    }))
    .map(({ invoice, total, paid }) => ({
      invoice,
      total,
      paid,
      balance: Math.max(0, total - paid)
    }))
    .filter((row) => row.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 8)
    .map(({ invoice, total, paid, balance }) => [
      invoice?.invoiceNumber || invoice?.id || "-",
      invoice?.customerName || "Customer",
      invoice?.customerPhone || "—",
      titleCase(normalizeStatus(invoice?.paymentStatus)),
      formatCurrency(total),
      formatCurrency(paid),
      formatCurrency(balance),
      formatDate(invoice?.createdAt || invoice?.updatedAt || Date.now())
    ]);
}

function buildRepairHistoryRows(repairs = []) {
  return [...repairs]
    .sort((a, b) => safeNumber(b?.updatedAt ?? b?.createdAt ?? b?.repairDate ?? 0) - safeNumber(a?.updatedAt ?? a?.createdAt ?? a?.repairDate ?? 0))
    .slice(0, 10)
    .map((repair) => [
      repair?.repairNumber || repair?.id || "-",
      repair?.customerName || "Customer",
      repair?.deviceName || repair?.device || repair?.model || "Device",
      titleCase(normalizeStatus(repair?.status)),
      formatCurrency(repair?.finalTotal ?? repair?.price ?? 0),
      formatCurrency(repair?.paidAmount ?? 0),
      formatCurrency(Math.max(0, safeNumMain(repair?.finalTotal ?? repair?.price ?? 0) - safeNumMain(repair?.paidAmount ?? 0))),
      formatDate(repair?.updatedAt || repair?.createdAt || repair?.repairDate || Date.now())
    ]);
}

function repairQueueNumber(repairs = []) {
  const list = Array.isArray(repairs) ? repairs : [];
  const todayKey = new Date().toDateString();
  const todaysRepairs = list.filter((repair) => {
    const stamp = safeNumber(repair?.createdAt ?? repair?.repairDate ?? repair?.updatedAt ?? 0);
    if (!stamp) return false;
    return new Date(stamp).toDateString() === todayKey;
  });
  if (todaysRepairs.length) return todaysRepairs.length;
  return list.length;
}

function buildWarrantyRows(repairs = []) {
  return repairs
    .map((repair) => {
      const repairNumber = repair?.repairNumber || repair?.id || "—";
      const customerName = repair?.customerName || repair?.customer || "Customer";
      const deviceName = repair?.deviceName || repair?.device || repair?.model || "Device";
      const warrantyLabel = String(
        repair?.warranty ||
        repair?.warrantyLabel ||
        repair?.warrantyNote ||
        (safeNumber(repair?.warrantyDays) > 0 ? `${safeNumber(repair?.warrantyDays)} day${safeNumber(repair?.warrantyDays) === 1 ? "" : "s"}` : "")
      ).trim();
      const warrantyEndsAt = repair?.warrantyEnd || repair?.warrantyExpiresAt || repair?.warrantyUntil || repair?.warrantyExpiry || repair?.warrantyValidUntil;
      const expiryLabel = warrantyEndsAt ? formatDate(warrantyEndsAt) : warrantyLabel ? "Follow-up active" : "—";
      const statusLabel = warrantyLabel ? "Covered" : repair?.status ? titleCase(normalizeStatus(repair.status)) : "Open";
      return [repairNumber, customerName, deviceName, warrantyLabel || "Standard follow-up", expiryLabel, statusLabel];
    })
    .slice(0, 12);
}
function exportReportExcel() {
  const snapshot = getReportSnapshot();
  const sections = getReportExportSections(snapshot);
  const rows = [];
  sections.forEach((section, index) => {
    rows.push([escapeCsvValue(section.title)].join(","));
    rows.push(section.data.headers.map(escapeCsvValue).join(","));
    (section.data.rows.length ? section.data.rows : [["No records"]]).forEach((row) => {
      rows.push(row.map(escapeCsvValue).join(","));
    });
    if (index < sections.length - 1) rows.push("");
    rows.push("");
  });
  const filename = `report-${normalizeText(snapshot.period).replace(/\s+/g, "-") || "all"}-${normalizeReportCategory()}.csv`;
  downloadTextFile(filename, rows.join("\n"), "text/csv;charset=utf-8");
  showToast("Excel export downloaded", "success", "Export");
}

function normalizeReportCategory() {
  return normalizeText(REPORT_STATE.filters.category || "all").toLowerCase();
}

function getReportExportSections(snapshot = getReportSnapshot()) {
  const category = normalizeReportCategory();
  const dateLabel = titleCase(snapshot.period);
  const sections = [];
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];
  const invoices = Array.isArray(snapshot.invoices) ? snapshot.invoices : [];
  const repairs = Array.isArray(snapshot.repairs) ? snapshot.repairs : [];
  const customerHistoryRows = Array.isArray(snapshot.customerHistoryRows) ? snapshot.customerHistoryRows : buildCustomerHistoryRows(invoices, repairs);
  const warrantyRows = Array.isArray(snapshot.warrantyRows) ? snapshot.warrantyRows : buildWarrantyRows(repairs);
  const productSummary = buildProductSummary(products);
  const importantProducts = getCurrentProducts(products)
    .filter((item) => Boolean(item?.important || item?.isImportant || item?.importantThreshold || item?.alertThreshold))
    .sort((a, b) => safeNumber(a?.quantity ?? 0) - safeNumber(b?.quantity ?? 0))
    .slice(0, 8);
  const lowStockProducts = getCurrentProducts(products)
    .map((item) => ({
      item,
      stock: getProductStock(item),
      threshold: safeNumber(item?.importantThreshold ?? item?.alertThreshold ?? 10)
    }))
    .filter((row) => row.stock <= row.threshold)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 8);

  const makeRows = (headers, rows) => ({ headers, rows });
  const productRows = products.map((item) => [item?.name || "-", item?.category || item?.type || "-", safeNumber(item?.quantity ?? 0), formatCurrency(item?.price ?? item?.salePrice ?? 0)]);
  const soldRows = (snapshot.soldRows || []).map((row) => [row.productId || "-", row.name || "-", formatCount(row.qty), formatCurrency(row.discount), formatCurrency(row.total)]);
  const invoiceRows = invoices.map((invoice) => [invoice.invoiceNumber || invoice.id || "-", invoice.customerName || "-", invoice.customerPhone || "-", titleCase(normalizeStatus(invoice.paymentStatus)), formatCurrency(invoice.finalTotal ?? invoice.total ?? 0), formatCurrency(invoice.paidAmount ?? 0), formatCurrency(Math.max(0, safeNumMain(invoice.finalTotal ?? invoice.total ?? 0) - safeNumMain(invoice.paidAmount ?? 0))), formatDate(invoice.createdAt || invoice.updatedAt || Date.now())]);
  const repairRows = repairs.map((repair) => [repair.repairNumber || repair.id || "-", repair.customerName || "-", repair.deviceName || "-", titleCase(normalizeStatus(repair.status)), formatCurrency(repair.finalTotal ?? repair.price ?? 0), formatCurrency(repair.paidAmount ?? 0), formatCurrency(Math.max(0, safeNumMain(repair.finalTotal ?? repair.price ?? 0) - safeNumMain(repair.paidAmount ?? 0))), formatDate(repair.updatedAt || repair.createdAt || repair.repairDate || Date.now())]);
  const expenseRows = (snapshot.expenses || []).map((expense) => [expense.name || expense.title || "-", expense.category || "-", formatCurrency(expense.amount ?? 0), formatDate(expense.createdAt || expense.updatedAt || Date.now())]);
  const summaryRows = [
    ["Total products", formatCount(productSummary.totalProducts ?? products.length)],
    ["Total stock", formatCount(productSummary.totalStock ?? 0)],
    ["Low stock products", formatCount(productSummary.lowStockProducts ?? 0)],
    ["Out of stock", formatCount(productSummary.outOfStockProducts ?? 0)],
    ["Sold products", formatCount(snapshot.soldRows?.length ?? 0)],
    ["Important products", formatCount(importantProducts.length)],
    ["Customer history rows", formatCount(customerHistoryRows.length)],
    ["Warranty records", formatCount(warrantyRows.length)]
  ];
  const importantRows = importantProducts.map((item) => {
    const name = item?.name || item?.productName || item?.title || item?.id || "Product";
    const stock = getProductStock(item);
    const threshold = safeNumber(item?.importantThreshold ?? item?.alertThreshold ?? 10);
    return [name, stock, threshold, stock <= 0 ? "Critical" : stock <= threshold ? "Alert" : "Safe"];
  });
  const lowStockRows = lowStockProducts.map(({ item, stock, threshold }) => {
    const name = item?.name || item?.productName || item?.title || item?.id || "Product";
    const categoryLabel = item?.category || item?.type || item?.group || "—";
    return [name, categoryLabel, stock, threshold, stock <= 0 ? "Out of stock" : "Low"];
  });

  if (category === "all") {
    sections.push({ title: `Products inventory — ${dateLabel}`, data: makeRows(["Name", "Category", "Stock", "Price"], productRows) });
    sections.push({ title: `Product summary — ${dateLabel}`, data: makeRows(["Metric", "Value"], summaryRows) });
    sections.push({ title: `Important products — ${dateLabel}`, data: makeRows(["Name", "Stock", "Threshold", "Status"], importantRows) });
    sections.push({ title: `Low stock alerts — ${dateLabel}`, data: makeRows(["Name", "Category", "Stock", "Threshold", "Status"], lowStockRows) });
    sections.push({ title: `Top 5 customers — ${dateLabel}`, data: makeRows(["Customer", "Phone", "Invoices", "Repairs", "Total All", "Total Paid", "Total Remaining", "Last Activity"], buildBestCustomerRows(invoices, repairs, 5, snapshot.customers || REPORT_STATE.customers || [])) });
    sections.push({ title: `Customer list — ${dateLabel}`, data: makeRows(["No", "Full Name", "Phone", "Gender", "Address", "T-Purchase", "T-Invoice.", "T-Repairs", "T-Paid", "T-Balance"], (snapshot.customers || REPORT_STATE.customers || []).map((c, index) => [index + 1, c.fullName || c.customerName || c.name || "—", c.phoneNumber || c.customerPhone || c.phone || "—", c.gender || "—", c.address || "—", formatCurrency(safeNumber(c.totalPurchases || 0)), formatCount(safeNumber(c.totalInvoices || 0)), formatCount(safeNumber(c.totalRepairs || 0)), formatCurrency(safeNumber(c.amountPaid || 0)), formatCurrency(safeNumber(c.remainingBalance || 0))])) });
    sections.push({ title: `Customer history — ${dateLabel}`, data: makeRows(["Customer", "Phone", "Invoices", "Repairs", "Total All", "Total Paid", "Total Remaining", "Last Activity"], customerHistoryRows) });
    sections.push({ title: `Warranty summary — ${dateLabel}`, data: makeRows(["Repair", "Customer", "Device", "Warranty", "Expiry", "Status"], warrantyRows) });
    sections.push({ title: `Sold products — ${dateLabel}`, data: makeRows(["Product ID", "Name", "Qty", "Discount", "Total"], soldRows) });
    sections.push({ title: `Largest remaining invoices — ${dateLabel}`, data: makeRows(["Invoice", "Customer", "Phone", "Status", "Total", "Paid", "Balance", "Date"], buildLargestRemainingInvoiceRows(invoices)) });
    sections.push({ title: `Invoices — ${dateLabel}`, data: makeRows(["Invoice", "Customer", "Phone", "Status", "Total", "Paid", "Balance", "Date"], invoiceRows) });
    sections.push({ title: `Repair history — ${dateLabel}`, data: makeRows(["Repair", "Customer", "Device", "Status", "Total", "Paid", "Balance", "Date"], buildRepairHistoryRows(repairs)) });
    sections.push({ title: `Repairs — ${dateLabel}`, data: makeRows(["Repair", "Customer", "Device", "Status", "Total", "Paid", "Balance", "Date"], repairRows) });
    sections.push({ title: `Expenses — ${dateLabel}`, data: makeRows(["Name", "Category", "Amount", "Date"], expenseRows) });
    return sections;
  }

  if (category.includes("product")) {
    sections.push({ title: `Products inventory — ${dateLabel}`, data: makeRows(["Name", "Category", "Stock", "Price"], productRows) });
    sections.push({ title: `Product summary — ${dateLabel}`, data: makeRows(["Metric", "Value"], summaryRows) });
    sections.push({ title: `Important products — ${dateLabel}`, data: makeRows(["Name", "Stock", "Threshold", "Status"], importantRows) });
    sections.push({ title: `Low stock alerts — ${dateLabel}`, data: makeRows(["Name", "Category", "Stock", "Threshold", "Status"], lowStockRows) });
  } else if (category.includes("invoice")) {
    sections.push({ title: `Top 5 customers — ${dateLabel}`, data: makeRows(["Customer", "Phone", "Invoices", "Repairs", "Total All", "Total Paid", "Total Remaining", "Last Activity"], buildBestCustomerRows(invoices, repairs, 5)) });
    sections.push({ title: `Largest remaining invoices — ${dateLabel}`, data: makeRows(["Invoice", "Customer", "Phone", "Status", "Total", "Paid", "Balance", "Date"], buildLargestRemainingInvoiceRows(invoices)) });
    sections.push({ title: `Invoices — ${dateLabel}`, data: makeRows(["Invoice", "Customer", "Phone", "Status", "Total", "Paid", "Balance", "Date"], invoiceRows) });
    sections.push({ title: `Customer history — ${dateLabel}`, data: makeRows(["Customer", "Phone", "Invoices", "Repairs", "Total All", "Total Paid", "Total Remaining", "Last Activity"], customerHistoryRows) });
  } else if (category.includes("repair")) {
    sections.push({ title: `Repair history — ${dateLabel}`, data: makeRows(["Repair", "Customer", "Device", "Status", "Total", "Paid", "Balance", "Date"], buildRepairHistoryRows(repairs)) });
    sections.push({ title: `Repairs — ${dateLabel}`, data: makeRows(["Repair", "Customer", "Device", "Status", "Total", "Paid", "Balance", "Date"], repairRows) });
    sections.push({ title: `Warranty summary — ${dateLabel}`, data: makeRows(["Repair", "Customer", "Device", "Warranty", "Expiry", "Status"], warrantyRows) });
  } else if (category.includes("customer")) {
    sections.push({ title: `Top 5 customers — ${dateLabel}`, data: makeRows(["Customer", "Phone", "Invoices", "Repairs", "Total All", "Total Paid", "Total Remaining", "Last Activity"], buildBestCustomerRows(invoices, repairs, 5, snapshot.customers || REPORT_STATE.customers || [])) });
    sections.push({ title: `Customer list — ${dateLabel}`, data: makeRows(["No", "Full Name", "Phone", "Gender", "Address", "T-Purchase", "T-Invoice.", "T-Repairs", "T-Paid", "T-Balance"], (snapshot.customers || REPORT_STATE.customers || []).map((c, index) => [index + 1, c.fullName || c.customerName || c.name || "—", c.phoneNumber || c.customerPhone || c.phone || "—", c.gender || "—", c.address || "—", formatCurrency(safeNumber(c.totalPurchases || 0)), formatCount(safeNumber(c.totalInvoices || 0)), formatCount(safeNumber(c.totalRepairs || 0)), formatCurrency(safeNumber(c.amountPaid || 0)), formatCurrency(safeNumber(c.remainingBalance || 0))])) });
    sections.push({ title: `Customer history — ${dateLabel}`, data: makeRows(["Customer", "Phone", "Invoices", "Repairs", "Total All", "Total Paid", "Total Remaining", "Last Activity"], customerHistoryRows) });
    sections.push({ title: `Invoices — ${dateLabel}`, data: makeRows(["Invoice", "Customer", "Phone", "Status", "Total", "Paid", "Balance", "Date"], invoiceRows) });
    sections.push({ title: `Repairs — ${dateLabel}`, data: makeRows(["Repair", "Customer", "Device", "Status", "Total", "Paid", "Balance", "Date"], repairRows) });
  } else if (category.includes("expense")) {
    sections.push({ title: `Expenses — ${dateLabel}`, data: makeRows(["Name", "Category", "Amount", "Date"], expenseRows) });
  }
  return sections;
}
function buildReportPrintHtml(snapshot = getReportSnapshot()) {
  const { period, invoices, expenses, customerHistoryRows = [], warrantyRows = [], bestCustomerRows = [], largestRemainingRows = [], repairHistoryRows = [], products = [], repairs = [] } = snapshot;
  const totalRevenue = buildInvoiceSummary(invoices).revenue;
  const totalExpense = buildExpenseSummary(expenses).totalAmount;
  const totalProfit = totalRevenue - totalExpense;
  const productSummary = buildProductSummary(products);
  const lowStockCount = productSummary.lowStockProducts ?? 0;
  const todayQueue = repairQueueNumber(repairs);
  const sections = getReportExportSections(snapshot);
  const sectionHtml = sections.map((section) => `
    <section class="report-section">
      <h2>${escapeHtmlPlain(section.title)}</h2>
      <table>
        <thead><tr>${section.data.headers.map((header) => `<th>${escapeHtmlPlain(header)}</th>`).join("")}</tr></thead>
        <tbody>
          ${(section.data.rows.length ? section.data.rows : [["No records"]]).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtmlPlain(cell)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </section>
  `).join("");
  const printDate = formatDate(Date.now());
  const printTime = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date());
  return `<!doctype html><html><head><meta charset="utf-8"><title>Report</title><style>
    :root{color-scheme:light}
    *{box-sizing:border-box}
    body{font-family:Inter,Arial,sans-serif;background:#f4f7fb;color:#0f172a;margin:0;padding:24px}
    .sheet{max-width:1100px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:22px;box-shadow:0 20px 60px rgba(15,23,42,.08);padding:28px}
    .hero{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:22px;border-radius:20px;background:linear-gradient(135deg,#0f172a,#2563eb);color:#fff;margin-bottom:18px}
    .hero h1{margin:0 0 8px;font-size:28px;line-height:1.1}
    .hero .sub{opacity:.88;line-height:1.5;max-width:700px}
    .hero-meta{display:grid;gap:10px;min-width:260px}
    .meta-pill{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);padding:10px 12px;border-radius:14px;font-size:13px}
    .stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:18px 0 24px}
    .stat{border:1px solid #e5e7eb;border-radius:16px;padding:14px;background:#f8fafc}
    .stat .label{font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
    .stat .value{font-size:18px;font-weight:800;margin-top:6px}
    .report-section{margin-top:22px;break-inside:avoid}
    h2{margin:0 0 10px;font-size:18px;color:#0f172a}
    table{width:100%;border-collapse:collapse;font-size:12px;overflow:hidden;border-radius:14px}
    th,td{border:1px solid #e5e7eb;padding:8px 10px;text-align:left;vertical-align:top}
    th{background:#eff6ff;color:#1e3a8a;font-weight:800}
    tbody tr:nth-child(even) td{background:#fafafa}
    .footer{margin-top:18px;color:#64748b;font-size:12px;text-align:center}
    @media print{
      body{background:#fff;padding:0}
      .sheet{box-shadow:none;border:none;border-radius:0;padding:18px}
      .hero{print-color-adjust:exact;-webkit-print-color-adjust:exact}
    }
    @page{size:A4;margin:14mm}
  </style></head><body>
  <div class="sheet">
    <div class="hero">
      <div>
        <h1>${getGeneralSettings().shopName || DEFAULT_SETTINGS.general.shopName} Report</h1>
        <div class="sub">Premium service report covering products, repairs, invoices, customer history, best customers, warranty status, and stock alerts.</div>
      </div>
      <div class="hero-meta">
        <div class="meta-pill"><strong>Period:</strong> ${escapeHtmlPlain(titleCase(period))}</div>
        <div class="meta-pill"><strong>Printed:</strong> ${escapeHtmlPlain(`${printDate} • ${printTime}`)}</div>
        <div class="meta-pill"><strong>Today Queue:</strong> #${escapeHtmlPlain(String(todayQueue || "—"))}</div>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><div class="label">Revenue</div><div class="value">${escapeHtmlPlain(formatCurrency(totalRevenue))}</div></div>
      <div class="stat"><div class="label">Expenses</div><div class="value">${escapeHtmlPlain(formatCurrency(totalExpense))}</div></div>
      <div class="stat"><div class="label">Profit</div><div class="value">${escapeHtmlPlain(formatCurrency(totalProfit))}</div></div>
      <div class="stat"><div class="label">Low stock</div><div class="value">${escapeHtmlPlain(String(lowStockCount))}</div></div>
      <div class="stat"><div class="label">Best customers</div><div class="value">${escapeHtmlPlain(String(bestCustomerRows.length))}</div></div>
      <div class="stat"><div class="label">Repair history</div><div class="value">${escapeHtmlPlain(String(repairHistoryRows.length))}</div></div>
    </div>
    ${sectionHtml}
    <div class="footer">Generated by ${getGeneralSettings().shopName || DEFAULT_SETTINGS.general.shopName}</div>
  </div>
  </body></html>`;
}
function printReportSnapshot() {
  const html = buildReportPrintHtml(getReportSnapshot());
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc) {
    showToast("Could not open print preview.", "error", "Print");
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  try {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  } catch (error) {
    console.error(error);
    showToast("Could not open print preview.", "error", "Print");
  } finally {
    setTimeout(() => frame.remove(), 1500);
  }
}

function exportReportPdf() {
  const snapshot = getReportSnapshot();
  const { period, invoices, expenses, products = [], customerHistoryRows = [], warrantyRows = [] } = snapshot;
  const totalRevenue = buildInvoiceSummary(invoices).revenue;
  const totalExpense = buildExpenseSummary(expenses).totalAmount;
  const totalProfit = totalRevenue - totalExpense;
  const productSummary = buildProductSummary(products);
  const jsPDF = window.jspdf?.jsPDF;
  if (!jsPDF) {
    printReportSnapshot();
    return;
  }
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  let y = 50;
  const writeLine = (line, size = 10, indent = 0) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(String(line), 520 - indent);
    lines.forEach((part) => {
      if (y > 760) { doc.addPage(); y = 50; }
      doc.text(part, margin + indent, y);
      y += size === 13 ? 16 : 12;
    });
  };
  doc.setFontSize(18);
  doc.text("${getGeneralSettings().shopName || DEFAULT_SETTINGS.general.shopName} Report", margin, y);
  y += 18;
  writeLine(`Period: ${titleCase(period)}`, 11);
  writeLine(`Revenue: ${formatCurrency(totalRevenue)} | Expense: ${formatCurrency(totalExpense)} | Profit: ${formatCurrency(totalProfit)}`, 11);
  writeLine(`Low stock: ${formatCount(productSummary.lowStockProducts ?? 0)} | Customer history: ${formatCount(customerHistoryRows.length)} | Warranty rows: ${formatCount(warrantyRows.length)}`, 11);
  y += 8;
  const sections = getReportExportSections(snapshot);
  sections.forEach((section) => {
    if (y > 730) { doc.addPage(); y = 50; }
    doc.setFontSize(13);
    doc.text(section.title, margin, y);
    y += 14;
    doc.setFontSize(10);
    section.data.headers.forEach((header, idx) => {
      if (y > 760) { doc.addPage(); y = 50; }
      doc.text(`${idx === 0 ? "" : "  "}• ${header}`, margin, y);
      y += 11;
    });
    y += 4;
    const rows = section.data.rows.length ? section.data.rows : [["No records"]];
    rows.slice(0, 60).forEach((row, index) => {
      const line = `${index + 1}. ${row.map((cell) => String(cell)).join(" | ")}`;
      writeLine(line, 10, 8);
    });
    y += 8;
  });
  doc.save(`report-${normalizeText(period).replace(/\s+/g, "-") || "all"}-${normalizeReportCategory()}.pdf`);
}
function applyReportFiltersAndRender() {
  syncFiltersFromUI();
  renderReport();
}

function triggerReportExportMenu(action) {
  syncFiltersFromUI();
  if (action === "pdf") {
    exportReportPdf();
    showToast("PDF downloaded", "success", "Export");
    return;
  }
  if (action === "excel") {
    exportReportExcel();
    return;
  }
}

function getFilterControls() {
  const searchInput = document.querySelector('.search-wrap input[type="search"]');
  const selects = Array.from(document.querySelectorAll('.card-shell select.form-select, .filters select.form-select, select.form-select'));
  const periodSelect = selects[0] || null;
  const metricSelect = selects[1] || null;
  const categorySelect = selects[2] || null;
  const applyButton = Array.from(document.querySelectorAll("button")).find((button) => normalizeText(button.textContent).includes("apply"));
  const resetButton = Array.from(document.querySelectorAll("button")).find((button) => normalizeText(button.textContent) === "reset");
  return { searchInput, periodSelect, metricSelect, categorySelect, applyButton, resetButton };
}

function syncFiltersFromUI() {
  const { periodSelect, metricSelect, categorySelect, searchInput } = getFilterControls();
  if (periodSelect) REPORT_STATE.filters.period = periodSelect.value || periodSelect.options[periodSelect.selectedIndex]?.textContent || "Today";
  if (metricSelect) REPORT_STATE.filters.metric = metricSelect.value || metricSelect.options[metricSelect.selectedIndex]?.textContent || "Revenue";
  if (categorySelect) REPORT_STATE.filters.category = categorySelect.value || categorySelect.options[categorySelect.selectedIndex]?.textContent || "Products";
  if (searchInput) REPORT_STATE.filters.search = searchInput.value || "";
}

function wireControls() {
  const { searchInput, periodSelect, metricSelect, categorySelect, applyButton, resetButton } = getFilterControls();

  if (searchInput) {
    searchInput.addEventListener("input", debounce((event) => {
      REPORT_STATE.filters.search = event.target.value;
      filterSearchAcrossPage(event.target.value);
    }, 200));
  }

  [periodSelect, metricSelect, categorySelect].forEach((select) => {
    if (!select) return;
    select.addEventListener("change", () => {
      syncFiltersFromUI();
      renderReport();
    updateReportNotificationBadge({ products: REPORT_STATE.products, invoices: REPORT_STATE.invoices, repairs: REPORT_STATE.repairs });
    });
  });

  if (applyButton) {
    applyButton.addEventListener("click", (event) => {
      event.preventDefault();
      syncFiltersFromUI();
      renderReport();
      showToast("Report filters applied", "success", "Reports");
    });
  }

  if (resetButton) {
    resetButton.addEventListener("click", (event) => {
      event.preventDefault();
      const { searchInput: s, periodSelect: p, metricSelect: m, categorySelect: c } = getFilterControls();
      if (s) s.value = "";
      if (p) p.selectedIndex = 0;
      if (m) m.selectedIndex = 0;
      if (c) c.selectedIndex = 0;
      REPORT_STATE.filters = { period: "Today", metric: "Revenue", category: "All", search: "" };
      renderReport();
      showToast("Report filters reset", "restore", "Reports");
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button");
    if (!button) return;

    if (button.id === 'reportExportPdfBtn' || button.id === 'reportTopExportPdfBtn') {
      event.preventDefault();
      triggerReportExportMenu("pdf");
    } else if (button.id === 'reportExportExcelBtn' || button.id === 'reportTopExportExcelBtn') {
      event.preventDefault();
      triggerReportExportMenu("excel");
    } else if (button.id === 'reportPrintBtn' || button.id === 'reportTopPrintBtn') {
      event.preventDefault();
      syncFiltersFromUI();
      printReportSnapshot();
      showToast("Print report opened", "info", "Print");
    } else if (button.id === 'reportApplyTopBtn' || button.id === 'reportTopFilterBtn' || button.id === 'reportApplyBtn') {
      event.preventDefault();
      applyReportFiltersAndRender();
      showToast("Report filters applied", "success", "Reports");
    } else if (button.id === 'reportResetBtn') {
      event.preventDefault();
      const { searchInput: s, periodSelect: p, metricSelect: m, categorySelect: c } = getFilterControls();
      if (s) s.value = "";
      if (p) p.selectedIndex = 0;
      if (m) m.selectedIndex = 0;
      if (c) c.selectedIndex = 0;
      REPORT_STATE.filters = { period: "Today", metric: "Revenue", category: "All", search: "" };
      renderReport();
      showToast("Report filters reset", "restore", "Reports");
    }
  });
}

async function initReportPage() {
  if (!document.querySelector(".page-wrap")) return;
  setPageLoading(reportLoadingTargets(), true);
  showReportSkeleton();
  try {
    await loadReportData();
    syncFiltersFromUI();
    wireControls();
    renderReport();
    filterSearchAcrossPage(REPORT_STATE.filters.search);
    showToast("Reports loaded from Firebase", "success", "Reports");
  } catch (error) {
    console.error("Report page failed:", error);
    showToast("Reports could not be loaded", "warning", "Reports");
  } finally {
    setTimeout(() => setPageLoading(reportLoadingTargets(), false), 220);
  }
}

document.addEventListener("DOMContentLoaded", initReportPage);

window.ShopReport = {
  initReportPage,
  renderReport
};
