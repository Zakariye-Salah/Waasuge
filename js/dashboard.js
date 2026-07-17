import {
  PATHS,
  buildExpenseTotal,
  buildInvoiceSummary,
  buildProductSummary,
  buildRepairSummary,
  getCustomers,
  getOnce,
  safeNumber,
  toArray,
  filterActive,
  sortByDate
} from "./database.js";
import {
  formatCurrency,
  formatDate,
  normalizeText,
  showToast,
  setHeaderBadgeCount,
  renderNotificationMenu,
  setPageLoading
} from "./main.js";
import { getStockSettings } from "./settings-config.js";

function getLowStockThreshold() {
  const value = Number(getStockSettings()?.lowStockLevel ?? 5);
  return Number.isFinite(value) ? value : 5;
}

function setCount(id, value, formatter = (v) => String(v)) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = formatter(value);
}

function showDashboardSkeleton() {
  ["totalProducts","totalCustomers","totalRevenue","totalProfit","totalQuantity","importantProducts","lowStockProducts","totalInvoices","totalRepairs","pendingRepairs","processingRepairs","completedRepairs","deliveredRepairs","totalRemainingMoney","repairPaidTotal","repairUnpaidTotal","totalExpense","netProfit"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = '<span class="skeleton-line d-inline-block" style="width:72px;height:18px;"></span>';
    }
  });
}

function dashboardLoadingTargets() {
  return [".page-wrap", ".summary-card", ".card-shell.h-100", ".table-responsive", ".dashboard-chart-card", "#recentInvoicesTbody", "#recentRepairsTbody", "#lowStockTbody"];
}

function updateDashboardNotificationBadge({ products = [], invoices = [], repairs = [] } = {}) {
  const lowStock = filterActive(products).filter((item) => safeNumber(item?.quantity) <= getLowStockThreshold()).length;
  const unpaid = filterActive(invoices).filter((invoice) => {
    const status = normalizeText(invoice?.paymentStatus);
    return status === "unpaid" || status === "partial";
  }).length;
  const pendingRepairs = filterActive(repairs).filter((repair) => {
    const status = normalizeText(repair?.status);
    return status !== "delivered";
  }).length;
  renderNotificationMenu([
    {
      icon: "bi-box-seam",
      iconClass: "text-warning",
      title: `${lowStock} product${lowStock === 1 ? "" : "s"} need restocking`,
      text: "Live stock alerts from Firebase products.",
      href: "#lowStockProducts"
    },
    {
      icon: "bi-tools",
      iconClass: "text-primary",
      title: `${pendingRepairs} repair job${pendingRepairs === 1 ? "" : "s"} need attention`,
      text: "Pending, processing and waiting repairs are counted.",
      href: "#repairStatusChart"
    },
    {
      icon: "bi-receipt-cutoff",
      iconClass: "text-success",
      title: `${unpaid} invoice${unpaid === 1 ? "" : "s"} awaiting payment`,
      text: "Partial and unpaid invoices are shown in the invoice page.",
      href: "#recentInvoicesTbody"
    }
  ], { count: lowStock + unpaid + pendingRepairs, title: "Notifications", emptyText: "No dashboard notifications right now." });
  setHeaderBadgeCount(lowStock + unpaid + pendingRepairs, 'button[aria-label="Notifications"] .badge');
}

function updateDashboardMeta() {
  const todayLabel = document.getElementById("dashboardTodayLabel");
  if (todayLabel) {
    todayLabel.textContent = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date());
  }

  const onlineDot = document.getElementById("dashboardOnlineDot");
  const onlineText = document.getElementById("dashboardOnlineText");
  const onlineBadge = document.getElementById("dashboardOnlineBadge");
  const isOnline = navigator.onLine;
  if (onlineDot) onlineDot.className = `status-dot ${isOnline ? "bg-success" : "bg-danger"}`;
  if (onlineText) onlineText.textContent = isOnline ? "Online" : "Offline";
  if (onlineBadge) onlineBadge.classList.toggle("text-success", isOnline);

  const userEl = document.getElementById("dashboardFirebaseUser");
  const userText = localStorage.getItem("electronicShopAdminEmail") || localStorage.getItem("electronicShopAdminUid") || "Firebase user";
  if (userEl) userEl.textContent = userText;
}

function statusKey(value) {
  return normalizeText(value || "pending");
}

function badgeClassForInvoice(status) {
  const key = statusKey(status);
  if (key === "paid") return "bg-soft-success text-success-soft";
  if (key === "partial") return "bg-soft-warning text-warning-soft";
  return "bg-soft-danger text-danger-soft";
}

function badgeClassForRepair(status) {
  const key = statusKey(status);
  if (key === "completed" || key === "delivered") return "bg-soft-success text-success-soft";
  if (key === "processing" || key === "in repair") return "bg-soft-info text-info-soft";
  if (key === "waiting for parts") return "bg-soft-warning text-warning-soft";
  return "bg-soft-warning text-warning-soft";
}

function badgeClassForStock(quantity) {
  const qty = safeNumber(quantity);
  if (qty <= 0) return "bg-soft-danger text-danger-soft";
  if (qty <= getLowStockThreshold()) return "bg-soft-warning text-warning-soft";
  return "bg-soft-success text-success-soft";
}

function safeLabel(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function destroyChart(chart) {
  if (chart && typeof chart.destroy === "function") chart.destroy();
}

function renderInvoices(invoices) {
  const tbody = document.getElementById("recentInvoicesTbody");
  if (!tbody) return;
  const list = sortByDate(filterActive(invoices), "createdAt", true).slice(0, 5);
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">No invoices yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((invoice) => {
    const customer = safeLabel(invoice.customerName || invoice.customer || "Walk-in customer");
    const phone = safeLabel(invoice.customerPhone || invoice.phone || invoice.customerPhoneNumber, "No phone");
    const amount = safeNumber(invoice.finalTotal ?? invoice.total ?? invoice.amount);
    const status = safeLabel(invoice.paymentStatus, "unpaid");
    return `
      <tr>
        <td>
          <div class="fw-semibold">${customer}</div>
          <small class="text-muted">${phone}</small>
        </td>
        <td class="fw-semibold">${formatCurrency(amount)}</td>
        <td><span class="badge ${badgeClassForInvoice(status)} badge-pill">${status}</span></td>
      </tr>
    `;
  }).join("");
}

function renderRepairs(repairs) {
  const tbody = document.getElementById("recentRepairsTbody");
  if (!tbody) return;
  const list = sortByDate(filterActive(repairs), "createdAt", true).slice(0, 5);
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center text-muted py-4">No repair jobs yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((repair) => {
    const customer = safeLabel(repair.customerName || repair.customer || "Customer");
    const phone = safeLabel(repair.customerPhone || repair.phone || repair.customerPhoneNumber, "No phone");
    const device = safeLabel(repair.deviceName || repair.device || repair.model || "Device");
    const status = safeLabel(repair.status, "pending");
    return `
      <tr>
        <td>
          <div class="fw-semibold">${customer}</div>
          <small class="text-muted">${phone}</small>
        </td>
        <td class="fw-semibold">${device}</td>
        <td><span class="badge ${badgeClassForRepair(status)} badge-pill">${status}</span></td>
      </tr>
    `;
  }).join("");
}

function renderLowStock(products) {
  const tbody = document.getElementById("lowStockTbody");
  if (!tbody) return;
  const list = sortByDate(filterActive(products), "createdAt", true)
    .filter((item) => safeNumber(item?.quantity) <= getLowStockThreshold())
    .slice(0, 6);
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">No low stock products right now.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((product) => {
    const name = safeLabel(product.name || product.productName || "Product");
    const category = safeLabel(product.category || product.type || "General");
    const stock = safeNumber(product.quantity);
    const status = stock <= 0 ? "Out of Stock" : stock <= 2 ? "Critical" : "Low Stock";
    return `
      <tr>
        <td class="fw-semibold">${name}</td>
        <td>${category}</td>
        <td>${stock}</td>
        <td><span class="badge ${badgeClassForStock(stock)} badge-pill">${status}</span></td>
      </tr>
    `;
  }).join("");
}

function createCharts({ products, invoices, repairs, expenses }) {
  if (!window.Chart) return;
  window.ShopDashboardCharts = window.ShopDashboardCharts || {};
  destroyChart(window.ShopDashboardCharts.revenueProfit);
  destroyChart(window.ShopDashboardCharts.repairStatus);
  destroyChart(window.ShopDashboardCharts.stockHealth);
  destroyChart(window.ShopDashboardCharts.topProducts);

  const productSummary = buildProductSummary(products);
  const invoiceSummary = buildInvoiceSummary(invoices);
  const repairSummary = buildRepairSummary(repairs);
  const totalExpense = buildExpenseTotal(expenses);
  const totalRevenue = invoiceSummary.revenue;
  const totalProfit = totalRevenue - totalExpense;
  const healthyStock = Math.max(0, productSummary.totalProducts - productSummary.lowStockProducts - productSummary.importantProducts);

  const revenueCanvas = document.getElementById("revenueProfitChart");
  const repairCanvas = document.getElementById("repairStatusChart");
  const stockCanvas = document.getElementById("stockHealthChart");
  const topProductsCanvas = document.getElementById("topProductsChart");

  if (revenueCanvas) {
    window.ShopDashboardCharts.revenueProfit = new Chart(revenueCanvas, {
      type: "bar",
      data: {
        labels: ["Revenue", "Expenses", "Profit"],
        datasets: [{ data: [totalRevenue, totalExpense, totalProfit] }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (value) => formatCurrency(value) }
          }
        }
      }
    });
  }

  if (repairCanvas) {
    window.ShopDashboardCharts.repairStatus = new Chart(repairCanvas, {
      type: "doughnut",
      data: {
        labels: ["Device Received", "Inspection Started", "Diagnosis Completed", "Waiting for Approval", "Waiting for Parts", "Repair in Progress", "Quality Testing", "Ready for Pickup", "Delivered"],
        datasets: [{ data: [
          repairSummary.deviceReceivedRepairs,
          repairSummary.inspectionStartedRepairs,
          repairSummary.diagnosisCompletedRepairs,
          repairSummary.waitingForApprovalRepairs,
          repairSummary.waitingForPartsRepairs,
          repairSummary.repairInProgressRepairs,
          repairSummary.qualityTestingRepairs,
          repairSummary.readyForPickupRepairs,
          repairSummary.deliveredRepairs
        ] }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
    });
  }

  if (stockCanvas) {
    window.ShopDashboardCharts.stockHealth = new Chart(stockCanvas, {
      type: "doughnut",
      data: {
        labels: ["Healthy Stock", "Low Stock", "Important"],
        datasets: [{ data: [healthyStock, productSummary.lowStockProducts, productSummary.importantProducts] }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
    });
  }

  if (topProductsCanvas) {
    const topProducts = sortByDate(filterActive(products), "createdAt", true)
      .slice(0, 8)
      .map((product) => ({ label: safeLabel(product.name || product.productName || "Product"), qty: safeNumber(product.quantity) }));
    window.ShopDashboardCharts.topProducts = new Chart(topProductsCanvas, {
      type: "bar",
      data: { labels: topProducts.map((i) => i.label), datasets: [{ data: topProducts.map((i) => i.qty) }] },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true } }
      }
    });
  }
}

async function loadDashboardSummary() {
  setPageLoading(dashboardLoadingTargets(), true);
  showDashboardSkeleton();
  try {
    const [productsData, invoicesData, repairsData, expensesData, customersData] = await Promise.all([
      getOnce(PATHS.products),
      getOnce(PATHS.invoices),
      getOnce(PATHS.repairs),
      getOnce(PATHS.expenses),
      getOnce(PATHS.customers)
    ]);

    const products = toArray(productsData);
    const invoices = toArray(invoicesData);
    const repairs = toArray(repairsData);
    const expenses = toArray(expensesData);
    const customers = filterActive(toArray(customersData));

    const productSummary = buildProductSummary(products);
    const invoiceSummary = buildInvoiceSummary(invoices);
    const repairSummary = buildRepairSummary(repairs);
    const totalExpense = buildExpenseTotal(expenses);
    const totalRevenue = invoiceSummary.revenue;
    const totalRemaining = invoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice?.balance ?? Math.max(0, Number(invoice?.finalTotal ?? 0) - Number(invoice?.paidAmount ?? 0))) || 0), 0);
    const totalProfit = totalRevenue - totalExpense;

    setCount("totalProducts", productSummary.totalProducts);
    setCount("totalCustomers", customers.length);
    setCount("totalRevenue", totalRevenue, (v) => formatCurrency(v));
    setCount("totalProfit", totalProfit, (v) => formatCurrency(v));
    setCount("totalQuantity", productSummary.totalQuantity);
    setCount("importantProducts", productSummary.importantProducts);
    setCount("lowStockProducts", productSummary.lowStockProducts);
    setCount("totalInvoices", invoiceSummary.totalInvoices);
    setCount("totalRepairs", repairSummary.totalRepairs);
    setCount("pendingRepairs", repairSummary.deviceReceivedRepairs ?? repairSummary.pendingRepairs);
    setCount("processingRepairs", repairSummary.inspectionStartedRepairs ?? repairSummary.processingRepairs);
    setCount("completedRepairs", repairSummary.qualityTestingRepairs ?? repairSummary.completedRepairs);
    setCount("deliveredRepairs", repairSummary.deliveredRepairs);
    const activeRepairs = filterActive(repairs);
    const totalPaidRepairs = activeRepairs.reduce((sum, repair) => sum + Math.max(0, Number(repair?.paidAmount ?? 0) || 0), 0);
    const totalUnpaidRepairs = activeRepairs.reduce((sum, repair) => sum + Math.max(0, Number(repair?.finalTotal ?? repair?.price ?? 0) - Number(repair?.paidAmount ?? 0) || 0), 0);
    setCount("repairPaidTotal", totalPaidRepairs, (v) => formatCurrency(v));
    setCount("repairUnpaidTotal", totalUnpaidRepairs, (v) => formatCurrency(v));
    setCount("totalExpense", totalExpense, (v) => formatCurrency(v));
    setCount("totalExpenses", totalExpense, (v) => formatCurrency(v));
    setCount("totalRemainingMoney", totalRemaining, (v) => formatCurrency(v));
    setCount("netProfit", totalProfit, (v) => formatCurrency(v));

    renderInvoices(invoices);
    renderRepairs(repairs);
    renderLowStock(products);
    createCharts({ products, invoices, repairs, expenses });
    updateDashboardNotificationBadge({ products, invoices, repairs });

    if (products.length || invoices.length || repairs.length || expenses.length) {
      showToast("Dashboard summary loaded from Firebase", "success", "Dashboard");
    }
  } catch (error) {
    console.error("Dashboard load failed:", error);
    showToast("Dashboard data could not be loaded", "warning", "Dashboard");
  } finally {
    setTimeout(() => setPageLoading(dashboardLoadingTargets(), false), 220);
  }
}

function initDashboardPage() {
  if (!document.getElementById("totalProducts")) return;
  updateDashboardMeta();
  loadDashboardSummary();
  window.addEventListener("online", updateDashboardMeta);
  window.addEventListener("offline", updateDashboardMeta);
}

document.addEventListener("DOMContentLoaded", initDashboardPage);

window.ShopDashboard = { loadDashboardSummary, initDashboardPage, updateDashboardMeta };
