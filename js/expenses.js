
import {
  addExpense,
  buildExpenseSummary,
  deleteExpense,
  filterDeleted,
  filterActive,
  getExpenses,
  normalizeStatus,
  restoreExpense,
  safeNumber,
  sortByDate,
  updateExpense,
  toArray
} from "./database.js";
import { formatCurrency, formatDateTime, normalizeText, showToast, debounce } from "./main.js";

const expenseTypes = [
  "Rent",
  "Electricity",
  "Internet",
  "Transport",
  "Tools",
  "Repair materials",
  "Salary",
  "Stock purchase",
  "Other"
];

const state = {
  expenses: [],
  filtered: [],
  editingId: null,
  filters: {
    q: "",
    type: "all",
    status: "active"
  }
};

const els = {};

function qs(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = qs(id);
  if (el) el.textContent = value;
}

function setThemeFromStorage() {
  const themeKey = "electronicShopTheme";
  const saved = localStorage.getItem(themeKey) || localStorage.getItem("expenseTheme") || "dark";
  const icon = qs("themeIcon");
  const toggle = qs("themeToggle");
  const apply = (theme) => {
    const nextTheme = theme === "light" ? "light" : "dark";
    const isDark = nextTheme === "dark";
    document.body.classList.toggle("dark-mode", isDark);
    document.body.dataset.theme = nextTheme;
    document.body.setAttribute("data-bs-theme", isDark ? "dark" : "light");
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.setAttribute("data-bs-theme", isDark ? "dark" : "light");
    if (icon) icon.className = isDark ? "bi bi-sun" : "bi bi-moon-stars";
    localStorage.setItem(themeKey, nextTheme);
  };
  apply(saved);
  toggle?.addEventListener("click", () => {
    apply(document.body.classList.contains("dark-mode") ? "light" : "dark");
  });
}

function getFormData() {
  const type = qs("expenseType")?.value?.trim() || "Other";
  const title = qs("expenseTitle")?.value?.trim() || "";
  const amount = safeNumber(qs("expenseAmount")?.value);
  const date = qs("expenseDate")?.value || new Date().toISOString().slice(0, 10);
  const notes = qs("expenseNotes")?.value?.trim() || "";

  return {
    type,
    title,
    amount,
    date,
    notes,
    searchText: normalizeText([type, title, notes, date].filter(Boolean).join(" ")),
    updatedAt: Date.now()
  };
}

function populateTypes() {
  const select = qs("expenseType");
  const filter = qs("filterType");
  if (select && !select.dataset.ready) {
    select.innerHTML = expenseTypes.map((item) => `<option value="${item}">${item}</option>`).join("");
    select.dataset.ready = "1";
  }
  if (filter && !filter.dataset.ready) {
    filter.innerHTML = `<option value="all">All types</option>` + expenseTypes.map((item) => `<option value="${item}">${item}</option>`).join("");
    filter.dataset.ready = "1";
  }
}

function resetForm() {
  const form = qs("expenseForm");
  form?.reset();
  const today = new Date().toISOString().slice(0, 10);
  if (qs("expenseDate")) qs("expenseDate").value = today;
  qs("expenseType") && (qs("expenseType").value = "Rent");
  qs("expenseAmount")?.focus();
  state.editingId = null;
  const btn = qs("saveExpenseBtn");
  if (btn) btn.innerHTML = '<i class="bi bi-plus-circle me-2"></i> Save Expense';
}

function normalizeExpense(item) {
  return {
    ...item,
    id: item?.id || "",
    type: item?.type || "Other",
    title: item?.title || "Untitled",
    amount: safeNumber(item?.amount),
    date: item?.date || "",
    notes: item?.notes || "",
    createdAt: safeNumber(item?.createdAt),
    updatedAt: safeNumber(item?.updatedAt),
    deleted: Boolean(item?.deleted || item?.isDeleted)
  };
}

function matchFilters(item) {
  const q = normalizeText(state.filters.q);
  const typeFilter = normalizeText(state.filters.type);
  const status = state.filters.status;

  const text = normalizeText([item.type, item.title, item.notes, item.date, item.amount].join(" "));
  const isDeleted = Boolean(item.deleted);

  if (status === "active" && isDeleted) return false;
  if (status === "deleted" && !isDeleted) return false;
  if (typeFilter !== "all" && normalizeText(item.type) !== typeFilter) return false;
  if (q && !text.includes(q)) return false;
  return true;
}

function renderSummary() {
  const summary = buildExpenseSummary(state.expenses);
  const active = filterActive(state.expenses);
  const deleted = filterDeleted(state.expenses);

  setText("totalExpenseCount", String(summary.totalExpenses));
  setText("totalExpenseAmount", formatCurrency(summary.totalAmount));
  setText("activeExpenseCount", String(active.length));
  setText("deletedExpenseCount", String(deleted.length));

  const byType = Object.entries(summary.byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([type, amount]) => `<span class="expense-tag"><i class="bi bi-pie-chart"></i>${type}: ${formatCurrency(amount)}</span>`)
    .join(" ");

  const box = qs("expenseTypeSummary");
  if (box) box.innerHTML = byType || '<span class="text-muted">No expense data yet.</span>';
}

function renderList() {
  const list = sortByDate(state.expenses, "createdAt", true).map(normalizeExpense).filter(matchFilters);
  state.filtered = list;

  const tbody = qs("expenseTableBody");
  const cards = qs("expenseCards");
  const empty = qs("expenseEmpty");

  if (cards) {
    cards.innerHTML = list.map((item) => `
      <div class="col-12 col-md-6 col-xl-4">
        <div class="card expense-card h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start gap-2 mb-3">
              <div>
                <div class="fw-bold fs-5">${item.title}</div>
                <div class="text-muted small">${item.type} • ${formatDateTime(item.createdAt || item.updatedAt || Date.now())}</div>
              </div>
              <span class="badge text-bg-primary rounded-pill">${formatCurrency(item.amount)}</span>
            </div>
            <p class="text-muted small mb-3">${item.notes || 'No notes added.'}</p>
            <div class="d-flex flex-wrap gap-2">
              <button class="btn btn-sm btn-outline-primary" data-action="edit" data-id="${item.id}"><i class="bi bi-pencil-square me-1"></i>Edit</button>
              ${item.deleted ? `<button class="btn btn-sm btn-outline-success" data-action="restore" data-id="${item.id}"><i class="bi bi-arrow-counterclockwise me-1"></i>Restore</button>` : `<button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${item.id}"><i class="bi bi-trash3 me-1"></i>Delete</button>`}
            </div>
          </div>
        </div>
      </div>
    `).join("");
  }

  if (tbody) {
    tbody.innerHTML = list.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>
          <div class="fw-bold">${item.title}</div>
          <div class="text-muted small">${item.type}</div>
        </td>
        <td>${formatCurrency(item.amount)}</td>
        <td>${item.date || '-'}</td>
        <td class="text-truncate" style="max-width: 220px;">${item.notes || '-'}</td>
        <td>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-sm btn-outline-primary" data-action="edit" data-id="${item.id}"><i class="bi bi-pencil-square"></i></button>
            ${item.deleted ? `<button class="btn btn-sm btn-outline-success" data-action="restore" data-id="${item.id}"><i class="bi bi-arrow-counterclockwise"></i></button>` : `<button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${item.id}"><i class="bi bi-trash3"></i></button>`}
          </div>
        </td>
      </tr>
    `).join("");
  }

  if (empty) {
    empty.classList.toggle("d-none", list.length > 0);
  }

  setText("expenseResultCount", `${list.length} record${list.length === 1 ? '' : 's'}`);
}

async function loadExpenses() {
  const data = await getExpenses();
  state.expenses = toArray(data).map((item, index) => ({ id: item?.id || item?.key || String(index), ...item }));
  renderSummary();
  renderList();
}

async function handleSubmit(event) {
  event.preventDefault();
  const payload = getFormData();

  if (!payload.title) {
    showToast("Please enter an expense title.", "warning", "Expenses");
    return;
  }

  try {
    if (state.editingId) {
      await updateExpense(state.editingId, payload);
    } else {
      await addExpense(payload);
    }
    showToast(state.editingId ? "Expense updated successfully." : "Expense saved successfully.", "success", "Expenses");
    resetForm();
    await loadExpenses();
  } catch (error) {
    console.error(error);
    showToast("Could not save expense.", "error", "Expenses");
  }
}

function fillForm(itemId) {
  const item = state.expenses.find((expense) => String(expense.id) === String(itemId));
  if (!item) return;

  state.editingId = item.id;
  qs("expenseType").value = item.type || "Other";
  qs("expenseTitle").value = item.title || "";
  qs("expenseAmount").value = item.amount ?? 0;
  qs("expenseDate").value = item.date || new Date().toISOString().slice(0, 10);
  qs("expenseNotes").value = item.notes || "";
  const btn = qs("saveExpenseBtn");
  if (btn) btn.innerHTML = '<i class="bi bi-check2-circle me-2"></i> Update Expense';
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;

  if (action === "edit") {
    fillForm(id);
  }
  if (action === "delete") {
    try {
      await deleteExpense(id);
      showToast("Expense moved to trash.", "delete", "Expenses");
      await loadExpenses();
    } catch (error) {
      console.error(error);
      showToast("Could not delete expense.", "error", "Expenses");
    }
  }
  if (action === "restore") {
    try {
      await restoreExpense(id);
      showToast("Expense restored.", "restore", "Expenses");
      await loadExpenses();
    } catch (error) {
      console.error(error);
      showToast("Could not restore expense.", "error", "Expenses");
    }
  }
}

function bindFilters() {
  qs("expenseSearch")?.addEventListener(
    "input",
    debounce((event) => {
      state.filters.q = event.target.value;
      renderList();
    }, 220)
  );

  qs("filterType")?.addEventListener("change", (event) => {
    state.filters.type = event.target.value;
    renderList();
  });

  qs("filterStatus")?.addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    renderList();
  });

  qs("refreshExpenses")?.addEventListener("click", loadExpenses);
  qs("resetFilters")?.addEventListener("click", () => {
    state.filters = { q: "", type: "all", status: "active" };
    qs("expenseSearch").value = "";
    qs("filterType").value = "all";
    qs("filterStatus").value = "active";
    renderList();
  });
}

function initAuthGuard() {
  const guard = document.createElement("script");
  guard.type = "module";
  guard.textContent = `import { requireAuth } from "./js/auth.js"; requireAuth({ redirectUrl: "login.html" });`;
  document.body.appendChild(guard);
}

function initPage() {
  if (!document.getElementById("expensePage")) return;
  populateTypes();
  setThemeFromStorage();
  bindFilters();
  qs("expenseForm")?.addEventListener("submit", handleSubmit);
  qs("expenseTableBody")?.addEventListener("click", handleTableClick);
  qs("cancelExpenseBtn")?.addEventListener("click", resetForm);
  qs("expenseDate")?.value = new Date().toISOString().slice(0, 10);
  loadExpenses();
  initAuthGuard();
}

document.addEventListener("DOMContentLoaded", initPage);

window.ShopExpenses = {
  loadExpenses,
  resetForm
};
