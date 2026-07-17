import { db } from "./firebase.js";
import {
  ref,
  get,
  push,
  set,
  update,
  remove,
  child
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";

export const PATHS = Object.freeze({
  products: "products",
  invoices: "invoices",
  repairs: "repairs",
  customers: "customers",
  payments: "payments",
  expenses: "expenses",
  users: "users",
  settings: "settings",
  reports: "reports"
});

function dbRef(path = "") {
  return path ? ref(db, path) : ref(db);
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

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

export function formatDateTime(value, locale = 'en-US') {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

export function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isSoftDeleted(item) {
  return Boolean(item?.isDeleted || item?.deleted);
}

export function filterActive(items) {
  return toArray(items).filter((item) => !isSoftDeleted(item));
}

export function filterDeleted(items) {
  return toArray(items).filter((item) => isSoftDeleted(item));
}

export async function getOnce(path) {
  const snapshot = await get(dbRef(path));
  return snapshot.exists() ? snapshot.val() : null;
}

export async function getAllRecords(path) {
  return getOnce(path);
}

export async function getById(path, id) {
  if (!id) return null;
  const snapshot = await get(child(dbRef(path), String(id)));
  return snapshot.exists() ? snapshot.val() : null;
}

export async function getRecordById(path, id) {
  return getById(path, id);
}

function timestampPayload(data, existingId) {
  const payload = {
    ...safeObject(data),
    id: existingId ?? null,
    updatedAt: Date.now()
  };
  if (!payload.createdAt) payload.createdAt = Date.now();
  return payload;
}

async function saveRecord(path, data, id) {
  const recordRef = id ? dbRef(`${path}/${id}`) : push(dbRef(path));
  const payload = timestampPayload(data, id || recordRef.key);
  await set(recordRef, payload);
  return payload;
}

export async function addRecord(path, data) {
  return saveRecord(path, data);
}

export async function editRecord(path, id, data) {
  if (!id) throw new Error(`Missing record id for ${path}`);
  await update(dbRef(`${path}/${id}`), {
    ...safeObject(data),
    updatedAt: Date.now()
  });
  return true;
}

export async function deleteRecord(path, id, { hardDelete = false } = {}) {
  if (!id) throw new Error(`Missing record id for ${path}`);
  if (hardDelete) {
    await remove(dbRef(`${path}/${id}`));
  } else {
    await update(dbRef(`${path}/${id}`), {
      isDeleted: true,
      deleted: true,
      deletedAt: Date.now(),
      updatedAt: Date.now()
    });
  }
  return true;
}

export async function restoreRecord(path, id) {
  if (!id) throw new Error(`Missing record id for ${path}`);
  await update(dbRef(`${path}/${id}`), {
    isDeleted: false,
    deleted: false,
    restoredAt: Date.now(),
    updatedAt: Date.now()
  });
  return true;
}

export async function setRecord(path, id, data) {
  return saveRecord(path, data, id);
}

export async function getSettingValue(key, fallback = null) {
  const value = await getOnce(`${PATHS.settings}/${key}`);
  if (value === null || value === undefined) return fallback;
  if (value && typeof value === "object" && "value" in value) return value.value;
  return value;
}

export async function setSettingValue(key, value) {
  return setRecord(PATHS.settings, key, { value, updatedAt: Date.now() });
}

export function sortByDate(items, field = "createdAt", desc = true) {
  return toArray(items).slice().sort((a, b) => {
    const aTime = safeNumber(a?.[field]);
    const bTime = safeNumber(b?.[field]);
    return desc ? bTime - aTime : aTime - bTime;
  });
}

export function filterByDateRange(items, field, start, end) {
  const startTime = start ? new Date(start).setHours(0, 0, 0, 0) : null;
  const endTime = end ? new Date(end).setHours(23, 59, 59, 999) : null;

  return toArray(items).filter((item) => {
    const value = safeNumber(item?.[field]);
    if (!value) return false;
    if (startTime !== null && value < startTime) return false;
    if (endTime !== null && value > endTime) return false;
    return true;
  });
}

export const getProducts = () => getOnce(PATHS.products);
export const getInvoices = () => getOnce(PATHS.invoices);
export const getRepairs = () => getOnce(PATHS.repairs);
export const getExpenses = () => getOnce(PATHS.expenses);

export const addProduct = (data) => addRecord(PATHS.products, data);
export const updateProduct = (id, data) => editRecord(PATHS.products, id, data);
export const deleteProduct = (id, options) => deleteRecord(PATHS.products, id, options);
export const restoreProduct = (id) => restoreRecord(PATHS.products, id);
export const getProductById = (id) => getById(PATHS.products, id);

export const addInvoice = (data) => addRecord(PATHS.invoices, data);
export const updateInvoice = (id, data) => editRecord(PATHS.invoices, id, data);
export const deleteInvoice = (id, options) => deleteRecord(PATHS.invoices, id, options);
export const restoreInvoice = (id) => restoreRecord(PATHS.invoices, id);
export const getInvoiceById = (id) => getById(PATHS.invoices, id);

export const addRepair = (data) => addRecord(PATHS.repairs, data);
export const updateRepair = (id, data) => editRecord(PATHS.repairs, id, data);
export const deleteRepair = (id, options) => deleteRecord(PATHS.repairs, id, options);
export const restoreRepair = (id) => restoreRecord(PATHS.repairs, id);
export const getRepairById = (id) => getById(PATHS.repairs, id);

export const getCustomers = () => getOnce(PATHS.customers);
export const getPayments = () => getOnce(PATHS.payments);

export const addCustomer = (data) => addRecord(PATHS.customers, data);
export const updateCustomer = (id, data) => editRecord(PATHS.customers, id, data);
export const deleteCustomer = (id, options) => deleteRecord(PATHS.customers, id, options);
export const restoreCustomer = (id) => restoreRecord(PATHS.customers, id);
export const getCustomerById = (id) => getById(PATHS.customers, id);

export const addPayment = (data) => addRecord(PATHS.payments, data);
export const addExpense = (data) => addRecord(PATHS.expenses, data);
export const updateExpense = (id, data) => editRecord(PATHS.expenses, id, data);
export const deleteExpense = (id, options) => deleteRecord(PATHS.expenses, id, options);
export const restoreExpense = (id) => restoreRecord(PATHS.expenses, id);
export const getExpenseById = (id) => getById(PATHS.expenses, id);

export function buildProductSummary(products) {
  const list = filterActive(products);
  const lowStockThreshold = 5;
  const totalCost = list.reduce((sum, item) => sum + safeNumber(item?.quantity) * safeNumber(item?.originalPrice ?? item?.costPrice ?? item?.purchasePrice ?? item?.price), 0);
  const totalValue = list.reduce((sum, item) => sum + safeNumber(item?.quantity) * safeNumber(item?.price), 0);

  return {
    totalProducts: list.length,
    totalQuantity: list.reduce((sum, item) => sum + safeNumber(item?.quantity), 0),
    importantProducts: list.filter((item) => Boolean(item?.important || item?.isImportant)).length,
    lowStockProducts: list.filter((item) => safeNumber(item?.quantity) <= lowStockThreshold).length,
    totalStockCost: totalCost,
    totalStockValue: totalValue,
    potentialProfit: totalValue - totalCost
  };
}

export function buildInvoiceSummary(invoices) {
  const list = filterActive(invoices);
  const revenue = list.reduce(
    (sum, item) => sum + safeNumber(item?.finalTotal ?? item?.total ?? item?.amount),
    0
  );

  return {
    totalInvoices: list.length,
    revenue,
    paidInvoices: list.filter((item) => normalizeStatus(item?.paymentStatus) === "paid").length,
    partialInvoices: list.filter((item) => normalizeStatus(item?.paymentStatus) === "partial").length,
    unpaidInvoices: list.filter((item) => normalizeStatus(item?.paymentStatus) === "unpaid").length
  };
}


function getRepairStatusKey(item) {
  const candidates = [
    item?.status,
    item?.repairStatus,
    item?.stage,
    item?.currentStage,
    item?.currentStatus,
    item?.workflowStatus,
    item?.progressStatus,
    item?.repairStage,
    item?.repairState
  ];

  const aliases = {
    pending: "device received",
    received: "device received",
    processing: "inspection started",
    inspecting: "inspection started",
    checked: "diagnosis completed",
    diagnosed: "diagnosis completed",
    approval: "waiting for approval",
    waiting: "waiting for parts",
    hold: "waiting for parts",
    parts: "waiting for parts",
    active: "repair in progress",
    inrepair: "repair in progress",
    completed: "quality testing",
    testing: "quality testing",
    ready: "ready for pickup",
    delivered: "delivered",
    done: "delivered"
  };

  for (const candidate of candidates) {
    const text = normalizeText(candidate);
    if (!text) continue;
    if (aliases[text]) return aliases[text];
    if (text.includes("device received") || text.includes("received")) return "device received";
    if (text.includes("inspection started") || text.includes("inspecting")) return "inspection started";
    if (text.includes("diagnosis completed") || text.includes("checked")) return "diagnosis completed";
    if (text.includes("waiting for approval") || text.includes("approval")) return "waiting for approval";
    if (text.includes("waiting for parts") || text.includes("waiting parts")) return "waiting for parts";
    if (text.includes("repair in progress") || text.includes("in repair") || text.includes("working")) return "repair in progress";
    if (text.includes("quality testing") || text.includes("testing")) return "quality testing";
    if (text.includes("ready for pickup") || text.includes("ready")) return "ready for pickup";
    if (text.includes("delivered") || text.includes("done")) return "delivered";
  }

  return "device received";
}

export function buildRepairSummary(repairs) {
  const list = filterActive(repairs);
  const counts = list.reduce((acc, item) => {
    const normalized = getRepairStatusKey(item);
    acc[normalized] = (acc[normalized] || 0) + 1;
    return acc;
  }, {});

  return {
    totalRepairs: list.length,
    deviceReceivedRepairs: counts["device received"] || 0,
    inspectionStartedRepairs: counts["inspection started"] || 0,
    diagnosisCompletedRepairs: counts["diagnosis completed"] || 0,
    waitingForApprovalRepairs: counts["waiting for approval"] || 0,
    waitingForPartsRepairs: counts["waiting for parts"] || 0,
    repairInProgressRepairs: counts["repair in progress"] || 0,
    qualityTestingRepairs: counts["quality testing"] || 0,
    readyForPickupRepairs: counts["ready for pickup"] || 0,
    deliveredRepairs: counts.delivered || 0,
    // legacy aliases
    pendingRepairs: counts["device received"] || 0,
    processingRepairs: counts["inspection started"] || 0,
    inRepairRepairs: counts["repair in progress"] || 0,
    completedRepairs: counts["quality testing"] || 0,
    statusCounts: counts
  };
}

export function buildExpenseTotal(expenses) {
  return filterActive(expenses).reduce((sum, item) => sum + safeNumber(item?.amount), 0);
}

export function buildExpenseSummary(expenses) {
  const list = filterActive(expenses);
  const byType = list.reduce((acc, item) => {
    const key = normalizeText(item?.type || 'other') || 'other';
    acc[key] = (acc[key] || 0) + safeNumber(item?.amount);
    return acc;
  }, {});

  return {
    totalExpenses: list.length,
    totalAmount: buildExpenseTotal(list),
    byType
  };
}

export function buildReportSummary({ products, invoices, repairs, expenses }) {
  const productSummary = buildProductSummary(products);
  const invoiceSummary = buildInvoiceSummary(invoices);
  const repairSummary = buildRepairSummary(repairs);
  const totalExpense = buildExpenseTotal(expenses);
  const totalRevenue = invoiceSummary.revenue;
  const totalProfit = totalRevenue - totalExpense;

  return {
    ...productSummary,
    ...invoiceSummary,
    ...repairSummary,
    totalExpense,
    totalRevenue,
    totalProfit
  };
}

export function createDateBucket(startDate, endDate) {
  return {
    startDate,
    endDate,
    startAt: startDate ? new Date(startDate).setHours(0, 0, 0, 0) : null,
    endAt: endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null
  };
}

export function withinDateBucket(timestamp, bucket) {
  const value = safeNumber(timestamp);
  if (!value) return false;
  if (bucket.startAt !== null && value < bucket.startAt) return false;
  if (bucket.endAt !== null && value > bucket.endAt) return false;
  return true;
}

export function filterRecordsByBucket(items, field, bucket) {
  return toArray(items).filter((item) => withinDateBucket(item?.[field], bucket));
}

export function withId(record, id) {
  return { ...(record || {}), id: id || record?.id || null };
}

window.ShopDatabase = {
  getOnce,
  getById,
  addRecord,
  editRecord,
  deleteRecord,
  restoreRecord,
  getProducts,
  getInvoices,
  getRepairs,
  getExpenses,
  buildExpenseSummary,
  getSettingValue,
  setSettingValue
};
