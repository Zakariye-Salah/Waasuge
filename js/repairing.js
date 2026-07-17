// js/repairing.js
import {
  addRepair,
  updateRepair,
  deleteRepair,
  restoreRepair,
  getRepairs,
  getInvoices,
  getCustomers,
  getPayments,
  addPayment,
  getOnce,
  filterActive,
  filterDeleted,
  sortByDate,
  buildRepairSummary,
  normalizeStatus,
  safeNumber,
  withId
} from "./database.js";
import {
  debounce,
  formatCurrency,
  formatDateTime,
  normalizeText,
  qsa,
  qs,
  setText,
  showToast,
  emptyElement,
  openBootstrapModal,
  closeBootstrapModal,
  setHeaderBadgeCount,
  renderNotificationMenu,
  setPageLoading
} from "./main.js";
import { DEFAULT_SETTINGS, getGeneralSettings, getPrintingSettings, getMessageTemplate, replacePlaceholders } from "./settings-config.js";
import { bindQuickCustomerButton, rebuildCustomerStats, refreshCustomerStatsForRecord, getAllCustomers, getTaggedCustomerList } from "./customer-utils.js";

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

function getReceiptPhoneDigits() {
  return String(getGeneralSettings().phone || DEFAULT_SETTINGS.general.phone).replace(/\D/g, "") || "617125558";
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

function repairLoadingTargets() {
  return [".page-wrap", ".repair-table-shell", ".repair-cards-shell", ".card-shell", ".table-responsive", ".repair-status-board"];
}

const STATUS_ORDER = [
  "device received",
  "inspection started",
  "diagnosis completed",
  "waiting for approval",
  "waiting for parts",
  "repair in progress",
  "quality testing",
  "ready for pickup",
  "delivered"
];

const STATUS_META = {
  "device received": { label: "Device Received", icon: "bi-box-seam", pill: "status-badge-pending", soft: "bg-soft-warning", color: "#f59e0b" },
  "inspection started": { label: "Inspection Started", icon: "bi-search", pill: "status-badge-processing", soft: "bg-soft-primary", color: "#2563eb" },
  "diagnosis completed": { label: "Diagnosis Completed", icon: "bi-clipboard2-pulse", pill: "status-badge-processing", soft: "bg-soft-primary", color: "#3b82f6" },
  "waiting for approval": { label: "Waiting for Approval", icon: "bi-person-check", pill: "status-badge-waiting", soft: "bg-soft-warning", color: "#a855f7" },
  "waiting for parts": { label: "Waiting for Parts", icon: "bi-box-seam", pill: "status-badge-waiting", soft: "bg-soft-warning", color: "#a855f7" },
  "repair in progress": { label: "Repair in Progress", icon: "bi-tools", pill: "status-badge-inrepair", soft: "bg-soft-info", color: "#0ea5e9" },
  "quality testing": { label: "Quality Testing", icon: "bi-check2-circle", pill: "status-badge-completed", soft: "bg-soft-success", color: "#16a34a" },
  "ready for pickup": { label: "Ready for Pickup", icon: "bi-bag-check", pill: "status-badge-completed", soft: "bg-soft-success", color: "#22c55e" },
  delivered: { label: "Delivered", icon: "bi-truck", pill: "status-badge-delivered", soft: "bg-soft-dark", color: "#64748b" }
};
const STATUS_ALIASES = {
  pending: "device received",
  processing: "inspection started",
  "in repair": "repair in progress",
  completed: "quality testing"
};

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

const STATUS_NEXT = {
  "device received": "inspection started",
  "inspection started": "diagnosis completed",
  "diagnosis completed": "waiting for approval",
  "waiting for approval": "waiting for parts",
  "waiting for parts": "repair in progress",
  "repair in progress": "quality testing",
  "quality testing": "ready for pickup",
  "ready for pickup": "delivered",
  delivered: "delivered"
};

const REPAIR_STATUS_BOARD = [
  { key: "device received", labelId: "statusDeviceReceivedLabel", listId: "statusDeviceReceivedList", title: "Device Received", badge: "Received", tone: "bg-soft-warning text-warning-soft" },
  { key: "inspection started", labelId: "statusInspectionStartedLabel", listId: "statusInspectionStartedList", title: "Inspection Started", badge: "Inspecting", tone: "bg-soft-primary text-primary-soft" },
  { key: "diagnosis completed", labelId: "statusDiagnosisCompletedLabel", listId: "statusDiagnosisCompletedList", title: "Diagnosis Completed", badge: "Checked", tone: "bg-soft-primary text-primary-soft" },
  { key: "waiting for approval", labelId: "statusWaitingForApprovalLabel", listId: "statusWaitingForApprovalList", title: "Waiting for Approval", badge: "Approval", tone: "bg-soft-warning text-warning-soft" },
  { key: "waiting for parts", labelId: "statusWaitingPartsLabel", listId: "statusWaitingPartsList", title: "Waiting for Parts", badge: "Parts", tone: "bg-soft-warning text-warning-soft" },
  { key: "repair in progress", labelId: "statusRepairInProgressLabel", listId: "statusRepairInProgressList", title: "Repair in Progress", badge: "Active", tone: "bg-soft-info text-info-soft" },
  { key: "quality testing", labelId: "statusQualityTestingLabel", listId: "statusQualityTestingList", title: "Quality Testing", badge: "Testing", tone: "bg-soft-success text-success-soft" },
  { key: "ready for pickup", labelId: "statusReadyForPickupLabel", listId: "statusReadyForPickupList", title: "Ready for Pickup", badge: "Ready", tone: "bg-soft-success text-success-soft" },
  { key: "delivered", labelId: "statusDeliveredLabel", listId: "statusDeliveredList", title: "Delivered", badge: "Done", tone: "bg-light text-dark" }
];

const REPAIR_PROBLEM_STORE_KEY = "electronicShopRepairProblems";
const REPAIR_SERVICE_STORE_KEY = "electronicShopRepairServices";

function getRepairPaymentWrapper(element) {
  return element?.closest?.('.col-12') || element?.closest?.('.col-md-4') || element?.parentElement || null;
}

function syncRepairPaymentFields(fields = collectRepairModalFields()) {
  if (!fields) return;
  const paymentType = normalizeText(fields.paymentType?.value || 'mobile money');
  const isCash = paymentType === 'cash';
  const providerWrap = getRepairPaymentWrapper(fields.paymentProvider);
  const cashWrap = getRepairPaymentWrapper(fields.cashCurrency);
  const isPayMode = state.formMode === 'pay';

  if (fields.paymentType && !fields.paymentType.value) fields.paymentType.value = 'Mobile Money';
  if (fields.paymentProvider && !fields.paymentProvider.value) fields.paymentProvider.value = 'Evc Plus';
  if (fields.cashCurrency && !fields.cashCurrency.value) fields.cashCurrency.value = 'Somali Shillings';
  if (fields.senderNumber && !fields.senderNumber.value) fields.senderNumber.value = fields.customerPhone?.value || '';

  if (providerWrap) providerWrap.classList.toggle('d-none', isCash);
  if (cashWrap) cashWrap.classList.toggle('d-none', !isCash);
  if (fields.paymentProvider) fields.paymentProvider.disabled = isCash && isPayMode;
  if (fields.cashCurrency) fields.cashCurrency.disabled = (!isCash) && isPayMode;
  if (fields.paymentProvider && isCash) fields.paymentProvider.value = 'Evc Plus';
  if (fields.cashCurrency && !isCash) fields.cashCurrency.value = 'Somali Shillings';
  if (fields.status) fields.status.disabled = true;
}


function setRepairPayModeUI(isPayMode, fields = collectRepairModalFields(), repair = null) {
  if (!fields) return;
  const lockText = (el, lock) => {
    if (!el) return;
    el.readOnly = !!lock;
    if (lock) el.setAttribute('readonly', 'readonly');
    else el.removeAttribute('readonly');
  };
  const lockSelect = (el, lock) => {
    if (!el) return;
    el.disabled = !!lock;
    if (lock) el.setAttribute('disabled', 'disabled');
    else el.removeAttribute('disabled');
  };

  const customerTextFields = [fields.customerName, fields.customerPhone, fields.customerWhatsapp];
  const repairDetailsFields = [fields.deviceName, fields.deviceType, fields.problem, fields.repairParts];
  const summaryFields = [fields.discount, fields.totalAmount, fields.totalPaid, fields.remaining, fields.price, fields.notes];

  customerTextFields.forEach((el) => lockText(el, isPayMode));
  repairDetailsFields.forEach((el) => {
    if (!el) return;
    if (el.tagName === 'SELECT') lockSelect(el, isPayMode);
    else lockText(el, isPayMode);
  });
  summaryFields.forEach((el) => lockText(el, isPayMode));
  lockSelect(fields.status, isPayMode);

  // Payment-only fields remain editable in both modes.
  if (fields.paidAmount) {
    fields.paidAmount.readOnly = false;
    fields.paidAmount.disabled = false;
    fields.paidAmount.removeAttribute('readonly');
    fields.paidAmount.removeAttribute('disabled');
    if (isPayMode && (fields.paidAmount.value === '' || fields.paidAmount.value === '0')) {
      fields.paidAmount.value = '';
    }
  }
  if (fields.senderNumber) {
    fields.senderNumber.readOnly = false;
    fields.senderNumber.disabled = false;
    fields.senderNumber.removeAttribute('readonly');
    fields.senderNumber.removeAttribute('disabled');
  }
  if (fields.paymentType) lockSelect(fields.paymentType, false);
  if (fields.paymentProvider) lockSelect(fields.paymentProvider, false);
  if (fields.cashCurrency) lockSelect(fields.cashCurrency, false);

  const label = document.getElementById('repairPaidAmountLabel');
  if (label) label.textContent = isPayMode ? 'Paid Now' : 'Paid Amount';

  const source = repair || state.activeRepairRecord || null;
  if (source) {
    if (fields.totalPaid) fields.totalPaid.value = formatCurrency(safeNumber(source?.paidAmount ?? 0));
    if (fields.remaining) fields.remaining.value = formatCurrency(Math.max(0, safeNumber(source?.finalTotal ?? source?.price ?? 0) - safeNumber(source?.paidAmount ?? 0)));
  }
}


function setRepairModalTitle(mode = "create") {
  const title = getEl("repairModalTitle");
  const submit = getEl("repairSubmitBtn");
  if (title) {
    title.textContent = mode === "pay" ? "Repair Payment Modal" : mode === "edit" ? "Edit Repair Modal" : "New Repair Modal";
  }
  if (submit) {
    submit.innerHTML = mode === "pay"
      ? '<i class="bi bi-cash-coin me-1"></i> Save Payment'
      : mode === "edit"
        ? '<i class="bi bi-check2-circle me-1"></i> Update Repair'
        : '<i class="bi bi-save2 me-1"></i> Save Repair';
  }
}

function bindRepairPaymentControls() {
  const fields = collectRepairModalFields();
  if (!fields) return;
  const refresh = () => syncRepairPaymentFields(fields);
  [fields.paymentType, fields.paymentProvider, fields.cashCurrency, fields.customerPhone, fields.senderNumber].forEach((el) => {
    if (!el) return;
    el.addEventListener('change', refresh);
    el.addEventListener('input', refresh);
  });
  refresh();
}

function getRepairStatusKey(repair) {
  const candidates = [
    repair?.status,
    repair?.repairStatus,
    repair?.stage,
    repair?.currentStage,
    repair?.currentStatus,
    repair?.workflowStatus,
    repair?.progressStatus,
    repair?.repairStage,
    repair?.repairState
  ];

  for (const candidate of candidates) {
    const text = normalizeText(candidate);
    if (!text) continue;
    const normalized = normalizeRepairStatus(text);
    if (normalized) return normalized;
  }

  return "device received";
}


const DEFAULT_REPAIR_PROBLEMS = parseBulletCatalog(`
A
• App crashes
• Audio not working
• Auto restart
• Auto rotate not working

B
• Back cover broken
• Battery drains fast
• Battery not charging
• Battery swollen
• Bluetooth not working
• Body/frame damaged

C
• Camera not opening
• Camera blurry
• Call not going through
• Charging problem
• Charging port damaged
• Contact / SIM contacts problem

D
• Dead phone
• Display broken
• Display black
• Display white screen
• Dust inside phone

E
• Earpiece not working
• Echo during calls
• Error message on screen

F
• Face unlock not working
• Faulty fingerprint
• Flashlight not working
• Freezing / hanging
• Flex cable damaged

G
• GPS not working
• Ghost touch
• Glass broken
• Game lagging

H
• Headphone jack not working
• Heat / overheating
• Home button not working

I
• IC problem
• Incoming call problem
• Internet not working

J
• Jack port damaged
• Joystick button problem on keypad phones

K
• Keypad buttons not working
• Keyboard not responding

L
• Lagging phone
• Loudspeaker not working
• Logo stuck / boot loop
• Low brightness

M
• Memory card not detected
• Microphone not working
• Motherboard problem
• Mobile not turning on

N
• Network problem
• No signal
• No sound
• No vibration
• No display

O
• Overheating
• Open circuit
• Outgoing call problem

P
• Power button not working
• Pattern / password forgotten
• Phone is slow
• Phone restarts by itself
• Port loose

Q
• QWERTY keyboard problem
• Quick battery drain

R
• Restarting by itself
• Radio not working
• RAM problem
• Rubber keypad worn out

S
• Screen broken
• Screen black
• Screen flickering
• SIM not detected
• Speaker not working
• Slow charging
• Software problem
• Storage full

T
• Touch not working
• Touch delayed
• Torch not working
• Temperature too high

U
• USB port damaged
• Unresponsive buttons
• Update failed

V
• Vibration not working
• Voice not clear
• Virus / malware

W
• Water damage
• Wi-Fi not working
• White screen
• Weak signal

X
• eXcessive heat
• eXtra battery drain

Y
• Yellow screen
• Yellow tint on display

Z
• Zero signal
• Zipper-like lines on screen
`);

const DEFAULT_REPAIR_SERVICES = parseBulletCatalog(`
A
• App reset
• Audio IC repair
• Auto restart check
• Auto rotate sensor repair

B
• Back cover replacement
• Battery replacement
• Bluetooth settings check or repair
• Board repair for body damage

C
• Camera replacement
• Clean charging port
• Change charging cable
• Change charger adapter
• Check SIM contacts

D
• Dead phone repair
• Display replacement
• Disconnect and reconnect flex cables
• Dry and clean dust inside phone

E
• Earpiece replacement
• Echo problem check
• Error software reset

F
• Face unlock repair
• Fingerprint sensor replacement
• Flashlight repair
• Factory reset
• Flex cable replacement

G
• GPS settings check
• Ghost touch repair
• Glass replacement
• Game performance optimization

H
• Headphone jack replacement
• Heat problem check
• Home button repair

I
• IC replacement
• Incoming call settings check
• Internet / data settings fix

J
• Jack port replacement
• Joystick button repair

K
• Keypad button replacement
• Keyboard flex replacement

L
• Lag fix
• Loudspeaker replacement
• Logo stuck repair
• Screen brightness repair

M
• Memory card cleaning or replacement
• Microphone replacement
• Motherboard repair
• Power and charging check

N
• Network IC repair
• Network settings reset
• No signal repair
• No sound repair
• No vibration repair

O
• Overheating check
• Open circuit repair
• Outgoing call settings fix

P
• Power button flex replacement
• Password / pattern reset
• Phone cleanup and speed optimization
• Restart problem repair
• Port tightening or replacement

Q
• QWERTY keypad repair
• Quick battery replacement

R
• Restarting issue fix
• Radio repair
• RAM / software optimization
• Rubber keypad replacement

S
• Screen replacement
• SIM tray replacement
• Speaker replacement
• Slow charging fix
• Software flashing
• Storage cleanup

T
• Touchscreen replacement
• Touch calibration
• Torch repair
• Temperature / overheating check

U
• USB port replacement
• Unresponsive button repair
• Update software

V
• Vibration motor replacement
• Voice clarity check
• Virus removal

W
• Water damage repair
• Wi-Fi repair
• White screen repair
• Weak signal repair

X
• Extra battery drain fix
• Excess heat repair

Y
• Yellow screen correction
• Yellow tint display repair

Z
• Zero signal repair
• Zipper line screen repair
`);

function parseBulletCatalog(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^[A-Z]$/i.test(line))
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlightFilterText(text, query) {
  const source = String(text ?? "");
  const needle = normalizeText(query);
  if (!needle) return escapeHtml(source);
  const normalized = normalizeText(source);
  const index = normalized.indexOf(needle);
  if (index < 0) return escapeHtml(source);

  let start = -1;
  let end = -1;
  let normalizedIndex = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const chNorm = normalizeText(ch);
    const next = normalizedIndex + chNorm.length;
    if (start < 0 && normalizedIndex <= index && index < next) start = i;
    if (start >= 0 && normalizedIndex < index + needle.length && index + needle.length <= next) {
      end = i;
      break;
    }
    normalizedIndex = next;
  }

  if (start < 0 || end < 0) return escapeHtml(source);
  return `${escapeHtml(source.slice(0, start))}<mark>${escapeHtml(source.slice(start, end + 1))}</mark>${escapeHtml(source.slice(end + 1))}`;
}

function getRepairProblemCatalog() {
  const currentProblems = state.repairs.map((repair) => getRepairProblemValue(repair)).filter(Boolean);
  return Array.from(new Set([
    ...getStoredCatalog(REPAIR_PROBLEM_STORE_KEY, DEFAULT_REPAIR_PROBLEMS),
    ...currentProblems
  ])).sort((a, b) => a.localeCompare(b));
}

function getRepairServiceCatalog() {
  const collected = [];
  state.repairs.forEach((repair) => {
    repairPartsToArray(repair?.repairParts || repair?.parts || repair?.services || repair?.partList || "").forEach((item) => collected.push(item));
  });
  return Array.from(new Set(collected)).sort((a, b) => a.localeCompare(b));
}

function setupSearchableFilterDropdown(root, {
  allLabel,
  icon,
  getItems,
  getSelected,
  onSelect
}) {
  if (!root) return null;

  const trigger = root.querySelector("[data-dropdown-trigger]");
  const panel = root.querySelector("[data-dropdown-panel]");
  const search = root.querySelector("[data-dropdown-search]");
  const results = root.querySelector("[data-dropdown-results]");
  const empty = root.querySelector("[data-dropdown-empty]");
  const count = root.querySelector("[data-dropdown-count]");
  let activeIndex = -1;
  let visibleItems = [];
  let isOpen = false;

  const setTriggerValue = (value) => {
    if (trigger) trigger.value = value || allLabel;
  };

  const close = () => {
    isOpen = false;
    root.classList.remove("is-open");
    panel?.classList.add("d-none");
    if (search) search.value = "";
    activeIndex = -1;
    if (results) results.innerHTML = "";
    if (empty) empty.classList.add("d-none");
    setTriggerValue(getSelected?.() || allLabel);
  };

  const choose = (value) => {
    if (!value) return;
    setTriggerValue(value);
    onSelect?.(value);
    close();
  };

  const render = () => {
    if (!results || !search) return;
    const query = search.value.trim();
    const items = (getItems?.() || []).filter((item) => {
      if (!query) return true;
      return normalizeText(item).includes(normalizeText(query));
    });
    visibleItems = items;
    activeIndex = items.length ? Math.min(activeIndex, items.length - 1) : -1;
    if (count) count.textContent = String(items.length);

    if (!items.length) {
      results.innerHTML = "";
      empty?.classList.remove("d-none");
      return;
    }

    empty?.classList.add("d-none");
    results.innerHTML = items.map((item, index) => {
      const active = index === activeIndex ? "active" : "";
      const html = highlightFilterText(item, query);
      return `
        <button type="button" class="dropdown-item searchable-item d-flex align-items-center gap-2 ${active}" data-filter-value="${escapeHtml(item)}">
          <span class="filter-icon"><i class="bi ${icon || "bi-search"}"></i></span>
          <span class="flex-grow-1 text-start">${html}</span>
        </button>
      `;
    }).join("");
  };

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    root.classList.add("is-open");
    panel?.classList.remove("d-none");
    setTriggerValue(getSelected?.() || allLabel);
    activeIndex = -1;
    render();
    window.setTimeout(() => search?.focus(), 0);
  };

  trigger?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isOpen) close(); else open();
  });

  search?.addEventListener("input", () => {
    activeIndex = 0;
    render();
  });

  search?.addEventListener("keydown", (event) => {
    if (!visibleItems.length && event.key !== "Escape") return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, visibleItems.length - 1);
      render();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      render();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (visibleItems[activeIndex]) choose(visibleItems[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });

  results?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-filter-value]");
    if (!btn) return;
    choose(btn.dataset.filterValue);
  });

  const outsideHandler = (event) => {
    if (!isOpen) return;
    if (root.contains(event.target)) return;
    close();
  };
  document.addEventListener("mousedown", outsideHandler);
  document.addEventListener("touchstart", outsideHandler, { passive: true });

  setTriggerValue(getSelected?.() || allLabel);

  return {
    refresh() {
      setTriggerValue(getSelected?.() || allLabel);
      if (isOpen) render();
    },
    setValue(value) {
      setTriggerValue(value || allLabel);
      onSelect?.(value || allLabel);
    },
    close,
    open
  };
}

const repairDropdownInstances = {
  problem: null,
  service: null
};

function refreshRepairDropdowns() {
  repairDropdownInstances.problem?.refresh?.();
  repairDropdownInstances.service?.refresh?.();
}

function groupCatalogItems(items) {
  return items.reduce((acc, item) => {
    const letter = String(item || "").trim().charAt(0).toUpperCase() || "#";
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(item);
    return acc;
  }, {});
}

function displayStatusLabel(status) {
  const key = normalizeRepairStatus(status);
  return STATUS_META[key]?.label || key
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function nextStatusValue(status) {
  const key = normalizeRepairStatus(status);
  return STATUS_NEXT[key] || "inspection started";
}

const VIEW = {
  active: "active",
  trash: "trash"
};

const TYPE_STORE_KEY = "electronicShopRepairTypes";

const state = {
  repairs: [],
  invoices: [],
  customers: [],
  currentView: VIEW.active,
  editId: null,
  pendingDeleteId: null,
  pendingDeleteMode: "soft",
  formSaving: false,
  rowLimit: "5",
  problemFilter: "All Problems",
  serviceFilter: "All Parts / Services",
  trashDateFilter: "today",
  trashRowLimit: "5",
  activeRepairRecord: null
};

function nowValue() {
  return Date.now();
}

function collectRepairModalFields() {
  return {
    customerName: getEl("repairCustomerName"),
    customerPhone: getEl("repairCustomerPhone"),
    customerWhatsapp: getEl("repairCustomerWhatsapp"),
    senderNumber: getEl("repairSenderNumber"),
    paymentType: getEl("repairPaymentType"),
    paymentProvider: getEl("repairPaymentProvider"),
    cashCurrency: getEl("repairCashCurrency"),
    deviceName: getEl("repairDeviceName"),
    deviceType: getEl("repairDeviceType"),
    problem: getEl("repairProblem"),
    repairParts: getEl("repairParts"),
    price: getEl("repairPrice"),
    discount: getEl("repairDiscount"),
    paidAmount: getEl("repairPaidAmount"),
    totalAmount: getEl("repairFinalTotal"),
    totalPaid: getEl("repairTotalPaid"),
    remaining: getEl("repairRemaining"),
    status: getEl("repairStatus"),
    notes: getEl("repairNotes"),
    saveButton: getEl("saveRepairBtn"),
  };
}

function getEl(id) {
  return document.getElementById(id);
}

function getRepairByIdFromState(id) {
  if (!id) return null;
  const key = String(id).trim();
  const source = Array.isArray(state.repairs) ? state.repairs : [];
  return source.find((repair) => String(repair?.id || repair?.repairId || repair?.repairNumber || "") === key) || null;
}

function getRepairCustomerSuggestWrap() {
  return getEl("repairCustomerSuggestions");
}

function hideRepairCustomerSuggestions() {
  const panel = getRepairCustomerSuggestWrap();
  if (!panel) return;
  panel.style.display = "none";
  panel.classList.add("d-none");
  panel.innerHTML = "";
  panel.dataset.open = "false";
}

function setCount(id, value, formatter = (v) => String(v)) {
  const el = getEl(id);
  if (!el) return;
  el.textContent = formatter(value);
}

function normalizeRepairStatus(value) {
  const text = normalizeText(value);
  if (!text) return "device received";
  if (text === "inrepair" || text === "in-repair") return "repair in progress";
  if (text === "waiting" || text === "waitingparts" || text === "waiting-for-parts") return "waiting for parts";
  if (STATUS_META[text]) return text;
  if (STATUS_ALIASES[text] && STATUS_META[STATUS_ALIASES[text]]) return STATUS_ALIASES[text];
  const match = STATUS_ORDER.find((item) => text.includes(item.replace(/\s+/g, "")) || text.includes(item));
  return match || "device received";
}

function repairPartsToArray(value) {
  return String(value || "")
    .split(/\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getRowsLimit(value, fallback = 5) {
  const text = String(value ?? fallback).trim().toLowerCase();
  if (text === "all") return Infinity;
  return Math.max(1, safeNumber(text, fallback));
}

function repairQueryBlob(repair) {
  return normalizeText([
    repair?.customerName,
    repair?.customerPhone,
    repair?.deviceName,
    repair?.deviceType,
    repair?.status,
    repair?.repairParts,
    repair?.parts,
    repair?.notes,
    repair?.repairId,
    repair?.id,
    repair?.createdAt ? formatDateTime(repair.createdAt) : ""
  ].join(" "));
}

function getRepairDateValue(repair) {
  return safeNumber(repair?.deletedAt || repair?.createdAt || repair?.date || repair?.repairDate || 0);
}

function getFormattedParts(repair) {
  const parts = Array.isArray(repair?.parts)
    ? repair.parts
    : repairPartsToArray(repair?.repairParts || repair?.services || repair?.partList || "");

  if (!parts.length) return "No parts listed";
  return parts.slice(0, 3).join(", ") + (parts.length > 3 ? ` +${parts.length - 3} more` : "");
}

function statusMeta(status) {
  const key = normalizeRepairStatus(status);
  return STATUS_META[key] || STATUS_META.pending;
}

function statusBadge(status) {
  const meta = statusMeta(status);
  return `<span class="mini-pill ${meta.pill} ${meta.soft}"><i class="bi ${meta.icon}"></i> ${meta.label}</span>`;
}

function makeRepairNumber(repair) {
  const raw = String(repair?.repairNumber || repair?.repairId || repair?.id || "");
  if (raw) return raw;
  const stamp = new Date(getRepairDateValue(repair) || nowValue());
  return `R-${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, "0")}${String(stamp.getDate()).padStart(2, "0")}-${String(stamp.getHours()).padStart(2, "0")}${String(stamp.getMinutes()).padStart(2, "0")}`;
}

function fieldValue(id) {
  const el = getEl(id);
  return el ? el.value : "";
}

function setFieldValue(id, value) {
  const el = getEl(id);
  if (!el) return;
  el.value = value ?? "";
}

function showRepairModal(id) {
  return openBootstrapModal(id);
}

function hideRepairModal(id) {
  return closeBootstrapModal(id);
}

function prepareNewRepairModal() {
  state.formMode = "create";
  state.editId = null;
  state.activeRepairRecord = null;
  resetForm();
}

function updateRepairNotificationBadge() {
  const active = filterActive(state.repairs);
  const pending = active.filter((repair) => getRepairStatusKey(repair) === "device received").length;
  const processing = active.filter((repair) => getRepairStatusKey(repair) === "inspection started").length;
  const waiting = active.filter((repair) => getRepairStatusKey(repair) === "waiting for parts").length;
  const open = active.filter((repair) => ["device received", "inspection started", "waiting for parts", "repair in progress"].includes(getRepairStatusKey(repair))).length;

  renderNotificationMenu([
    {
      icon: "bi-clock-history",
      iconClass: "text-warning",
      title: `${pending} pending repair${pending === 1 ? "" : "s"}`,
      text: "Waiting for review and first action.",
      href: "#repairCards"
    },
    {
      icon: "bi-gear-wide-connected",
      iconClass: "text-primary",
      title: `${processing} processing repair${processing === 1 ? "" : "s"}`,
      text: "Jobs currently in progress are counted live.",
      href: "#activeRepairsSection"
    },
    {
      icon: "bi-box-seam",
      iconClass: "text-success",
      title: `${waiting} waiting-for-parts repair${waiting === 1 ? "" : "s"}`,
      text: "Repairs waiting on parts are shown here.",
      href: "#repairStatusBoard"
    }
  ], { count: open, title: "Notifications", emptyText: "No repair notifications right now." });
  setHeaderBadgeCount(open, 'button[aria-label="Notifications"] .badge');
}

function getStoredTypes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TYPE_STORE_KEY) || "null");
    if (Array.isArray(parsed) && parsed.length) return parsed.map((item) => String(item || "").trim()).filter(Boolean);
  } catch {}
  return ["Mobile Phone", "Tablet", "Laptop", "Smartwatch", "Other"];
}

function saveStoredTypes(types) {
  const unique = Array.from(new Set((Array.isArray(types) ? types : []).map((item) => String(item || "").trim()).filter(Boolean)));
  localStorage.setItem(TYPE_STORE_KEY, JSON.stringify(unique));
  populateTypeOptions();
}

function populateTypeOptions() {
  const select = getEl("repairDeviceType");
  if (!select) return;
  const current = select.value;
  select.innerHTML = "";
  getStoredTypes().forEach((type) => {
    const option = document.createElement("option");
    option.textContent = type;
    select.appendChild(option);
  });
  if (current) select.value = current;
}

function getStoredCatalog(key, fallbackItems) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    if (Array.isArray(parsed) && parsed.length) {
      return Array.from(new Set(parsed.map((item) => String(item || "").trim()).filter(Boolean)));
    }
  } catch {}
  return Array.isArray(fallbackItems) ? [...fallbackItems] : [];
}

function saveStoredCatalog(key, items) {
  const unique = Array.from(new Set((Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean)));
  localStorage.setItem(key, JSON.stringify(unique));
}

function repairBalance(repair) {
  return Math.max(0, safeNumber(repair?.finalTotal ?? repair?.price ?? 0) - safeNumber(repair?.paidAmount ?? 0));
}

function buildStatusHistory(existingRepair = null, status = "device received", at = nowValue()) {
  const history = { ...(existingRepair?.statusHistory || existingRepair?.statusTimeline || existingRepair?.statusTimestamps || {}) };
  const key = normalizeRepairStatus(status);
  if (!history[key]) history[key] = at;
  const currentIndex = STATUS_ORDER.indexOf(key);
  STATUS_ORDER.slice(0, currentIndex + 1).forEach((stage) => {
    if (!history[stage]) history[stage] = stage === key ? at : history[stage] || existingRepair?.createdAt || at;
  });
  return history;
}

function paymentStatusLabel(repair) {
  const paid = safeNumber(repair?.paidAmount ?? 0);
  const total = Math.max(0, safeNumber(repair?.finalTotal ?? repair?.price ?? 0));
  if (paid <= 0) return "Unpaid";
  if (paid >= total) return "Paid";
  return "Partial";
}

function getRepairProblemValue(repair) {
  return String(repair?.problem || repair?.repairProblem || repair?.issue || repair?.problemOfDevice || repair?.repairParts || "").trim();
}

function getRepairPartsValue(repair) {
  const parts = String(repair?.repairPartsNeeded || repair?.partsNeeded || repair?.parts || repair?.serviceNeeded || "").trim();
  return parts || String(repair?.parts || repair?.services || "").trim();
}

function getRepairSequenceForToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return filterActive(state.repairs).filter((repair) => {
    const created = safeNumber(repair?.createdAt || repair?.updatedAt || repair?.date || 0);
    return created >= start.getTime() && created <= end.getTime();
  }).length + 1;
}

function getRepairQueueNumber(repair) {
  const repairDate = getRepairDateValue(repair);
  if (!repairDate) return getRepairSequenceForToday();
  const day = new Date(repairDate);
  day.setHours(0, 0, 0, 0);
  const dayStart = day.getTime();
  const dayEnd = dayStart + 86399999;
  const list = filterActive(state.repairs)
    .filter((item) => {
      const created = getRepairDateValue(item);
      return created >= dayStart && created <= dayEnd;
    })
    .sort((a, b) => getRepairDateValue(a) - getRepairDateValue(b));
  const id = repair?.id || repair?.repairId || repair?.repairNumber || repair?.customerPhone || "";
  const index = list.findIndex((item) => (item?.id || item?.repairId || item?.repairNumber || item?.customerPhone || "") === id);
  return index >= 0 ? index + 1 : list.length || getRepairSequenceForToday();
}

function formatDayName(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][date.getDay()];
}

function filterCatalog(items, search = "") {
  const list = Array.isArray(items) ? items : [];
  const query = normalizeText(search);
  if (!query) return list;
  return list.filter((item) => normalizeText(item).includes(query));
}


function isActiveRecord(item) {
  return !item?.isDeleted && !item?.deleted;
}

function getActiveRecords(items) {
  return Array.isArray(items) ? items.filter(isActiveRecord) : [];
}

function normalizeRepairCustomerKey(record = {}) {
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

function buildRepairCustomerDirectory() {
  const records = getActiveRecords(state.customers);
  const taggedRecords = records.filter((record) => Boolean(record?.moduleSource || record?.sourcePage));
  const sourceRecords = taggedRecords.length ? taggedRecords : records;
  const map = new Map();
  sourceRecords.forEach((record) => {
    const customerId = String(record?.customerId || record?.id || "").trim();
    const customerName = String(record?.customerName || record?.fullName || record?.name || "").trim();
    const phone = String(record?.customerPhone || record?.phoneNumber || record?.phone || record?.whatsapp || "").trim();
    const key = normalizeRepairCustomerKey(record);
    if (!key || (!customerName && !phone && !customerId)) return;
    const current = map.get(key) || { customerId, customerName, phone: phone || "", whatsapp: String(record?.customerWhatsapp || record?.whatsapp || phone || "").trim(), count: 0, lastActivity: 0 };
    if (customerId) current.customerId = customerId;
    if (customerName) current.customerName = customerName;
    if (phone) current.phone = phone;
    if (record?.customerWhatsapp || record?.whatsapp) current.whatsapp = String(record?.customerWhatsapp || record?.whatsapp || current.whatsapp || phone || "").trim();
    current.count += 1;
    current.lastActivity = Math.max(current.lastActivity, safeNumber(record?.updatedAt ?? record?.createdAt ?? 0));
    map.set(key, current);
  });
  return [...map.values()].sort((a, b) => b.lastActivity - a.lastActivity || b.count - a.count);
}

function getRepairCustomerDirectoryMatch(name, phone, whatsapp) {
  const directory = buildRepairCustomerDirectory();
  const targetName = normalizeText(name);
  const targetPhoneDigits = String(phone || whatsapp || "").replace(/\D/g, "");
  return directory.find((item) => {
    const itemName = normalizeText(item?.customerName || "");
    const itemPhoneDigits = String(item?.phone || item?.whatsapp || "").replace(/\D/g, "");
    return (targetPhoneDigits && itemPhoneDigits && itemPhoneDigits === targetPhoneDigits) || (targetName && itemName && itemName === targetName);
  }) || null;
}

function buildCustomerContactMessage(summary) {
  return [
    `${getGeneralSettings().shopName || DEFAULT_SETTINGS.general.shopName}`,
    `Customer: ${summary?.customerName || "Customer"}`,
    `Phone: ${summary?.phone || "—"}`,
    summary?.invoiceCount != null ? `Invoices: ${summary.invoiceCount}` : "",
    summary?.repairCount != null ? `Repairs: ${summary.repairCount}` : "",
    summary?.totalSpent ? `Total all: ${summary.totalSpent}` : "",
    summary?.totalPaid ? `Total paid: ${summary.totalPaid}` : "",
    summary?.totalRemaining ? `Total remaining: ${summary.totalRemaining}` : "",
    summary?.historyCount ? `History items: ${summary.historyCount}` : "",
    summary?.lastVisit ? `Last visit: ${summary.lastVisit}` : "",
    `Shop Phone: ${getGeneralSettings().phone || DEFAULT_SETTINGS.general.phone}`, 
    `Track your ID in the website: ${getPublicWebsiteUrl()}`,
    ` https://waasuge-electricity.netlify.app/`,
  ].filter(Boolean).join("\n");
}

function renderRepairPicker(container, items, selectedValues = [], onPick = () => {}, options = {}) {
  if (!container) return;
  const limit = options.limit ?? 10;
  const selectedSet = new Set((Array.isArray(selectedValues) ? selectedValues : [selectedValues]).map((item) => normalizeText(item)).filter(Boolean));
  const list = Array.isArray(items) ? items.slice(0, limit) : [];
  const panel = container.closest(".repair-picker")?.querySelector(options.panelSelector || ".repair-picker-panel");
  const emptyEl = container.closest(".repair-picker")?.querySelector(options.emptySelector || ".repair-picker-empty");
  const countEl = container.closest(".repair-picker")?.querySelector(options.countSelector || ".repair-picker-count");
  if (countEl) countEl.textContent = String(items.length);
  if (!list.length) {
    container.innerHTML = "";
    if (emptyEl) emptyEl.classList.remove("d-none");
    if (options.openPanel !== false && panel) panel.classList.remove("d-none");
    return;
  }
  if (emptyEl) emptyEl.classList.add("d-none");
  container.innerHTML = list.map((item) => {
    const active = selectedSet.has(normalizeText(item));
    return `
      <button type="button" class="repair-picker-item btn ${active ? 'btn-primary text-white' : 'btn-outline-primary'}" data-picker-value="${String(item).replace(/"/g, '&quot;')}">
        <i class="bi bi-check2-circle me-2 ${active ? '' : 'opacity-50'}"></i>${escapeHtml(item)}
      </button>`;
  }).join("");
  container.querySelectorAll("[data-picker-value]").forEach((btn) => {
    btn.addEventListener("click", () => onPick(btn.dataset.pickerValue));
  });
  if (options.openPanel !== false && panel) panel.classList.remove("d-none");
}

function closeRepairPicker(panelId) {
  const panel = getEl(panelId);
  if (panel) panel.classList.add("d-none");
}

function setRepairProblem(value) {
  setFieldValue("repairProblem", value);
}

function setRepairService(value) {
  const currentParts = new Set(String(getEl("repairParts")?.value || "").split(",").map((s) => s.trim()).filter(Boolean));
  const normalized = String(value || "").trim();
  if (!normalized) return;
  if (currentParts.has(normalized)) currentParts.delete(normalized); else currentParts.add(normalized);
  setFieldValue("repairParts", Array.from(currentParts).join(", "));
}

function updateProblemList() {
  const searchEl = getEl("repairProblemSearch");
  const panel = getEl("repairProblemPanel");
  const list = getEl("repairProblemList");
  const empty = getEl("repairProblemEmpty");
  const count = getEl("repairProblemCount");
  const search = searchEl?.value || "";
  const shouldOpen = document.activeElement === searchEl || Boolean(search.trim());
  const items = filterCatalog(getStoredCatalog(REPAIR_PROBLEM_STORE_KEY, DEFAULT_REPAIR_PROBLEMS), search);
  const current = getEl("repairProblem")?.value || "";
  if (count) count.textContent = String(items.length);
  if (!items.length) {
    if (list) list.innerHTML = "";
    if (empty) empty.classList.remove("d-none");
    if (shouldOpen) panel?.classList.remove("d-none"); else panel?.classList.add("d-none");
    return;
  }
  if (empty) empty.classList.add("d-none");
  renderRepairPicker(list, items, current, (value) => {
    setRepairProblem(value);
    if (searchEl) searchEl.value = "";
    closeRepairPicker("repairProblemPanel");
    showToast(`Problem selected: ${value}`, "info", "Repair");
  }, { limit: 10, countSelector: "#repairProblemCount", emptySelector: "#repairProblemEmpty", panelSelector: "#repairProblemPanel", openPanel: shouldOpen });
  if (!shouldOpen) panel?.classList.add("d-none");
}

function updateServiceList() {
  const searchEl = getEl("repairServiceSearch");
  const panel = getEl("repairServicePanel");
  const list = getEl("repairServiceList");
  const empty = getEl("repairServiceEmpty");
  const count = getEl("repairServiceCount");
  const search = searchEl?.value || "";
  const shouldOpen = document.activeElement === searchEl || Boolean(search.trim());
  const current = String(getEl("repairParts")?.value || "").split(",").map((s) => s.trim()).filter(Boolean);
  const items = filterCatalog(getStoredCatalog(REPAIR_SERVICE_STORE_KEY, DEFAULT_REPAIR_SERVICES), search);
  if (count) count.textContent = String(items.length);
  if (!items.length) {
    if (list) list.innerHTML = "";
    if (empty) empty.classList.remove("d-none");
    if (shouldOpen) panel?.classList.remove("d-none"); else panel?.classList.add("d-none");
    return;
  }
  if (empty) empty.classList.add("d-none");
  renderRepairPicker(list, items, current, (value) => {
    setRepairService(value);
    if (searchEl) searchEl.value = "";
    closeRepairPicker("repairServicePanel");
    updateServiceList();
  }, { limit: 10, countSelector: "#repairServiceCount", emptySelector: "#repairServiceEmpty", panelSelector: "#repairServicePanel", openPanel: shouldOpen });
  if (!shouldOpen) panel?.classList.add("d-none");
}

function addCustomProblem() {
  return;
}

function addCustomService() {
  return;
}

function normalizeRepairPhone(phone) {
  return String(phone ?? "").replace(/[^\d+]/g, "");
}

function getRepairPaymentStatus(repair) {
  const finalTotal = Math.max(0, safeNumber(repair?.finalTotal ?? repair?.price ?? 0));
  const paid = Math.max(0, safeNumber(repair?.paidAmount ?? 0));
  if (paid <= 0) return { label: "Unpaid", key: "unpaid", className: "payment-status--unpaid" };
  if (paid >= finalTotal && finalTotal > 0) return { label: "Paid", key: "paid", className: "payment-status--paid" };
  if (paid > 0) return { label: "Partial", key: "partial", className: "payment-status--partial" };
  return { label: "Unpaid", key: "unpaid", className: "payment-status--unpaid" };
}

function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}
window.digitsOnly = digitsOnly;
globalThis.digitsOnly = digitsOnly;

function openShareLink(repair, channel = "whatsapp") {
  const message = buildRepairShareMessage(repair);
  const targetPhone = repair?.customerWhatsapp || repair?.customerPhone || repair?.phone || "";
  const phoneDigits = digitsOnly(targetPhone);
  if (!phoneDigits) {
    showToast("Customer phone number is missing", "warning", "Repair");
    return;
  }
  const encoded = encodeURIComponent(message);
  const url = channel === "sms"
    ? `sms:${phoneDigits}?body=${encoded}`
    : `https://wa.me/${phoneDigits}?text=${encoded}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function buildRepairShareMessage(repair) {
  const name = repair?.customerName || "Saaxiib";
  const device = repair?.deviceName || repair?.device || "device";
  const status = statusMeta(repair?.status).label;
  const total = formatCurrency(repair?.finalTotal ?? repair?.price ?? 0);
  const paid = formatCurrency(repair?.paidAmount ?? 0);
  const balance = formatCurrency(repairBalance(repair));
  const repairId = makeRepairNumber(repair);
  if (normalizeText(status) === "completed" || normalizeText(status) === "delivered") {
    return `Asc ${name}
Repair ID: ${repairId}
Device: ${device}
Status: ${status}
Total: ${total}
Bixisay: ${paid}
${getGeneralSettings().shopName || DEFAULT_SETTINGS.general.shopName}:(${getGeneralSettings().phone || DEFAULT_SETTINGS.general.phone})`;
  }
  return `Asc ${name}
Repair ID: ${repairId}
Device: ${device}
Status: ${status}
Total: ${total}
Bixisay: ${paid}
Haraaga: ${balance}
${getGeneralSettings().shopName || DEFAULT_SETTINGS.general.shopName}:(${getGeneralSettings().phone || DEFAULT_SETTINGS.general.phone})`;
}


function getRepairRatingValue(repair) {
  const raw = safeNumber(
    repair?.rating ?? repair?.ratingValue ?? repair?.stars ?? repair?.customerRating ?? repair?.reviewRating ?? repair?.rate,
    0
  );
  return Math.max(0, Math.min(5, raw));
}

function repairRatingText(repair) {
  const rating = getRepairRatingValue(repair);
  if (!rating) return "No rating yet";
  const rounded = Math.round(rating * 2) / 2;
  return `${rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)}/5 rated`;
}

function renderRatingStars(repair) {
  const rating = getRepairRatingValue(repair);
  const filled = Math.round(rating);
  return Array.from({ length: 5 }, (_, index) => {
    const active = index < filled;
    return `<i class="bi ${active ? "bi-star-fill text-warning" : "bi-star text-muted"}"></i>`;
  }).join("");
}

function animateTrackingPercent(targetEl, endValue, duration = 900) {
  if (!targetEl) return;
  const start = 0;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const startAt = performance.now();
  const tick = (now) => {
    const progress = Math.min(1, (now - startAt) / duration);
    const value = Math.round(start + (endValue - start) * easeOutCubic(progress));
    targetEl.textContent = `${value}% completed`;
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function loadVisitorRatingSummary(repair) {
  const target = String(repair?.repairId ?? repair?.repairNumber ?? repair?.id ?? "").trim();
  if (!target) return { average: 0, count: 0, latest: null };
  const data = await getOnce("repairRatings").catch(() => null);
  const list = Array.isArray(data) ? data : data && typeof data === "object" ? Object.values(data) : [];
  const filtered = list.filter((item) => {
    const ids = [item?.repairId, item?.repairNumber, item?.trackingId, item?.id].map((value) => String(value ?? "").trim());
    return ids.includes(target);
  });
  if (!filtered.length) return { average: 0, count: 0, latest: null };
  const ratings = filtered.map((item) => Number(item?.rating || 0)).filter((n) => n > 0);
  const average = ratings.length ? ratings.reduce((sum, n) => sum + n, 0) / ratings.length : 0;
  const latest = filtered.slice().sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0))[0] || null;
  return { average, count: filtered.length, latest };
}


function renderTrackingModal(repair) {
  const body = getEl("repairTrackingModalBody");
  const title = getEl("repairTrackingModalTitle");
  const footer = getEl("repairTrackingModalFooter");
  if (!body || !repair) return;

  const statusIndex = Math.max(0, STATUS_ORDER.indexOf(normalizeRepairStatus(repair.status)));
  const dateValue = repair.createdAt || repair.updatedAt || Date.now();
  const progressPercent = STATUS_ORDER.length > 1 ? Math.round((statusIndex / (STATUS_ORDER.length - 1)) * 100) : 0;
  const ratingText = repairRatingText(repair);
  const totalValue = formatCurrency(repair.finalTotal ?? repair.price ?? 0);
  const paidValue = formatCurrency(repair.paidAmount ?? 0);
  const balanceValue = formatCurrency(repairBalance(repair));
  const currentStatus = displayStatusLabel(repair.status);
  const paymentStatus = getRepairPaymentStatus(repair);
  const priceValue = formatCurrency(repair.price ?? 0);
  const discountValue = formatCurrency(repair.discount ?? 0);
  const statusName = normalizeRepairStatus(repair.status);
  const warrantyStatus = String(repair?.warrantyStatus || "No warranty").trim();
  const warrantyExpiry = repair?.warrantyExpiry ? formatDateTime(repair.warrantyExpiry) : "";
  const warrantyDays = safeNumber(repair?.warrantyDays, 0);
  const warrantyInfo = warrantyDays > 0
    ? `<div class="tracking-info-box mt-3 p-3"><div class="fw-semibold mb-1">Warranty</div><div class="small text-muted">Days: ${warrantyDays} • Start: ${repair?.warrantyStart ? formatDateTime(repair.warrantyStart) : "—"} • Expiry: ${warrantyExpiry || "—"}</div><div class="mt-2"><span class="badge ${warrantyStatus === "Active" ? "bg-soft-success text-success-soft" : warrantyStatus === "Expires Soon" ? "bg-soft-warning text-warning-soft" : warrantyStatus === "Expired" ? "bg-soft-danger text-danger-soft" : "bg-light text-dark"}">${escapeHtml(warrantyStatus)}</span></div></div>`
    : "";

  const statusSteps = STATUS_ORDER.map((status, index) => {
    const meta = statusMeta(status);
    const active = index === statusIndex;
    const done = index < statusIndex;
    return `
      <div class="tracking-step ${done ? "done" : ""} ${active ? "active" : ""}" style="--step-delay:${index * 90}ms; --step-color:${meta.color};">
        <div class="tracking-dot" style="background:${active ? `${meta.color}22` : done ? `${meta.color}1d` : 'rgba(148,163,184,0.12)'}; color:${meta.color};">
          <i class="bi ${meta.icon}"></i>
        </div>
        <div class="tracking-step-content">
          <div class="fw-semibold">${displayStatusLabel(status)}</div>
          <small class="text-muted">${done ? "Completed" : active ? "Current stage" : "Waiting"}</small>
        </div>
      </div>`;
  }).join("");

  const statusDots = STATUS_ORDER.map((status, index) => {
    const meta = statusMeta(status);
    const active = index === statusIndex;
    const done = index < statusIndex;
    const completedPct = STATUS_ORDER.length > 1 ? Math.round((index / (STATUS_ORDER.length - 1)) * 100) : 0;
    return `
      <div class="tracking-status-dot ${done ? "done" : ""} ${active ? "active" : ""}">
        <div class="dot" style="background:${active ? meta.color : done ? meta.color : 'rgba(148,163,184,.35)'}; box-shadow:${active ? `0 0 0 6px ${meta.color}22` : 'none'};"></div>
        <div class="tracking-status-label">${displayStatusLabel(status)}</div>
        <small class="tracking-status-pct">${completedPct}%</small>
      </div>`;
  }).join("");

  const repairId = makeRepairNumber(repair);
  if (title) title.textContent = `Tracking: ${repair.customerName || "Customer"} • Repair ID: ${repairId}`;

  body.innerHTML = `
    <div class="tracking-premium-shell">
      <div class="tracking-brand-card">
        <div class="tracking-brand-top tracking-brand-top--compact">
          <div class="tracking-brand-main">
            <div class="tracking-logo">
              <i class="bi bi-tools"></i>
            </div>
            <div class="tracking-brand-copy">
              <div class="text-uppercase small fw-bold text-primary mb-1">${getGeneralSettings().shopName || DEFAULT_SETTINGS.general.shopName}</div>
              <h3 class="fw-bold mb-1">Tracking: ${repair.customerName || "Unknown customer"}</h3>
              <div class="tracking-meta-line">
                <span><i class="bi bi-hash"></i> Repair ID: ${repairId}</span>
                <span><i class="bi bi-telephone"></i> ${repair.customerPhone || "No phone"}</span>
                <span><i class="bi bi-phone"></i> ${repair.deviceName || "Unknown device"}</span>
              </div>
            </div>
          </div>
          <div class="tracking-total-box">
            <div class="small text-muted">Final Total</div>
            <div class="display-6 fw-bold">${totalValue}</div>
            <div class="small text-muted">${paymentStatus.label}</div>
          </div>
        </div>

        <div class="tracking-contact-grid mt-4">
          <div class="tracking-contact-item"><i class="bi bi-telephone me-2"></i><span>${repair.customerPhone || "No phone"}</span></div>
          <div class="tracking-contact-item"><i class="bi bi-calendar3 me-2"></i><span>${formatDateTime(dateValue) || "Today"}</span></div>
          <div class="tracking-contact-item"><i class="bi bi-envelope me-2"></i><span>waasugeelectronics@gmail.com</span></div>
          <div class="tracking-contact-item"><i class="bi bi-clock me-2"></i><span>Sat–Thu • 8:00 AM – 8:00 PM</span></div>
        </div>
      </div>

      <div class="row g-3 mt-1">
        <div class="col-12">
          <div class="tracking-info-card h-100">
            <div class="section-title mb-3">Repair details</div>
            <div class="tracking-detail-grid">
              <div class="tracking-detail-item"><span>Repair Id:</span> <strong>${repairId}</strong></div>
              <div class="tracking-detail-item"><span>Customer:</span> <strong>${repair.customerName || "Not set"}</strong></div>
              <div class="tracking-detail-item"><span>Phone:</span> <strong>${repair.customerPhone || "Not set"}</strong></div>
              <div class="tracking-detail-item"><span>Device:</span> <strong>${repair.deviceName || "Not set"}</strong></div>
              <div class="tracking-detail-item tracking-detail-item--wide"><span>Problem:</span> <strong>${getRepairProblemValue(repair) || "Not set"}</strong></div>
              <div class="tracking-detail-item tracking-detail-item--wide"><span>Parts / Service:</span> <strong>${getRepairPartsValue(repair) || "Not set"}</strong></div>
              <div class="tracking-detail-item"><span>Status:</span><strong>${currentStatus}</strong></div>
              <div class="tracking-detail-item"><span>Price:</span><strong>${priceValue}</strong></div>
              <div class="tracking-detail-item"><span>Discount:</span><strong class="text-warning">${discountValue}</strong></div>
              <div class="tracking-detail-item"><span>Final Total:</span><strong class="text-primary">${totalValue}</strong></div>
              ${warrantyInfo}
              <div class="tracking-detail-item"><span>Paid:</span><strong class="text-success">${paidValue}</strong></div>
              <div class="tracking-detail-item"><span>Balance:</span><strong class="${repairBalance(repair) > 0 ? "text-danger" : "text-success"}">${balanceValue}</strong></div>
              <div class="tracking-detail-item tracking-detail-item--wide">
                <span>Customer rating:</span>
                <strong class="d-flex align-items-center gap-2 justify-content-end flex-wrap">
                  <span>${ratingText}</span>
                  <span class="tracking-stars" aria-label="Repair rating">${renderRatingStars(repair)}</span>
                </strong>
              </div>
              <div class="tracking-detail-item tracking-detail-item--wide">
                <span>Visitor rating:</span>
                <strong class="d-flex align-items-center gap-2 justify-content-end flex-wrap">
                  <span data-visitor-rating-summary>Loading...</span>
                  <span class="tracking-stars" data-visitor-rating-stars aria-label="Visitor rating"></span>
                </strong>
              </div>
              <div class="tracking-detail-item tracking-detail-item--wide">
                <span>Visitor note:</span>
                <strong data-visitor-rating-comment>Loading...</strong>
              </div>
            </div>
            <div class="small text-muted mt-3">${repair.ratingUpdatedAt ? `Last updated ${formatDateTime(repair.ratingUpdatedAt)}` : "No rating recorded yet."}</div>
            <div class="mt-3 small text-muted">${repair.notes || "No notes recorded for this repair."}</div>
          </div>
        </div>

        <div class="col-12">
          <div class="tracking-info-card h-100">
            <div class="section-title mb-3">Progress</div>
            <div class="tracking-progress-wrap">
              <div class="tracking-progress-top">
                <div>
                  <div class="small text-muted text-uppercase fw-bold">Current stage</div>
                  <div class="fw-bold tracking-progress-count"><strong class="percent-ticker" data-tracking-progress-percent>0%</strong><span>completed</span></div>
                </div>
                <div class="mini-pill bg-soft-primary text-primary-soft"><i class="bi bi-star-fill"></i> ${ratingText}</div>
              </div>
              <div class="tracking-progress-bar"><span style="width: 0%"></span></div>
              <div class="tracking-status-dots">${statusDots}</div>
            </div>
          </div>
        </div>

        <div class="col-12">
          <div class="tracking-info-card h-100">
            <div class="section-title mb-3">Status timeline</div>
            <div class="tracking-steps premium">
              ${statusSteps}
            </div>
          </div>
        </div>
      </div>

      <div class="tracking-footer mt-4">
        <div class="tracking-footer-copy">
          <div><i class="bi bi-shop me-2"></i>${getGeneralSettings().shopName || DEFAULT_SETTINGS.general.shopName}</div>
          <div><i class="bi bi-telephone me-2"></i>${getGeneralSettings().phone || DEFAULT_SETTINGS.general.phone}</div>
          <div><i class="bi bi-geo-alt me-2"></i>Service center and repair desk</div>
        </div>
      </div>
      <button class="repair-whatsapp-float tracking-modal-whatsapp-float border-0 position-sticky ms-auto mt-3 d-flex align-items-center justify-content-center" style="bottom:1rem;" type="button" data-action="whatsapp" data-id="${repair.id || repair.repairId || ""}" title="Chat on WhatsApp" aria-label="Chat on WhatsApp">
        <i class="bi bi-whatsapp"></i>
      </button>
    </div>`;
  if (footer) {
    const id = repair.id || repair.repairId || "";
    const paid = safeNumber(repair?.paidAmount ?? 0);
    const total = Math.max(0, safeNumber(repair?.finalTotal ?? repair?.price ?? 0));
    const isPaid = paid >= total && total > 0;
    const markLabel = isPaid ? "Return" : "Mark Paid";
    const markIcon = isPaid ? "bi-arrow-counterclockwise" : "bi-check2-circle";
    footer.innerHTML = `
      <button type="button" class="btn btn-outline-primary rounded-4" data-action="edit" data-id="${id}"><i class="bi bi-pencil-square me-1"></i>Edit</button>
      <button type="button" class="btn btn-outline-danger rounded-4" data-action="delete" data-id="${id}"><i class="bi bi-trash3 me-1"></i>Delete</button>
      <button type="button" class="btn btn-outline-success rounded-4" data-action="whatsapp" data-id="${id}"><i class="bi bi-whatsapp me-1"></i>WhatsApp</button>
      <button type="button" class="btn btn-outline-secondary rounded-4" data-action="sms" data-id="${id}"><i class="bi bi-chat-dots me-1"></i>SMS</button>
      <button type="button" class="btn btn-outline-success rounded-4" data-action="pay" data-id="${id}"><i class="bi bi-cash-coin me-1"></i>Pay</button>
      <button type="button" class="btn btn-outline-warning rounded-4" data-action="payment-toggle" data-id="${id}"><i class="bi ${markIcon} me-1"></i>${markLabel}</button>
      <button type="button" class="btn btn-outline-info rounded-4" data-action="history" data-id="${id}"><i class="bi bi-clock-history me-1"></i>History</button>
      <button type="button" class="btn btn-outline-secondary rounded-4" data-action="print" data-id="${id}"><i class="bi bi-printer me-1"></i>Print</button>
      <button type="button" class="btn btn-outline-dark rounded-4" data-action="status-next" data-id="${id}"><i class="bi bi-arrow-right-circle me-1"></i>Next</button>
    `;
  }

  const percentNode = body.querySelector("[data-tracking-progress-percent]");
  const bar = body.querySelector(".tracking-progress-bar > span");
  requestAnimationFrame(() => {
    if (bar) bar.style.width = `${progressPercent}%`;
    animateTrackingPercent(percentNode, progressPercent, 900);
  });

  loadVisitorRatingSummary(repair)
    .then((summary) => {
      const summaryNode = body.querySelector("[data-visitor-rating-summary]");
      const starsNode = body.querySelector("[data-visitor-rating-stars]");
      const commentNode = body.querySelector("[data-visitor-rating-comment]");
      if (summaryNode) {
        summaryNode.textContent = summary.count ? `${summary.average.toFixed(1)}/5 • ${summary.count}` : "No visitor rating yet";
      }
      if (starsNode) {
        starsNode.innerHTML = summary.count
          ? Array.from({ length: 5 }, (_, i) => `<i class="bi ${i < Math.round(summary.average) ? "bi-star-fill text-warning" : "bi-star text-muted"}"></i>`).join("")
          : `<span class="text-muted">No rating yet</span>`;
      }
      if (commentNode) {
        commentNode.textContent = summary.latest?.comment?.trim() || "No visitor note yet.";
      }
    })
    .catch((error) => console.warn("Could not load visitor ratings:", error));
}

function syncRepairStatus() {

  const price = Math.max(0, safeNumber(fieldValue("repairPrice")));
  const discount = Math.max(0, safeNumber(fieldValue("repairDiscount")));
  const total = Math.max(price - discount, 0);
  const paidEl = getEl("repairPaidAmount");
  const statusEl = getEl("repairStatus");
  const totalEl = getEl("repairFinalTotal");
  const paidValue = Math.max(0, safeNumber(paidEl?.value, 0));
  const paid = Math.min(total, paidValue);

  if (totalEl) totalEl.value = String(total);
  if (paidEl && paidValue !== paid) {
    paidEl.value = String(paid);
    showToast("Paid amount cannot be bigger than total amount.", "warning", "Repair");
  }

  if (statusEl) {
    statusEl.value = paid <= 0 ? "Unpaid" : (paid >= total ? "Paid" : "Partial");
  }
}

function collectFormData() {
  const existingRepair = state.editId ? getRepairByIdFromState(state.editId) : null;
  const price = state.formMode === 'pay' ? Math.max(0, safeNumber(existingRepair?.finalTotal ?? existingRepair?.price ?? 0)) : Math.max(0, safeNumber(fieldValue("repairPrice")));
  const discount = state.formMode === 'pay' ? Math.max(0, safeNumber(existingRepair?.discount ?? 0)) : Math.max(0, safeNumber(fieldValue("repairDiscount")));
  const finalTotal = Math.max(price - discount, 0);
  const previousPaid = safeNumber(existingRepair?.paidAmount ?? 0);
  const paidNow = Math.max(0, safeNumber(fieldValue("repairPaidAmount")));
  const paidAmount = state.editId ? Math.min(finalTotal, previousPaid + paidNow) : Math.min(finalTotal, paidNow);
  const remaining = Math.max(0, finalTotal - paidAmount);
  const partsText = fieldValue("repairParts");
  const parts = repairPartsToArray(partsText);
  const status = existingRepair ? normalizeRepairStatus(existingRepair.status) : "pending";
  const customerPhone = fieldValue("repairCustomerPhone").trim();
  const customerWhatsapp = fieldValue("repairCustomerWhatsapp").trim() || customerPhone;
  const senderNumber = fieldValue("repairSenderNumber").trim() || customerPhone;
  const paymentType = fieldValue("repairPaymentType") || "Mobile Money";
  const paymentProvider = fieldValue("repairPaymentProvider") || "Evc Plus";
  const cashCurrency = fieldValue("repairCashCurrency") || "Somali Shillings";
  const customerMatch = getRepairCustomerDirectoryMatch(fieldValue("repairCustomerName"), customerPhone, customerWhatsapp);

  return {
    customerId: customerMatch?.customerId || existingRepair?.customerId || null,
    customerName: fieldValue("repairCustomerName").trim(),
    customerPhone,
    customerWhatsapp,
    senderNumber,
    paymentType,
    paymentProvider,
    cashCurrency,
    deviceName: fieldValue("repairDeviceName").trim(),
    deviceType: fieldValue("repairDeviceType").trim(),
    problem: fieldValue("repairProblem").trim(),
    repairParts: partsText.trim(),
    parts,
    price,
    discount,
    finalTotal,
    status,
    notes: fieldValue("repairNotes").trim(),
    repairDate: fieldValue("repairDate") || null,
    warrantyDays: Math.max(0, safeNumber(fieldValue("repairWarrantyDays"))),
    warrantyStart: fieldValue("repairWarrantyStart") || null,
    warrantyExpiry: fieldValue("repairWarrantyExpiry") || null,
    warrantyStatus: fieldValue("repairWarrantyStatus") || "No warranty",
    paidAmount,
    totalPaid: paidAmount,
    remaining,
    paidNow: state.editId ? paidNow : paidNow,
    paymentUpdatedAt: nowValue(),
    updatedAt: nowValue(),
    isDeleted: false,
    deleted: false
  };
}

function resetForm() {
  const form = getEl("repairForm");
  if (form) form.reset();
  state.editId = null;
  state.activeRepairRecord = null;
  state.formMode = "create";
  setRepairModalTitle("create");
  setFieldValue("repairStatus", "Unpaid");
  setFieldValue("repairCustomerWhatsapp", "");
  setFieldValue("repairSenderNumber", "");
  setFieldValue("repairPaymentType", "Mobile Money");
  setFieldValue("repairPaymentProvider", "Evc Plus");
  setFieldValue("repairCashCurrency", "Somali Shillings");
  setFieldValue("repairProblem", "");
  setFieldValue("repairParts", "");
  setFieldValue("repairDate", new Date().toISOString().slice(0, 10));
  setFieldValue("repairWarrantyDays", "0");
  setFieldValue("repairWarrantyStart", new Date().toISOString().slice(0, 10));
  setFieldValue("repairWarrantyExpiry", "");
  setFieldValue("repairWarrantyStatus", "No warranty");
  setFieldValue("repairFinalTotal", "0");
  setFieldValue("repairPaidAmount", "0");
  setFieldValue("repairRecordId", "");
  setFieldValue("repairRemaining", "0");

  const fields = collectRepairModalFields();
  if (fields) {
    setRepairPayModeUI(false, fields, null);
  }
  const submit = getEl("repairSubmitBtn");
  if (submit) {
    submit.disabled = false;
    submit.innerHTML = '<i class="bi bi-save2 me-1"></i> Save Repair';
  }
  updateFinalTotalPreview();
}

function fillForm(repair) {
  const fields = collectRepairModalFields();
  if (!fields) return;
  const record = repair || {};
  const repairId = record.id || record.repairId || record.repairNumber || "";
  const customerName = record.customerName || "";
  const customerPhone = record.customerPhone || record.phone || "";
  const customerWhatsapp = record.customerWhatsapp || record.whatsapp || customerPhone;
  const senderNumber = record.senderNumber || record.paymentSenderNumber || customerPhone;
  const paymentType = record.paymentType || "Mobile Money";
  const paymentProvider = record.paymentProvider || "Evc Plus";
  const cashCurrency = record.cashCurrency || "Somali Shillings";
  const price = Math.max(0, safeNumber(record.price ?? record.finalTotal ?? 0));
  const discount = Math.max(0, safeNumber(record.discount ?? 0));
  const paidAmount = Math.max(0, safeNumber(record.paidAmount ?? 0));
  const remaining = Math.max(0, safeNumber(record.finalTotal ?? record.price ?? price) - paidAmount);

  state.editId = repairId || state.editId;
  state.activeRepairRecord = record;

  setFieldValue("repairRecordId", repairId);
  setFieldValue("repairCustomerName", customerName);
  setFieldValue("repairCustomerPhone", customerPhone);
  setFieldValue("repairCustomerWhatsapp", customerWhatsapp);
  setFieldValue("repairSenderNumber", senderNumber);
  setFieldValue("repairPaymentType", paymentType);
  setFieldValue("repairPaymentProvider", paymentProvider);
  setFieldValue("repairCashCurrency", cashCurrency);
  setFieldValue("repairDeviceName", record.deviceName || record.deviceModel || "");
  setFieldValue("repairDeviceType", record.deviceType || "Mobile Phone");
  setRepairProblem(record.problem || record.repairProblem || "");
  setRepairService(record.repairParts || record.partsText || (Array.isArray(record.parts) ? record.parts.join(", ") : ""));
  setFieldValue("repairPrice", String(price));
  setFieldValue("repairDiscount", String(discount));
  setFieldValue("repairPaidAmount", state.formMode === "pay" ? "" : String(paidAmount));
  setFieldValue("repairFinalTotal", String(Math.max(0, safeNumber(record.finalTotal ?? price - discount))));
  setFieldValue("repairTotalPaid", String(paidAmount));
  setFieldValue("repairRemaining", String(remaining));
  setFieldValue("repairStatus", record.status || "Unpaid");
  setFieldValue("repairNotes", record.notes || "");
  setFieldValue("repairDate", String(record.repairDate || record.date || new Date().toISOString().slice(0, 10)).slice(0, 10));
  setFieldValue("repairWarrantyDays", String(safeNumber(record.warrantyDays ?? 0)));
  setFieldValue("repairWarrantyStart", String(record.warrantyStart || new Date().toISOString().slice(0, 10)).slice(0, 10));
  setFieldValue("repairWarrantyExpiry", String(record.warrantyExpiry || "").slice(0, 10));
  setFieldValue("repairWarrantyStatus", record.warrantyStatus || "No warranty");
  updateFinalTotalPreview();
}


function setRepairSubmitLoading(isLoading, editing = false) {
  const submit = getEl("repairSubmitBtn");
  if (!submit) return;
  if (isLoading) {
    if (!submit.dataset.originalHtml) submit.dataset.originalHtml = submit.innerHTML;
    submit.disabled = true;
    submit.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${editing ? "Updating..." : "Saving..."}`;
  } else {
    submit.disabled = false;
    if (submit.dataset.originalHtml) {
      submit.innerHTML = submit.dataset.originalHtml;
      delete submit.dataset.originalHtml;
    } else {
      submit.innerHTML = `<i class="bi bi-save2 me-1"></i> Save Repair`;
    }
  }
}

function updateFinalTotalPreview() {
  if (state.formMode === 'pay') {
    const repair = state.editId ? getRepairByIdFromState(state.editId) : null;
    const finalTotal = Math.max(0, safeNumber(repair?.finalTotal ?? repair?.price ?? 0));
    const previousPaid = Math.max(0, safeNumber(repair?.paidAmount ?? 0));
    const maxPayNow = Math.max(0, finalTotal - previousPaid);
    let paidNow = Math.max(0, safeNumber(fieldValue("repairPaidAmount")));
    if (paidNow > maxPayNow) {
      paidNow = maxPayNow;
      setFieldValue("repairPaidAmount", String(maxPayNow));
      showToast("Money now that customer paid cannot be bigger than his remaining balance", "warning", "Repair");
    }
    const totalPaid = Math.min(finalTotal, previousPaid + paidNow);
    setFieldValue("repairFinalTotal", String(finalTotal));
    setFieldValue("repairPaidAmount", String(paidNow));
    setFieldValue("repairRemaining", String(Math.max(0, finalTotal - totalPaid)));
    setFieldValue("repairTotalPaid", String(totalPaid));
    setFieldValue("repairStatus", totalPaid >= finalTotal && finalTotal > 0 ? "Paid" : totalPaid > 0 ? "Partial" : "Unpaid");
    return;
  }
  const price = Math.max(0, safeNumber(fieldValue("repairPrice")));
  const discount = Math.max(0, safeNumber(fieldValue("repairDiscount")));
  const total = Math.max(price - discount, 0);
  let paidNow = Math.max(0, safeNumber(fieldValue("repairPaidAmount")));
  if (paidNow > total) {
    paidNow = total;
    setFieldValue("repairPaidAmount", String(total));
    showToast("Money now that customer paid cannot be bigger than his remaining balance", "warning", "Repair");
  }
  const remaining = Math.max(0, total - paidNow);
  setFieldValue("repairFinalTotal", String(total));
  setFieldValue("repairTotalPaid", String(paidNow));
  setFieldValue("repairRemaining", String(remaining));
  syncRepairStatus();
}

function renderSummary() {
  const active = Array.isArray(state.visibleRepairs) ? state.visibleRepairs : filterActive(state.repairs);
  const summary = buildRepairSummary(active);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayRepairs = active.filter((repair) => {
    const stamp = safeNumber(repair?.updatedAt ?? repair?.createdAt ?? repair?.repairDate);
    return stamp >= todayStart.getTime() && stamp <= todayEnd.getTime();
  }).length;

  setCount("totalRepairs", summary.totalRepairs);
  setCount("pendingRepairs", summary.deviceReceivedRepairs);
  setCount("processingRepairs", summary.inspectionStartedRepairs);
  setCount("inRepairRepairs", summary.repairInProgressRepairs);
  setCount("waitingPartsRepairs", summary.waitingForPartsRepairs);
  setCount("completedRepairs", summary.qualityTestingRepairs);
  setCount("deliveredRepairs", summary.deliveredRepairs);
  setCount("todayRepairs", todayRepairs);

  const paidTotal = active.reduce((sum, repair) => sum + Math.max(0, safeNumber(repair?.paidAmount ?? 0)), 0);
  const unpaidTotal = active.reduce((sum, repair) => sum + repairBalance(repair), 0);
  const grossTotal = active.reduce((sum, repair) => sum + Math.max(0, safeNumber(repair?.finalTotal ?? repair?.price ?? 0)), 0);

  setCount("repairRevenue", paidTotal, formatCurrency);
  setCount("repairPaidTotal", paidTotal, formatCurrency);
  setCount("repairUnpaidTotal", unpaidTotal, formatCurrency);
  setCount("repairGrossTotal", grossTotal, formatCurrency);

  const trashCount = filterDeleted(state.repairs).length;
  setCount("trashCount", trashCount);
  renderRepairStatusBoard();
  renderActivityTimeline();
  updateRepairNotificationBadge();
}

function renderRepairStatusBoard() {
  const active = sortByDate(filterActive(state.repairs), "updatedAt", true);
  REPAIR_STATUS_BOARD.forEach((stage) => {
    const list = active.filter((repair) => getRepairStatusKey(repair) === stage.key);
    const labelEl = getEl(stage.labelId);
    if (labelEl) labelEl.textContent = `${list.length} repair job${list.length === 1 ? "" : "s"}`;
    const listEl = getEl(stage.listId);
    if (!listEl) return;

    if (!list.length) {
      listEl.innerHTML = `<div class="status-board-empty">No ${stage.title.toLowerCase()} jobs yet.</div>`;
      return;
    }

    listEl.innerHTML = list.slice(0, 5).map((repair) => {
      const queue = getRepairQueueNumber(repair);
      const repairId = repair?.repairId || repair?.repairNumber || repair?.id || `R-${queue}`;
      const customerName = repair?.customerName || "Unknown customer";
      const deviceName = repair?.deviceName || repair?.deviceType || "Device";
      const dateLabel = repair?.updatedAt ? formatDateTime(repair.updatedAt) : (repair?.createdAt ? formatDateTime(repair.createdAt) : "Recently");
      const amount = formatCurrency(Math.max(0, safeNumber(repair?.finalTotal ?? repair?.price ?? 0)));
      return `
        <div class="status-board-item">
          <div class="d-flex justify-content-between align-items-start gap-3">
            <div class="min-w-0">
              <div class="fw-bold text-truncate">${customerName}</div>
              <div class="text-muted small text-truncate">${deviceName}</div>
            </div>
            <span class="queue-chip ${stage.tone}">${stage.badge}</span>
          </div>
          <div class="meta mt-2">
            <span><i class="bi bi-hash"></i> ${repairId}</span>
            <span><i class="bi bi-list-ol"></i> Queue #${queue}</span>
            <span><i class="bi bi-calendar3"></i> ${dateLabel}</span>
            <span><i class="bi bi-cash-coin"></i> ${amount}</span>
          </div>
        </div>
      `;
    }).join("");
  });
}

function renderActivityTimeline() {
  const container = getEl("repairActivityTimeline");
  if (!container) return;
  const recent = sortByDate([...state.repairs], "updatedAt", true).slice(0, 4);
  if (!recent.length) {
    container.innerHTML = `
      <div class="timeline-step">
        <div class="fw-bold">No activity yet</div>
        <small class="text-muted">Create a repair job to see timeline updates here.</small>
      </div>`;
    return;
  }
  container.innerHTML = recent.map((repair) => {
    const title = repair.customerName || "Unknown customer";
    const status = displayStatusLabel(repair.status);
    const dateLabel = repair.updatedAt ? formatDateTime(repair.updatedAt) : (repair.createdAt ? formatDateTime(repair.createdAt) : "Recently");
    return `
      <div class="timeline-step">
        <div class="fw-bold">${title}</div>
        <small class="text-muted">${status} • ${dateLabel}</small>
      </div>`;
  }).join("");
}

function renderEmpty(target, message, icon = "bi-inbox") {
  if (!target) return;
  target.innerHTML = `
    <div class="empty-state text-center py-5">
      <div class="empty-icon mb-3"><i class="bi ${icon}"></i></div>
      <h5 class="fw-bold mb-2">${message}</h5>
      <p class="text-muted mb-0">Use the form to save the first repair job.</p>
    </div>
  `;
}

function filterByDateMode(repair, mode, exactDate) {
  const time = getRepairDateValue(repair);
  if (!time) return false;

  if (exactDate) {
    const selected = new Date(exactDate);
    if (Number.isNaN(selected.getTime())) return true;
    const start = new Date(selected);
    start.setHours(0, 0, 0, 0);
    const end = new Date(selected);
    end.setHours(23, 59, 59, 999);
    return time >= start.getTime() && time <= end.getTime();
  }

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  if (mode === "today") {
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    return time >= today.getTime() && time <= end.getTime();
  }

  if (mode === "week") {
    const start = new Date(today);
    const day = start.getDay();
    const saturdayOffset = (day + 1) % 7;
    start.setDate(start.getDate() - saturdayOffset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return time >= start.getTime() && time <= end.getTime();
  }

  if (mode === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return time >= start.getTime() && time <= end.getTime();
  }

  if (mode === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return time >= start.getTime() && time <= end.getTime();
  }

  return true;
}

function matchesRepairFilters(repair) {
  const query = normalizeText(getEl("repairSearch")?.value || "");
  const rawStatusFilter = normalizeText(getEl("repairStatusFilter")?.value || "all");
  const statusFilter = rawStatusFilter === "status" ? "all" : rawStatusFilter;
  const dateMode = normalizeText(getEl("repairDateFilter")?.value || "all");
  const exactDate = getEl("repairExactDate")?.value || "";
  const paymentFilter = normalizeText(getEl("repairPaymentFilter")?.value || "all");
  const selectedProblem = normalizeText(state.problemFilter || "All Problems");
  const selectedService = normalizeText(state.serviceFilter || "All Parts / Services");

  const text = repairQueryBlob(repair);
  const status = getRepairStatusKey(repair);
  const dateOk = filterByDateMode(repair, dateMode, exactDate);
  const problemValue = normalizeText(getRepairProblemValue(repair));
  const serviceValue = normalizeText(getRepairPartsValue(repair));
  const paymentStatus = normalizeText(paymentStatusLabel(repair));

  if (query && !text.includes(query)) return false;
  if (statusFilter !== "all" && status !== statusFilter) return false;
  if (paymentFilter !== "all" && paymentStatus !== paymentFilter) return false;
  if (selectedProblem && selectedProblem !== normalizeText("All Problems") && problemValue !== selectedProblem) return false;
  if (selectedService && selectedService !== normalizeText("All Parts / Services") && !serviceValue.includes(selectedService)) return false;
  if (!dateOk) return false;
  return true;
}

function renderRepairs() {
  const cards = getEl("repairCards");
  const tableBody = getEl("repairTableBody");
  const trashBody = getEl("repairTrashBody") || getEl("repairTrashModalBody");
  const trashModalBody = getEl("repairTrashModalBody") || getEl("repairTrashBody");

  const rowsLimit = getRowsLimit(getEl("repairRowsFilter")?.value || state.rowLimit, 5);
  const trashRowsLimit = getRowsLimit(getEl("repairTrashRowsFilter")?.value || state.trashRowLimit, 5);
  const trashDateFilter = normalizeText(getEl("repairTrashDateFilter")?.value || state.trashDateFilter || "today");

  let active = sortByDate(filterActive(state.repairs), "createdAt", true).filter(matchesRepairFilters);
  state.visibleRepairs = active;
  const deletedAll = sortByDate(filterDeleted(state.repairs), "deletedAt", true).filter((repair) => filterByDateMode(repair, trashDateFilter, ""));
  const deleted = Number.isFinite(trashRowsLimit) ? deletedAll.slice(0, trashRowsLimit) : deletedAll;
  active = Number.isFinite(rowsLimit) ? active.slice(0, rowsLimit) : active;

  if (cards) {
    if (!active.length) {
      renderEmpty(cards, "No repair jobs found", "bi-tools");
    } else {
      cards.innerHTML = active.map(renderCard).join("");
    }
  }

  if (tableBody) {
    if (!active.length) {
      tableBody.innerHTML = `
        <tr><td colspan="6" class="text-center text-muted py-4">No active repair jobs available.</td></tr>
      `;
    } else {
      tableBody.innerHTML = active.map(renderTableRow).join("");
    }
  }

  const trashHtml = !deleted.length
    ? `<tr><td colspan="6" class="text-center text-muted py-4">Trash is empty.</td></tr>`
    : deleted.map(renderTrashRow).join("");

  if (trashBody) trashBody.innerHTML = trashHtml;
  if (trashModalBody) trashModalBody.innerHTML = trashHtml;
  document.getElementById("repairRestoreAllBtn")?.addEventListener("click", restoreAllDeletedRepairs);
  document.getElementById("repairDeleteAllForeverBtn")?.addEventListener("click", deleteAllDeletedRepairsForever);

  const count = active.length;
  setCount("visibleRepairCount", count);
}

function renderCard(repair) {
  const id = repair?.id || repair?.repairId || "";
  const dateLabel = repair?.createdAt ? formatDateTime(repair.createdAt) : (repair?.repairDate || "");
  const problem = getRepairProblemValue(repair) || "Not set";
  const parts = getRepairPartsValue(repair) || "No parts listed";
  const payment = paymentStatusLabel(repair);
  const balance = repairBalance(repair);
  return `
    <div class="col" data-repair-id="${id}" data-search="${repairQueryBlob(repair)}">
      <div class="repair-card card-shell h-100 p-3">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
          <div class="flex-grow-1 min-w-0">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
              ${statusBadge(repair?.status)}
              <span class="mini-pill"><i class="bi bi-hash"></i>${makeRepairNumber(repair)}</span>
            </div>
            <div class="fw-bold fs-6 text-truncate">${escapeHtml(repair?.customerName || "Unnamed customer")}</div>
            <div class="small text-muted text-truncate"><i class="bi bi-telephone me-1"></i>${escapeHtml(repair?.customerPhone || "No phone")}</div>
            <div class="small text-muted text-truncate"><i class="bi bi-phone me-1"></i>${escapeHtml(repair?.deviceName || "Unknown device")}${repair?.deviceType ? ` · ${escapeHtml(repair.deviceType)}` : ""}</div>
          </div>
          <div class="text-end flex-shrink-0">
            <div class="summary-value mb-1">${formatCurrency(repair?.finalTotal ?? repair?.price ?? 0)}</div>
            <div class="small text-muted">${escapeHtml(dateLabel || "No date")}</div>
          </div>
        </div>
        <div class="repair-meta-grid mb-3 repair-meta-grid--spaced">
          <div class="repair-meta-item"><span><i class="bi bi-exclamation-triangle me-1"></i>Problem:</span><strong class="ms-1">${escapeHtml(problem)}</strong></div>
          <div class="repair-meta-item"><span><i class="bi bi-puzzle me-1"></i>Parts:</span><strong class="ms-1">${escapeHtml(parts)}</strong></div>
          <div class="repair-meta-item"><span><i class="bi bi-wallet2 me-1"></i>Payment:</span><strong class="ms-1 ${payment === "Paid" ? "text-success" : payment === "Partial" ? "text-warning" : "text-danger"}">${payment}</strong></div>
          <div class="repair-meta-item"><span><i class="bi bi-cash-stack me-1"></i>Balance:</span><strong class="ms-1 ${balance > 0 ? "text-danger" : "text-success"}">${formatCurrency(balance)}</strong></div>
        </div>
        ${repair?.notes ? `<div class="small text-muted mb-3"><i class="bi bi-chat-left-text me-1"></i>${escapeHtml(repair.notes)}</div>` : ""}
        <div class="repair-action-grid">
          <button class="btn btn-outline-primary repair-row-action-btn" data-action="view" data-id="${id}" title="View">
            <i class="bi bi-eye"></i><span>View</span>
          </button>
          <button class="btn btn-outline-success repair-row-action-btn" data-action="whatsapp" data-id="${id}" title="WhatsApp">
            <i class="bi bi-whatsapp"></i><span>WhatsApp</span>
          </button>
          <button class="btn btn-outline-secondary repair-row-action-btn" data-action="status-next" data-id="${id}" title="Next status">
            <i class="bi bi-arrow-right-circle"></i><span>Next</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderTableRow(repair) {
  const id = repair?.id || repair?.repairId || "";
  return `
    <tr data-repair-id="${id}" data-search="${repairQueryBlob(repair)}">
      <td data-label="Customer">
        <div class="fw-semibold">${repair?.customerName || "Unnamed customer"}</div>
        <div class="small text-muted">${repair?.customerPhone || "No phone"}</div>
      </td>
      <td data-label="Device">
        <div class="fw-semibold">${repair?.deviceName || "Unknown device"}</div>
        <div class="small text-muted">${repair?.deviceType || ""}</div>
      </td>
      <td data-label="Status">
        ${statusBadge(repair?.status)}
        <div class="small mt-1"><span class="${paymentStatusLabel(repair) === "Paid" ? "text-success" : paymentStatusLabel(repair) === "Partial" ? "text-warning" : "text-danger"}">${paymentStatusLabel(repair)}</span></div>
      </td>
      <td data-label="Price">${formatCurrency(repair?.finalTotal ?? repair?.price ?? 0)}</td>
      <td data-label="Balance" class="text-danger fw-semibold">${formatCurrency(repairBalance(repair))}</td>
      <td data-label="Date" class="small text-muted">${repair?.createdAt ? formatDateTime(repair.createdAt) : (repair?.repairDate || "")}</td>
      <td data-label="Actions">
        <div class="repair-action-grid">
          <button class="btn btn-outline-primary repair-row-action-btn" data-action="view" data-id="${id}" title="View">
            <i class="bi bi-eye"></i><span>View</span>
          </button>
          <button class="btn btn-outline-success repair-row-action-btn" data-action="whatsapp" data-id="${id}" title="WhatsApp">
            <i class="bi bi-whatsapp"></i><span>WhatsApp</span>
          </button>
          <button class="btn btn-outline-secondary repair-row-action-btn" data-action="status-next" data-id="${id}" title="Next status">
            <i class="bi bi-arrow-right-circle"></i><span>Next</span>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderRepairSkeleton(count = 4) {
  return Array.from({ length: count }, () => `
    <div class="col">
      <div class="repair-card card-shell h-100 p-3">
        <div class="skeleton-line mb-3" style="width: 45%;"></div>
        <div class="skeleton-line mb-2" style="width: 70%;"></div>
        <div class="skeleton-line mb-2" style="width: 55%;"></div>
        <div class="skeleton-box mt-3" style="height: 84px;"></div>
      </div>
    </div>`).join('');
}

function renderRepairTableSkeleton(rows = 4) {
  return Array.from({ length: rows }, () => `
    <tr class="repair-skeleton-row"><td colspan="7"><div class="skeleton-line" style="width: 90%;"></div></td></tr>`).join('');
}

function renderTrashRow(repair) {
  const id = repair?.id || repair?.repairId || "";
  return `
    <tr data-repair-id="${id}">
      <td>
        <div class="fw-semibold">${repair?.customerName || "Unnamed customer"}</div>
        <div class="small text-muted">${repair?.customerPhone || "No phone"}</div>
      </td>
      <td>${repair?.deviceName || "Unknown device"}</td>
      <td>${statusBadge(repair?.status)}</td>
      <td class="small text-muted">${repair?.deletedAt ? formatDateTime(repair.deletedAt) : "Deleted"}</td>
      <td>
        <button class="btn btn-sm btn-success action-btn" data-action="restore" data-id="${id}"><i class="bi bi-arrow-counterclockwise"></i></button>
      </td>
    </tr>
  `;
}

async function restoreAllDeletedRepairs() {
  const items = sortByDate(filterDeleted(state.repairs), "deletedAt", true);
  if (!items.length) return showToast("Trash is empty.", "info", "Repair");
  const ok = window.confirm ? window.confirm(`Restore ${items.length} deleted repair${items.length === 1 ? '' : 's'}?`) : true;
  if (!ok) return;
  try {
    for (const item of items) {
      await restoreRepair(item.id || item.repairId || item.repairNumber);
    }
    showToast("All repairs restored.", "success", "Repair");
    await loadRepairs();
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not restore all repairs.", "error", "Repair");
  }
}

async function deleteAllDeletedRepairsForever() {
  const items = sortByDate(filterDeleted(state.repairs), "deletedAt", true);
  if (!items.length) return showToast("Trash is empty.", "info", "Repair");
  const ok = window.confirm ? window.confirm(`Delete ${items.length} deleted repair${items.length === 1 ? '' : 's'} forever? This cannot be undone.`) : true;
  if (!ok) return;
  try {
    for (const item of items) {
      await deleteRepair(item.id || item.repairId || item.repairNumber, { hardDelete: true });
    }
    showToast("All repairs deleted forever.", "success", "Repair");
    await loadRepairs();
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not delete all repairs.", "error", "Repair");
  }
}

async function loadRepairs() {
  document.body.classList.add('repair-page-loading');
  setPageLoading(repairLoadingTargets(), true);
  const cards = getEl("repairCards");
  const tableBody = getEl("repairTableBody");
  const trashBody = getEl("repairTrashBody") || getEl("repairTrashModalBody");
  const trashModalBody = getEl("repairTrashModalBody") || getEl("repairTrashBody");
  if (cards) cards.innerHTML = renderRepairSkeleton(4);
  if (tableBody) tableBody.innerHTML = renderRepairTableSkeleton(4);
  if (trashBody) trashBody.innerHTML = renderRepairTableSkeleton(2);
  if (trashModalBody) trashModalBody.innerHTML = renderRepairTableSkeleton(2);
  try {
    const data = await getRepairs();
    const list = Array.isArray(data) ? data : Object.entries(data || {}).map(([id, value]) => withId(value, id));
    state.repairs = list.map((repair) => ({
      ...repair,
      id: repair?.id || repair?.repairId || repair?.key || repair?.repairNumber || null,
      repairNumber: repair?.repairNumber || repair?.repairId || repair?.id || null
    }));
    const invoicesData = await getInvoices().catch(() => null);
    state.invoices = getActiveRecords(invoicesData);
    const customersData = await getCustomers().catch(() => null);
    state.customers = getTaggedCustomerList(customersData || []);
    refreshRepairDropdowns();
    renderSummary();
    renderRepairs();
    updateRepairNotificationBadge();
    requestAnimationFrame(() => renderRepairStatusBoard());
    setTimeout(() => renderRepairStatusBoard(), 300);
  } catch (error) {
    console.error("Repair load failed:", error);
    showToast("Repairs could not be loaded.", "warning", "Repair");
  } finally {
    document.body.classList.remove('repair-page-loading');
    setTimeout(() => setPageLoading(repairLoadingTargets(), false), 220);
  }
}

async function saveRepair(event) {
  event.preventDefault();

  const payload = collectFormData();
  if (!payload.customerName || !payload.customerPhone || !payload.deviceName || !payload.deviceType || !payload.problem || !payload.repairParts) {
    showToast("Please fill all required repair fields.", "warning", "Repair");
    return;
  }

  const editingId = state.editId || fieldValue("repairRecordId").trim();
  const existingRepair = editingId ? getRepairByIdFromState(editingId) : null;
  const submit = getEl("repairSubmitBtn");
  if (submit) {
    setRepairSubmitLoading(true, Boolean(editingId));
  }
  try {
    if (editingId) {
      const isPayMode = state.formMode === 'pay';
      const currentFinal = Math.max(0, safeNumber(existingRepair?.finalTotal ?? existingRepair?.price ?? payload.finalTotal ?? 0));
      const currentPaid = Math.max(0, safeNumber(existingRepair?.paidAmount ?? 0));
      const paidNowInput = isPayMode ? Math.min(Math.max(0, safeNumber(payload.paidNow ?? 0)), Math.max(0, currentFinal - currentPaid)) : Math.max(0, safeNumber(payload.paidAmount ?? 0));
      const nextPaid = isPayMode ? Math.min(currentFinal, currentPaid + paidNowInput) : Math.min(currentFinal, paidNowInput);

      if (isPayMode && currentPaid + paidNowInput > currentFinal) {
        showToast("Money now that customer paid cannot be bigger than his remaining balance", "warning", "Repair");
        return;
      }

      const updatedRepair = {
        ...existingRepair,
        ...payload,
        repairNumber: editingId,
        id: editingId,
        paidAmount: nextPaid,
        remaining: Math.max(0, currentFinal - nextPaid),
        totalPaid: nextPaid,
        status: isPayMode ? (nextPaid >= currentFinal && currentFinal > 0 ? "Paid" : nextPaid > 0 ? "Partial" : "Unpaid") : normalizeRepairStatus(getRepairByIdFromState(editingId)?.status || payload.status || "pending"),
        isDeleted: false,
        deleted: false,
        updatedAt: nowValue()
      };

      await updateRepair(editingId, updatedRepair);
      setFieldValue("repairRemaining", String(Math.max(0, currentFinal - nextPaid)));
      setFieldValue("repairTotalPaid", String(nextPaid));

      if (isPayMode && paidNowInput > 0) {
        await addPayment({
          relatedType: "repair",
          relatedId: editingId,
          relatedNumber: updatedRepair.repairNumber || editingId,
          customerId: updatedRepair.customerId || null,
          customerName: updatedRepair.customerName,
          customerPhone: updatedRepair.customerPhone,
          customerWhatsapp: updatedRepair.customerWhatsapp || updatedRepair.customerPhone || "",
          senderNumber: updatedRepair.senderNumber || updatedRepair.customerPhone || "",
          paymentType: updatedRepair.paymentType || "Mobile Money",
          paymentProvider: updatedRepair.paymentProvider || "Evc Plus",
          cashCurrency: updatedRepair.cashCurrency || "Somali Shillings",
          paidNow: paidNowInput,
          paidAmount: nextPaid,
          totalPaid: nextPaid,
          totalRemaining: Math.max(0, currentFinal - nextPaid),
          totalAmount: currentFinal,
          notes: updatedRepair.notes || "",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isDeleted: false,
          deleted: false,
        });
      }

      await refreshCustomerStatsForRecord(updatedRepair);
      showToast(isPayMode ? "Repair payment saved successfully" : "Repair job updated successfully", "success", "Repair");
    } else {
      const createdAt = nowValue();
      const created = await addRepair({
        ...payload,
        dayNumber: getRepairSequenceForToday(),
        repairNumber: `R-${createdAt}`,
        status: payload.status || "device received",
        statusHistory: buildStatusHistory(null, payload.status || "device received", createdAt),
        statusTimeline: buildStatusHistory(null, payload.status || "device received", createdAt),
        statusTimestamps: buildStatusHistory(null, payload.status || "device received", createdAt),
        createdAt
      });
      state.editId = created?.id || created || null;
      showToast("Repair job saved successfully", "success", "Repair");
      if (payload.customerId) {
        await rebuildCustomerStats(payload.customerId).catch(() => null);
      }
    }

    resetForm();
    await loadRepairs();
    hideRepairModal("newRepairModal");
    closeBootstrapModal("newRepairModal");
    updateRepairNotificationBadge();
  } catch (error) {
    console.error("Repair save failed:", error);
    showToast(error?.message || "Could not save repair job", "error", "Repair");
  } finally {
    setRepairSubmitLoading(false, Boolean(editingId));

  }
}

function clampRepairPaidNowValue() {
  const repair = state.formMode === "pay" && state.editId ? getRepairByIdFromState(state.editId) : null;
  if (!repair) return Math.max(0, safeNumber(fieldValue("repairPaidAmount")));
  const finalTotal = Math.max(0, safeNumber(repair.finalTotal ?? repair.price ?? repair.cost ?? 0));
  const previousPaid = Math.max(0, safeNumber(repair.paidAmount ?? 0));
  const maxPayNow = Math.max(0, finalTotal - previousPaid);
  let paidNow = Math.max(0, safeNumber(fieldValue("repairPaidAmount")));
  if (paidNow > maxPayNow) {
    paidNow = maxPayNow;
    setFieldValue("repairPaidAmount", String(maxPayNow));
    showToast("Money now that customer paid cannot be bigger than his remaining balance", "warning", "Repair");
  }
  return paidNow;
}

function renderRepairCustomerSuggestions() {
  const nameEl = getEl("repairCustomerName");
  const phoneEl = getEl("repairCustomerPhone");
  const panel = getEl("repairCustomerSuggestions");
  if (!nameEl || !phoneEl || !panel) return;
  const query = normalizeText(nameEl.value || phoneEl.value || "");
  const isPayMode = state.formMode === "pay" && state.editId;
  const baseRepair = isPayMode ? getRepairByIdFromState(state.editId) : null;
  const directory = isPayMode && baseRepair ? [{
    customerId: String(baseRepair.customerId || ""),
    customerName: baseRepair.customerName || "",
    phone: baseRepair.customerPhone || "",
    whatsapp: baseRepair.customerWhatsapp || baseRepair.customerPhone || "",
    lastActivity: safeNumber(baseRepair.updatedAt || baseRepair.createdAt || 0),
    count: 1,
  }] : buildRepairCustomerDirectory();
  const matches = directory
    .filter((item) => !query || normalizeText(item.customerName).includes(query) || normalizeText(item.phone).includes(query) || normalizeText(item.whatsapp).includes(query))
    .slice(0, isPayMode ? 1 : 10);

  panel.style.maxHeight = '260px';
  panel.style.overflowY = 'auto';
  panel.style.scrollbarWidth = 'thin';
  panel.style.scrollbarColor = '#ef4444 transparent';

  if (!matches.length) {
    hideRepairCustomerSuggestions();
    return;
  }

  panel.style.display = "block";
  panel.innerHTML = matches.map((item) => `
    <button type="button" class="customer-suggestion-item" data-customer-id="${escapeHtml(item.customerId || "")}" data-customer-name="${escapeHtml(item.customerName)}" data-customer-phone="${escapeHtml(item.phone || "")}" data-customer-whatsapp="${escapeHtml(item.whatsapp || item.phone || "")}">
      <span class="fw-semibold text-truncate">${escapeHtml(item.customerName)}</span>
      <span class="small text-muted text-nowrap">${escapeHtml(item.phone || "—")}</span>
    </button>
  `).join("");
  const wrap = getRepairCustomerSuggestWrap();
  if (wrap) wrap.dataset.open = "true";
}

function applyRepairCustomerSuggestion(record) {
  const nameEl = getEl("repairCustomerName");
  const phoneEl = getEl("repairCustomerPhone");
  const whatsappEl = getEl("repairCustomerWhatsapp");
  const senderEl = getEl("repairSenderNumber");
  if (nameEl) {
    nameEl.value = record?.customerName || "";
    nameEl.dataset.customerId = record?.customerId || "";
  }
  if (phoneEl) phoneEl.value = record?.phone || "";
  if (whatsappEl) whatsappEl.value = record?.whatsapp || record?.phone || "";
  if (senderEl) senderEl.value = record?.phone || "";
  hideRepairCustomerSuggestions();
}

function bindRepairCustomerAutocomplete() {
  const nameEl = getEl("repairCustomerName");
  const phoneEl = getEl("repairCustomerPhone");
  const panel = getEl("repairCustomerSuggestions");
  if (!nameEl || !phoneEl || !panel) return;

  const syncFromName = () => {
    const query = normalizeText(nameEl.value);
    const directory = buildRepairCustomerDirectory();
    const exact = directory.find((item) => item.phone && normalizeText(item.phone) === query);
    if (exact && (!phoneEl.value || normalizeText(phoneEl.value) === "" || normalizeText(phoneEl.value) === normalizeText(exact.phone || ""))) {
      phoneEl.value = exact.phone || phoneEl.value;
      const whatsappEl = getEl("repairCustomerWhatsapp");
      const senderEl = getEl("repairSenderNumber");
      if (whatsappEl) whatsappEl.value = exact.whatsapp || exact.phone || "";
      if (senderEl) senderEl.value = exact.phone || senderEl?.value || "";
    }
    renderRepairCustomerSuggestions();
  };

  nameEl.addEventListener("focus", renderRepairCustomerSuggestions);
  nameEl.addEventListener("input", syncFromName);
  nameEl.addEventListener("change", syncFromName);
  nameEl.addEventListener("blur", () => setTimeout(hideRepairCustomerSuggestions, 180));
  phoneEl.addEventListener("focus", renderRepairCustomerSuggestions);
  phoneEl.addEventListener("input", renderRepairCustomerSuggestions);
  panel.addEventListener("mousedown", (event) => {
    const button = event.target.closest("[data-customer-name]");
    if (!button) return;
    event.preventDefault();
    applyRepairCustomerSuggestion({
      customerId: button.dataset.customerId || "",
      customerName: button.dataset.customerName || "",
      phone: button.dataset.customerPhone || "",
      whatsapp: button.dataset.customerWhatsapp || button.dataset.customerPhone || ""
    });
  });
}


function buildCustomerIdentitySet(record = {}) {
  const values = [
    record?.customerId,
    record?.id,
    record?.repairId,
    record?.invoiceId,
    record?.relatedId,
    record?.customerPhone,
    record?.phone,
    record?.phoneNumber,
    record?.customerWhatsapp,
    record?.whatsapp,
    record?.senderNumber,
    record?.paymentSenderNumber,
    record?.customerName,
    record?.fullName,
    record?.name,
  ];
  const set = new Set();
  values.forEach((value) => {
    const text = normalizeText(value);
    if (text) set.add(text);
    const digits = String(value || "").replace(/\D/g, "");
    if (digits) set.add(digits);
  });
  return set;
}

function recordMatchesCustomer(record = {}, identitySet = new Set()) {
  const recordSet = buildCustomerIdentitySet(record);
  for (const value of recordSet) {
    if (identitySet.has(value)) return true;
  }
  return false;
}

function buildCustomerHistoryBundle(seed = {}, invoices = [], repairs = [], payments = []) {
  const identitySet = buildCustomerIdentitySet(seed);
  const invoiceRows = getActiveRecords(invoices)
    .filter((item) => recordMatchesCustomer(item, identitySet))
    .sort((a, b) => Number(b?.createdAt || b?.updatedAt || 0) - Number(a?.createdAt || a?.updatedAt || 0))
    .map((invoice) => {
      const total = safeNumber(invoice?.finalTotal ?? invoice?.total ?? invoice?.amount ?? 0);
      const paid = safeNumber(invoice?.paidAmount ?? invoice?.paid ?? 0);
      const remaining = Math.max(0, total - paid);
      const stamp = Number(invoice?.createdAt || invoice?.updatedAt || Date.now());
      return {
        type: "Invoice",
        ref: invoice?.invoiceNumber || invoice?.id || "—",
        detail: String(invoice?.notes || invoice?.paymentStatus || "Invoice").trim() || "Invoice",
        phone: invoice?.customerPhone || invoice?.phone || "—",
        whatsapp: invoice?.customerWhatsapp || invoice?.whatsapp || invoice?.customerPhone || invoice?.phone || "—",
        sender: invoice?.senderNumber || invoice?.paymentSenderNumber || invoice?.customerPhone || invoice?.phone || "—",
        paymentType: invoice?.paymentType || "—",
        paymentProvider: invoice?.paymentProvider || invoice?.cashCurrency || "—",
        cashCurrency: invoice?.cashCurrency || "—",
        amount: formatCurrency(total),
        date: formatDateTime(stamp),
        stamp,
        total,
        paid,
        remaining,
        notes: invoice?.notes || invoice?.paymentNotes || "—"
      };
    });

  const repairRows = getActiveRecords(repairs)
    .filter((item) => recordMatchesCustomer(item, identitySet))
    .sort((a, b) => Number(b?.createdAt || b?.updatedAt || 0) - Number(a?.createdAt || a?.updatedAt || 0))
    .map((repair) => {
      const total = safeNumber(repair?.finalTotal ?? repair?.price ?? 0);
      const paid = safeNumber(repair?.paidAmount ?? repair?.paid ?? 0);
      const remaining = Math.max(0, total - paid);
      const stamp = Number(repair?.createdAt || repair?.updatedAt || Date.now());
      return {
        type: "Repair",
        ref: repair?.repairNumber || repair?.id || "—",
        detail: String(repair?.deviceName || repair?.problem || "Repair job").trim() || "Repair job",
        phone: repair?.customerPhone || repair?.phone || "—",
        whatsapp: repair?.customerWhatsapp || repair?.whatsapp || repair?.customerPhone || repair?.phone || "—",
        sender: repair?.senderNumber || repair?.paymentSenderNumber || repair?.customerPhone || repair?.phone || "—",
        paymentType: repair?.paymentType || "—",
        paymentProvider: repair?.paymentProvider || repair?.cashCurrency || "—",
        cashCurrency: repair?.cashCurrency || "—",
        amount: formatCurrency(total),
        date: formatDateTime(stamp),
        stamp,
        total,
        paid,
        remaining,
        notes: repair?.notes || repair?.repairNotes || "—"
      };
    });

  const linkedIds = new Set([
    ...getActiveRecords(invoices).filter((item) => recordMatchesCustomer(item, identitySet)).map((item) => normalizeText(item?.id || item?.invoiceId || item?.invoiceNumber || item?.number || "")),
    ...getActiveRecords(repairs).filter((item) => recordMatchesCustomer(item, identitySet)).map((item) => normalizeText(item?.id || item?.repairId || item?.repairNumber || item?.number || ""))
  ].filter(Boolean));

  const paymentRows = getActiveRecords(payments)
    .filter((item) => {
      const matchesDirectly = recordMatchesCustomer(item, identitySet);
      const relatedType = normalizeText(item?.relatedType || item?.type || "");
      const relatedId = normalizeText(item?.relatedId || item?.relatedNumber || item?.invoiceId || item?.repairId || item?.invoiceNumber || item?.repairNumber || "");
      const matchesLinkedRecord = relatedId && linkedIds.has(relatedId);
      if (!matchesDirectly && !matchesLinkedRecord) return false;
      return !relatedType || relatedType === "invoice" || relatedType === "repair" || relatedType === "payment";
    })
    .sort((a, b) => Number(b?.createdAt || b?.updatedAt || 0) - Number(a?.createdAt || a?.updatedAt || 0))
    .map((payment) => {
      const stamp = Number(payment?.createdAt || payment?.updatedAt || Date.now());
      const paidNow = safeNumber(payment?.paidNow ?? payment?.amount ?? payment?.paidAmount ?? 0);
      const totalPaid = safeNumber(payment?.totalPaid ?? payment?.paidAmount ?? paidNow);
      const totalRemaining = safeNumber(payment?.totalRemaining ?? payment?.remaining ?? 0);
      const totalAmount = safeNumber(payment?.totalAmount ?? payment?.total ?? 0);
      return {
        type: payment?.relatedType === "repair" ? "Repair Payment" : "Invoice Payment",
        ref: payment?.relatedNumber || payment?.relatedId || payment?.id || "—",
        detail: `${payment?.paymentType || "Payment"}${payment?.paymentProvider ? ` • ${payment.paymentProvider}` : ""}${payment?.senderNumber ? ` • ${payment.senderNumber}` : ""}`,
        phone: payment?.customerPhone || payment?.phone || "—",
        whatsapp: payment?.customerWhatsapp || payment?.whatsapp || payment?.customerPhone || payment?.phone || "—",
        sender: payment?.senderNumber || payment?.mobileSenderNumber || payment?.customerPhone || "—",
        paymentType: payment?.paymentType || "—",
        paymentProvider: payment?.paymentProvider || payment?.cashCurrency || "—",
        cashCurrency: payment?.cashCurrency || "—",
        amount: formatCurrency(paidNow),
        date: formatDateTime(stamp),
        stamp,
        total: totalAmount || totalPaid,
        paid: totalPaid,
        remaining: totalRemaining,
        notes: payment?.notes || `Paid now: ${formatCurrency(paidNow)}`
      };
    });

  const combined = [...invoiceRows, ...repairRows, ...paymentRows].sort((a, b) => (b.stamp || 0) - (a.stamp || 0));
  const totals = [...invoiceRows, ...repairRows, ...paymentRows].reduce((acc, row) => {
    acc.totalAll += safeNumber(row.total);
    acc.totalPaid += safeNumber(row.paid);
    acc.totalRemaining += safeNumber(row.remaining);
    acc.historyCount += 1;
    return acc;
  }, { totalAll: 0, totalPaid: 0, totalRemaining: 0, historyCount: 0 });

  return {
    summary: {
      customerName: seed?.customerName || seed?.customer || "Customer",
      phone: seed?.customerPhone || seed?.phone || "—",
      totalInvoices: invoiceRows.length,
      totalRepairs: repairRows.length,
      totalSpent: formatCurrency(totals.totalAll),
      totalPaid: formatCurrency(totals.totalPaid),
      totalRemaining: formatCurrency(totals.totalRemaining),
      historyCount: totals.historyCount,
      lastVisit: combined[0]?.date || "—"
    },
    rows: combined
  };
}



function renderCustomerHistoryHtml(summary, rows) {
  const body = rows.length
    ? rows.map((row) => `
        <tr>
          <td><span class="badge bg-soft-${row.type === "Invoice" ? "primary" : "success"} text-${row.type === "Invoice" ? "primary" : "success"}-soft">${row.type}</span></td>
          <td class="fw-semibold">${escapeHtml(row.ref)}</td>
          <td>${escapeHtml(row.detail)}</td>
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
    : `<tr><td colspan="13" class="text-center text-muted py-4">No customer history found.</td></tr>`;

  const message = encodeURIComponent(buildCustomerContactMessage(summary));
  const phoneDigits = String(summary?.phone || "").replace(/\D/g, "");
  const whatsappUrl = phoneDigits ? `https://wa.me/${phoneDigits}?text=${message}` : `https://wa.me/?text=${message}`;
  const smsUrl = phoneDigits ? `sms:${phoneDigits}?body=${message}` : `sms:?body=${message}`;

  return `
    <div class="row g-3 mb-3">
      <div class="col-12 col-sm-6 col-xl-3"><div class="quick-box"><div class="summary-label">Customer</div><div class="summary-value fs-5">${escapeHtml(summary.customerName)}</div></div></div>
      <div class="col-12 col-sm-6 col-xl-3"><div class="quick-box"><div class="summary-label">Phone</div><div class="summary-value fs-5">${escapeHtml(summary.phone)}</div></div></div>
      <div class="col-12 col-sm-6 col-xl-3"><div class="quick-box"><div class="summary-label">Repairs</div><div class="summary-value fs-5">${summary.totalRepairs}</div></div></div>
      <div class="col-12 col-sm-6 col-xl-3"><div class="quick-box"><div class="summary-label">Invoices</div><div class="summary-value fs-5">${summary.totalInvoices}</div></div></div>
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
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>`;
}


async function openRepairCustomerHistory(repair) {
  const modalEl = document.getElementById("repairCustomerHistoryModal");
  const bodyEl = document.getElementById("repairCustomerHistoryBody");
  const titleEl = document.getElementById("repairCustomerHistoryTitle");
  if (!modalEl || !bodyEl) return;

  bodyEl.innerHTML = '<div class="text-center text-muted py-5"><div class="spinner-border text-primary mb-3" role="status"></div><div>Loading customer history...</div></div>';
  if (titleEl) titleEl.textContent = `${repair?.customerName || "Customer"} history`;
  openModalOnTop(modalEl);

  try {
    const [invoicesRaw, paymentsRaw] = await Promise.all([getInvoices(), getPayments().catch(() => null)]);
    state.invoices = getActiveRecords(invoicesRaw);
    const repairs = getActiveRecords(state.repairs);
    const payments = getActiveRecords(paymentsRaw);
    const { summary, rows } = buildCustomerHistoryBundle(repair || {}, state.invoices, repairs, payments);
    bodyEl.innerHTML = renderCustomerHistoryHtml(summary, rows);
  } catch (error) {
    console.error("Repair customer history failed:", error);
    bodyEl.innerHTML = '<div class="alert alert-warning mb-0">Could not load customer history right now.</div>';
  }
}

function getWarrantyDatesFromForm() {
  const days = Math.max(0, safeNumber(fieldValue("repairWarrantyDays")));
  const start = fieldValue("repairWarrantyStart") || "";
  if (!start || days <= 0) return { days, start, expiry: "", status: "No warranty" };
  const startDate = new Date(`${start}T00:00:00`);
  if (Number.isNaN(startDate.getTime())) return { days, start, expiry: "", status: "No warranty" };
  const expiryDate = new Date(startDate);
  expiryDate.setDate(expiryDate.getDate() + days);
  const expiry = expiryDate.toISOString().slice(0, 10);
  const today = new Date();
  today.setHours(0,0,0,0);
  const diffDays = Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000);
  let status = "Active";
  if (diffDays < 0) status = "Expired";
  else if (diffDays <= 7) status = "Expires Soon";
  return { days, start, expiry, status };
}

function syncWarrantyFields() {
  const { expiry, status } = getWarrantyDatesFromForm();
  setFieldValue("repairWarrantyExpiry", expiry);
  setFieldValue("repairWarrantyStatus", status);
}


function getActionButtonIconMarkup(button) {

  if (!button) return "";
  const icon = button.querySelector("i");
  if (icon) return icon.outerHTML;
  return button.innerHTML || "";
}

function setActionButtonLoading(button, isLoading = false) {
  if (!button) return;
  if (isLoading) {
    if (!button.dataset.originalHtml) {
      button.dataset.originalHtml = button.innerHTML;
    }
    button.classList.add("is-loading");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.innerHTML = '<span class="spinner-border spinner-border-sm action-spinner" role="status" aria-hidden="true"></span>';
    return;
  }
  const original = button.dataset.originalHtml;
  if (original !== undefined) {
    button.innerHTML = original;
    delete button.dataset.originalHtml;
  }
  button.classList.remove("is-loading");
  button.disabled = false;
  button.removeAttribute("aria-busy");
}

function flashActionButtonLoading(button, duration = 800) {
  if (!button) return;
  setActionButtonLoading(button, true);
  window.setTimeout(() => setActionButtonLoading(button, false), duration);
}


function printRepair(repair) {
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
  const printedAt = new Date();
  const queueNo = getRepairQueueNumber(repair);
  const status = statusMeta(repair?.status);
  const shopName = escapeHtml(getGeneralSettings().shopName || DEFAULT_SETTINGS.general.shopName);
  const phone = escapeHtml(getGeneralSettings().phone || DEFAULT_SETTINGS.general.phone);
  const whatsapp = escapeHtml(getGeneralSettings().whatsapp || DEFAULT_SETTINGS.general.whatsapp || getGeneralSettings().phone || DEFAULT_SETTINGS.general.phone);
  const websiteUrl = getPublicWebsiteUrl();
  const website = escapeHtml(websiteUrl);
  const device = escapeHtml(repair?.deviceName || repair?.device || "");
  const customer = escapeHtml(repair?.customerName || "");
  const customerPhone = escapeHtml(repair?.customerPhone || "");
  const notes = escapeHtml(repair?.notes || "");
  const repairNo = escapeHtml(makeRepairNumber(repair));
  const receiptDate = escapeHtml(formatDateTime(repair?.createdAt || repair?.date || repair?.repairDate || nowValue()));
  const parts = escapeHtml(getFormattedParts(repair));
  const priceValue = Math.max(0, safeNumber(repair?.price ?? 0));
  const discountValueNum = Math.max(0, safeNumber(repair?.discount ?? 0));
  const finalTotalNum = Math.max(0, safeNumber(repair?.finalTotal ?? priceValue - discountValueNum));
  const total = escapeHtml(formatCurrency(priceValue));
  const discount = escapeHtml(formatCurrency(discountValueNum));
  const finalTotal = escapeHtml(formatCurrency(finalTotalNum));
  const paidNum = Math.max(0, safeNumber(repair?.paidAmount ?? 0));
  const paid = escapeHtml(formatCurrency(paidNum));
  const balanceNum = Math.max(0, finalTotalNum - paidNum);
  const balance = escapeHtml(formatCurrency(balanceNum));
  const payCode = escapeHtml(getPaymentShortcodeForBalance(balanceNum));
  const payQr = getDialerQrUrl(payCode);
  const websiteQr = getReceiptQrUrl(websiteUrl);
  const showPaymentHelp = balanceNum > 0 && printing?.showQrCode !== false;
  const paymentStatus = getRepairPaymentStatus(repair);
  const receivedDate = escapeHtml(formatDateTime(repair?.createdAt || repair?.date || repair?.repairDate || nowValue()));
  const printedDate = escapeHtml(formatDateTime(printedAt));
  const footerText = escapeHtml(getGeneralSettings().footerText || DEFAULT_SETTINGS.general.footerText || "Thank you for choosing Waasuge Electronics.");
  const servedBy = escapeHtml(localStorage.getItem("electronicShopAdminName") || localStorage.getItem("electronicShopAdminEmail") || "Current user");
  const copies = [];
  if (printing?.printCustomerCopy !== false) copies.push("customer");
  if (printing?.printShopCopy) copies.push("shop");
  if (!copies.length) copies.push("customer");

  const receiptLogo = printing?.showLogo !== false ? '<div class="receipt-logo"><i class="bi bi-shop"></i></div>' : "";
  const copiesHtml = copies.map((copy, index) => `
    <section class="receipt ${copy}-copy ${receiptClass}" style="${index ? 'page-break-before: always;' : ''}">
      <div class="receipt-copy-label">${copy === "shop" ? "Shop Copy" : "Customer Copy"}</div>
      <header class="receipt-header">
        <div class="receipt-brand">
          ${receiptLogo}
          <div>
            <div class="shop-name">${shopName}</div>
            <div class="shop-subtitle">Repair Receipt</div>
          </div>
        </div>
        <div class="receipt-meta">
          <div class="receipt-meta-label">Repair ID</div>
          <strong>${repairNo}</strong>
        </div>
      </header>
      <div class="receipt-contact">
        ${printing?.showPhoneNumber !== false ? `<div><i class="bi bi-telephone"></i> ${phone}</div>` : ""}
        ${printing?.showWhatsappNumber !== false ? `<div><i class="bi bi-whatsapp"></i> ${whatsapp}</div>` : ""}
        ${printing?.showAddress !== false ? `<div><i class="bi bi-geo-alt"></i> ${escapeHtml(getGeneralSettings().address || DEFAULT_SETTINGS.general.address)}</div>` : ""}
        <div><i class="bi bi-person-badge"></i> Served by: ${servedBy}</div>
      </div>
      <div class="receipt-card">
        <div class="row-line"><span>Queue</span><strong>#${escapeHtml(queueNo)}</strong></div>
        <div class="row-line"><span>Customer</span><strong>${customer}</strong></div>
        <div class="row-line"><span>Phone</span><strong>${customerPhone}</strong></div>
        <div class="row-line"><span>Device</span><strong>${device}</strong></div>
        <div class="row-line"><span>Status</span><strong class="payment-status ${paymentStatus.className}">${escapeHtml(displayStatusLabel(repair?.status) || repair?.status || "Pending")}</strong></div>
      </div>
      <div class="receipt-card">
        <div class="row-line"><span>Problem</span><strong>${escapeHtml(getRepairProblemValue(repair) || "—")}</strong></div>
        <div class="row-line"><span>Parts / Service</span><strong>${parts || "—"}</strong></div>
        <div class="row-line"><span>Received</span><strong>${receivedDate}</strong></div>
        <div class="row-line"><span>Printed</span><strong>${printedDate}</strong></div>
      </div>
      <div class="receipt-card totals">
        <div class="row-line"><span>Total Price</span><strong>${total}</strong></div>
        <div class="row-line"><span>Discount</span><strong>${discount}</strong></div>
        <div class="row-line"><span>Final Total</span><strong>${finalTotal}</strong></div>
        <div class="row-line"><span>Total Paid</span><strong>${paid}</strong></div>
        <div class="row-line total"><span>Remaining Balance</span><strong>${balance}</strong></div>
      </div>
      ${showPaymentHelp ? `
      <div class="receipt-paybox">
        <div class="pay-title">Habkaan Ubixi Lacagta</div>
        <div class="pay-code">${payCode}</div>
        <div class="pay-sub">Use the dial/USSD code with the remaining balance only.</div>
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
        <title>Repair Ticket - ${repairNo}</title>
        <meta charset="utf-8" />
        <style>
          @page { margin: ${topMargin}mm ${rightMargin}mm ${bottomMargin}mm ${leftMargin}mm; }
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
            line-height: 1.35;
          }
          body { padding: ${padding}px; }
          .receipt { width: 100%; page-break-inside: avoid; break-inside: avoid; }
          .receipt-copy-label { text-align:center; font-size:10px; letter-spacing:.12em; text-transform:uppercase; color:#64748b; margin-bottom:8px; font-weight:700; }
          .receipt-header { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; border-bottom:2px solid #0f172a; padding-bottom:10px; margin-bottom:10px; }
          .receipt-brand { display:flex; align-items:flex-start; gap:8px; min-width:0; }
          .receipt-logo { width:34px; height:34px; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; background:rgba(37,99,235,.1); color:#2563eb; flex:0 0 auto; margin-top:1px; }
          .receipt-logo i { font-size:1.1em; line-height:1; }
          .shop-name { font-size:1.18em; font-weight:800; line-height:1.15; }
          .shop-subtitle { font-size:.84em; color:#64748b; margin-top:2px; }
          .receipt-meta { text-align:right; font-size:.88em; color:#334155; display:grid; gap:2px; }
          .receipt-meta-label { text-transform:uppercase; letter-spacing:.08em; font-size:.78em; color:#64748b; font-weight:800; }
          .receipt-contact { display:grid; gap:4px; font-size:.84em; color:#334155; margin-bottom:10px; }
          .receipt-card { border:1px solid #e2e8f0; border-radius:14px; padding:10px; margin-bottom:10px; background:#fff; }
          .row-line { display:flex; justify-content:space-between; gap:8px; align-items:flex-start; margin:4px 0; }
          .row-line span { color:#64748b; }
          .row-line strong { text-align:right; }
          .payment-status { display:inline-flex; align-items:center; justify-content:center; padding:2px 10px; border-radius:999px; font-weight:800; letter-spacing:.02em; }
          .payment-status--paid { color:#166534; background:#dcfce7; }
          .payment-status--partial { color:#92400e; background:#fef3c7; }
          .payment-status--unpaid { color:#991b1b; background:#fee2e2; }
          .totals .total { font-size:1.05em; font-weight:800; }
          .receipt-paybox { border:1.5px dashed #2563eb; border-radius:14px; padding:10px; margin-bottom:10px; background:linear-gradient(180deg, rgba(37,99,235,.06), rgba(37,99,235,.02)); text-align:center; }
          .pay-title { font-size:.82em; text-transform:uppercase; letter-spacing:.08em; color:#1d4ed8; font-weight:900; }
          .pay-code { font-size:1.1em; font-weight:900; margin-top:4px; word-break:break-all; color:#0f172a; }
          .pay-sub { font-size:.8em; color:#64748b; margin-top:4px; }
          .receipt-qr-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; }
          .qr-card { border:1px solid #e2e8f0; border-radius:14px; padding:8px; text-align:center; background:#fff; }
          .qr-card img { width:100%; max-width:110px; display:block; margin:0 auto 4px; }
          .qr-card div { font-size:.78em; color:#475569; font-weight:700; }
          .receipt-footer { display:grid; justify-items:center; gap:4px; font-size:.8em; color:#475569; border-top:1px solid #e2e8f0; padding-top:8px; text-align:center; }
          .footer-message, .footer-website { width:100%; text-align:center; }
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
    showToast("Popup blocked by browser", "warning", "Print");
    return;
  }
  win.document.write(html);
  win.document.close();
}

function openRepairDeleteModal(repair, mode = "soft") {
  const modal = getEl("repairDeleteConfirmModal");
  if (!modal || !repair) return;
  state.pendingDeleteId = repair.id || repair.repairId || null;
  state.pendingDeleteMode = mode;
  const title = getEl("repairDeleteConfirmTitle");
  const body = getEl("repairDeleteConfirmBody");
  if (title) title.textContent = mode === "hard" ? "Delete Repair Forever" : "Move Repair to Trash";
  if (body) {
    body.innerHTML = `
      <div class="border rounded-4 p-3 bg-body-tertiary">
        <div class="fw-bold fs-5 mb-1">${repair.customerName || "Unknown customer"}</div>
        <div class="text-muted small mb-3">${repair.deviceName || "Unknown device"} • ${repair.customerPhone || "No phone"}</div>
        <div class="row g-2 small">
          <div class="col-6"><div class="p-2 bg-white border rounded-3"><div class="text-muted">Status</div><div class="fw-semibold">${repair.status || "Unpaid"}</div></div></div>
          <div class="col-6"><div class="p-2 bg-white border rounded-3"><div class="text-muted">Total</div><div class="fw-semibold">${formatCurrency(repair.finalTotal ?? repair.price ?? 0)}</div></div></div>
          <div class="col-6"><div class="p-2 bg-white border rounded-3"><div class="text-muted">Paid</div><div class="fw-semibold">${formatCurrency(repair.paidAmount ?? 0)}</div></div></div>
          <div class="col-6"><div class="p-2 bg-white border rounded-3"><div class="text-muted">Balance</div><div class="fw-semibold">${formatCurrency(Math.max(0, safeNumber(repair.finalTotal ?? repair.price ?? 0) - safeNumber(repair.paidAmount ?? 0)))}</div></div></div>
          <div class="col-12"><div class="p-2 bg-white border rounded-3"><div class="text-muted">Device / Parts</div><div class="fw-semibold">${repair.deviceName || "Unknown device"} • ${getFormattedParts(repair)}</div></div></div>
        </div>
      </div>`;
  }
  const softBtn = modal.querySelector("[data-repair-soft-delete]");
  const hardBtn = modal.querySelector("[data-repair-hard-delete]");
  if (softBtn) softBtn.dataset.repairSoftDelete = String(state.pendingDeleteId || "");
  if (hardBtn) hardBtn.dataset.repairHardDelete = String(state.pendingDeleteId || "");
  openModalOnTop("repairDeleteConfirmModal");
}

async function deleteRepairItem(id, mode = "soft") {
  if (!id) return;
  const repair = getRepairByIdFromState(id);
  if (!repair) return;
  openRepairDeleteModal(repair, mode);
}

async function restoreRepairItem(id) {
  if (!id) return;
  try {
    await restoreRepair(id);
    showToast("Repair restored successfully", "restore", "Repair");
    await loadRepairs();
  } catch (error) {
    console.error(error);
    showToast("Could not restore repair", "error", "Repair");
  }
}

async function updateRepairStatusInline(repair, nextStatus) {
  if (!repair || !nextStatus) return;
  try {
    await updateRepair(repair.id || repair.repairId, {
      ...repair,
      status: nextStatus,
      statusHistory: buildStatusHistory(repair, nextStatus, nowValue()),
      statusTimeline: buildStatusHistory(repair, nextStatus, nowValue()),
      statusTimestamps: buildStatusHistory(repair, nextStatus, nowValue()),
      updatedAt: nowValue(),
      isDeleted: false,
      deleted: false
    });
    showToast(`Repair moved to ${displayStatusLabel(nextStatus)}`, "success", "Repair");
    await loadRepairs();
  } catch (error) {
    console.error(error);
    showToast(error?.message || "Could not update repair status", "error", "Repair");
  }
}

async function handleActionClick(event) {
  const typeButton = event.target.closest("[data-type-action]");
  if (typeButton) {
    const types = getStoredTypes();
    const index = safeNumber(typeButton.dataset.typeIndex, -1);
    if (index < 0 || index >= types.length) return;
    const action = typeButton.dataset.typeAction;
    if (action === "edit") {
      const next = window.prompt("Edit device type", types[index]);
      if (!next) return;
      types[index] = next.trim();
      saveStoredTypes(types);
      renderRepairTypeManager();
      showToast("Device type updated", "success", "Type");
      return;
    }
    if (action === "delete") {
      if (!window.confirm(`Delete device type "${types[index]}"?`)) return;
      types.splice(index, 1);
      saveStoredTypes(types);
      renderRepairTypeManager();
      showToast("Device type deleted", "delete", "Type");
      return;
    }
  }
  const modalSoftBtn = event.target.closest("[data-repair-soft-delete]");
  if (modalSoftBtn) {
    const id = modalSoftBtn.dataset.repairSoftDelete;
    const repair = getRepairByIdFromState(id);
    if (!repair) return;
    deleteRepair(repair.id || repair.repairId || id, { hardDelete: false }).then(async () => { showToast("Repair moved to trash", "delete", "Repair"); await loadRepairs(); hideRepairModal("repairDeleteConfirmModal"); }).catch((error) => { console.error(error); showToast("Could not delete repair", "error", "Repair"); });
    return;
  }
  const modalHardBtn = event.target.closest("[data-repair-hard-delete]");
  if (modalHardBtn) {
    const id = modalHardBtn.dataset.repairHardDelete;
    const repair = getRepairByIdFromState(id);
    if (!repair) return;
    deleteRepair(repair.id || repair.repairId || id, { hardDelete: true }).then(async () => { showToast("Repair permanently deleted", "delete", "Repair"); await loadRepairs(); hideRepairModal("repairDeleteConfirmModal"); }).catch((error) => { console.error(error); showToast("Could not delete repair", "error", "Repair"); });
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  flashActionButtonLoading(button);
  const action = button.dataset.action;
  const id = button.dataset.id;
  const repair = getRepairByIdFromState(id);
  if (!repair && action !== "restore") return;

  if (action === "view") {
    renderTrackingModal(repair);
    openModalOnTop("repairTrackingModal");
    return;
  }

  if (action === "edit" || action === "pay") {
    state.formMode = action === "pay" ? "pay" : "edit";
    state.activeRepairRecord = repair;
    setRepairModalTitle(state.formMode);
    fillForm(repair);
    syncRepairPaymentFields();
    setRepairPayModeUI(action === "pay", collectRepairModalFields(), repair);
    showToast(action === "pay" ? "Repair loaded for payment" : "Repair loaded into form", action === "pay" ? "info" : "Repair", action === "pay" ? "Payment" : "Repair");
    openModalOnTop("newRepairModal");
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  if (action === "delete") {
    deleteRepairItem(id, "soft");
    return;
  }

  if (action === "history") {
    await openRepairCustomerHistory(repair);
    return;
  }

  if (action === "restore") {
    restoreRepairItem(id);
    return;
  }

  if (action === "tracking") {
    renderTrackingModal(repair);
    openModalOnTop("repairTrackingModal");
    return;
  }
  if (action === "history") {
    await openRepairCustomerHistory(repair);
    return;
  }
  if (action === "payment-toggle") {
    const total = Math.max(0, safeNumber(repair?.finalTotal ?? repair?.price ?? 0));
    const paid = safeNumber(repair?.paidAmount ?? 0);
    const nextPaid = paid >= total ? 0 : total;
    updateRepair(repair.id || repair.repairId || id, {
      paidAmount: nextPaid,
      updatedAt: nowValue()
    }).then(async () => {
      showToast(nextPaid >= total ? "Marked as paid" : "Marked as unpaid", "success", "Repair");
      await loadRepairs();
      const trackingModal = document.getElementById("repairTrackingModal");
      if (trackingModal?.classList.contains("show")) {
        renderTrackingModal(getRepairByIdFromState(id) || repair);
      }
    }).catch((error) => {
      console.error(error);
      showToast("Could not update payment status", "error", "Repair");
    });
    return;
  }
  if (action === "print") {
    printRepair(repair);
    return;
  }
  if (action === "whatsapp" || action === "sms") {
    openShareLink(repair, action);
    return;
  }

  if (action === "status-next") {
    const next = nextStatusValue(repair?.status);
    updateRepairStatusInline(repair, next);
    return;
  }
}

function initFilters() {
  const search = getEl("repairSearch");
  const status = getEl("repairStatusFilter");
  const date = getEl("repairDateFilter");
  const payment = getEl("repairPaymentFilter");
  const exactDate = getEl("repairExactDate");
  const rows = getEl("repairRowsFilter");
  const resetFiltersBtn = getEl("resetRepairFilters");
  const viewButtons = qsa("[data-repair-view]");
  const addTypeBtn = getEl("openRepairTypeManagerBtn");
  addTypeBtn?.addEventListener("click", () => {
    renderRepairTypeManager();
    openModalOnTop("repairTypeManagerModal");
  });

  repairDropdownInstances.problem = setupSearchableFilterDropdown(getEl("repairProblemFilterDropdown"), {
    allLabel: "All Problems",
    icon: "bi-exclamation-triangle",
    getItems: () => getRepairProblemCatalog(),
    getSelected: () => state.problemFilter || "All Problems",
    onSelect: (value) => {
      state.problemFilter = value || "All Problems";
      renderRepairs();
    }
  });

  repairDropdownInstances.service = setupSearchableFilterDropdown(getEl("repairServiceFilterDropdown"), {
    allLabel: "All Parts / Services",
    icon: "bi-tools",
    getItems: () => getRepairServiceCatalog(),
    getSelected: () => state.serviceFilter || "All Parts / Services",
    onSelect: (value) => {
      state.serviceFilter = value || "All Parts / Services";
      renderRepairs();
    }
  });

  const rerender = debounce(() => renderRepairs(), 150);

  [search, status, date, payment, exactDate, rows].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", rerender);
    el.addEventListener("change", rerender);
  });

  viewButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.repairView;
      state.currentView = view;
      viewButtons.forEach((item) => item.classList.toggle("active", item === btn));
      getEl("activeRepairsSection")?.classList.toggle("d-none", view !== VIEW.active);
      getEl("trashRepairsSection")?.classList.toggle("d-none", view !== VIEW.trash);
    });
  });

  resetFiltersBtn?.addEventListener("click", () => {
    if (search) search.value = "";
    if (status) status.value = "all";
    if (date) date.value = "all";
    if (payment) payment.value = "all";
    if (rows) rows.value = "5";
    if (exactDate) exactDate.value = "";
    state.problemFilter = "All Problems";
    state.serviceFilter = "All Parts / Services";
    refreshRepairDropdowns();
    renderRepairs();
    showToast("Repair filters cleared", "info", "Repair");
  });
}

function initForm() {
  const form = getEl("repairForm");
  if (!form) return;
  form.addEventListener("submit", saveRepair);
  getEl("repairSubmitBtn")?.addEventListener("click", () => form.requestSubmit ? form.requestSubmit() : saveRepair(new Event("submit", { cancelable: true, bubbles: true })));
  populateTypeOptions();

  ["repairPrice", "repairDiscount"].forEach((id) => {
    const el = getEl(id);
    el?.addEventListener("input", updateFinalTotalPreview);
    el?.addEventListener("change", updateFinalTotalPreview);
  });
  const paidAmountEl = getEl("repairPaidAmount");
  paidAmountEl?.addEventListener("input", () => {
    clampRepairPaidNowValue();
    updateFinalTotalPreview();
  });

  const newRepairTrigger = document.querySelector('[data-bs-target="#newRepairModal"]');
  newRepairTrigger?.addEventListener("click", () => {
    prepareNewRepairModal();
  });
  paidAmountEl?.addEventListener("change", () => {
    clampRepairPaidNowValue();
    updateFinalTotalPreview();
  });
  ["repairWarrantyDays", "repairWarrantyStart"].forEach((id) => {
    const el = getEl(id);
    el?.addEventListener("input", syncWarrantyFields);
    el?.addEventListener("change", syncWarrantyFields);
  });

  const problemSearch = getEl("repairProblemSearch");
  const serviceSearch = getEl("repairServiceSearch");
  problemSearch?.addEventListener("input", updateProblemList);
  serviceSearch?.addEventListener("input", updateServiceList);
  problemSearch?.addEventListener("focus", updateProblemList);
  serviceSearch?.addEventListener("focus", updateServiceList);
  getEl("repairProblemClearBtn")?.addEventListener("click", () => {
    if (problemSearch) problemSearch.value = "";
    updateProblemList();
    problemSearch?.focus();
  });
  getEl("repairServiceClearBtn")?.addEventListener("click", () => {
    if (serviceSearch) serviceSearch.value = "";
    updateServiceList();
    serviceSearch?.focus();
  });
  document.addEventListener("click", (event) => {
    const problemPicker = getEl("repairProblemPicker");
    const servicePicker = getEl("repairServicePicker");
    if (problemPicker && !problemPicker.contains(event.target)) closeRepairPicker("repairProblemPanel");
    if (servicePicker && !servicePicker.contains(event.target)) closeRepairPicker("repairServicePanel");
  });
  getEl("repairStatus")?.setAttribute("disabled", "disabled");
  getEl("repairTypeAddBtn")?.addEventListener("click", () => {
    const input = getEl("repairTypeInput");
    const value = String(input?.value || "").trim();
    if (!value) return;
    const types = getStoredTypes();
    types.push(value);
    saveStoredTypes(types);
    if (input) input.value = "";
    renderRepairTypeManager();
    showToast("Device type added", "success", "Type");
  });
  getEl("repairResetBtn")?.addEventListener("click", () => {
    resetForm();
    showToast("Repair form reset", "info", "Repair");
  });
}

function renderRepairTypeManager() {
  const body = getEl("repairTypeManagerBody");
  if (!body) return;
  const types = getStoredTypes();
  if (!types.length) {
    body.innerHTML = '<div class="text-center text-muted py-4">No device types yet.</div>';
    return;
  }
  body.innerHTML = types.map((type, index) => `
    <div class="d-flex align-items-center justify-content-between border rounded-4 p-3 mb-2">
      <div class="fw-semibold">${type}</div>
      <div class="btn-group btn-group-sm">
        <button type="button" class="btn btn-outline-success" data-type-action="edit" data-type-index="${index}"><i class="bi bi-pencil-square"></i></button>
        <button type="button" class="btn btn-outline-danger" data-type-action="delete" data-type-index="${index}"><i class="bi bi-trash3"></i></button>
      </div>
    </div>`).join('');
}

function initPageMeta() {
  const count = getEl("visibleRepairCount");
  if (count) count.textContent = "0";
}

function initRepairPage() {
  if (!document.getElementById("newRepairModal") && !document.getElementById("repairCards")) return;
  initPageMeta();
  initForm();
  initFilters();
  document.addEventListener("click", handleActionClick);
  state.formMode = "create";
  setRepairModalTitle("create");
  setFieldValue("repairDate", new Date().toISOString().slice(0, 10));
  setFieldValue("repairStatus", "Unpaid");
  refreshRepairDropdowns();
  bindRepairCustomerAutocomplete();
  const repairQuickCustomerBinder = typeof bindQuickCustomerButton === "function" ? bindQuickCustomerButton : globalThis.bindQuickCustomerButton;
  if (typeof repairQuickCustomerBinder === "function") repairQuickCustomerBinder("repairNewCustomerBtn", {
    getDefaults: () => ({
      name: getEl("repairCustomerName")?.value || "",
      phone: getEl("repairCustomerPhone")?.value || "",
    }),
    onCreated: (customer) => {
      setFieldValue("repairCustomerName", customer?.fullName || customer?.name || "");
      setFieldValue("repairCustomerPhone", customer?.phoneNumber || customer?.phone || "");
      setFieldValue("repairCustomerWhatsapp", customer?.whatsapp || customer?.customerWhatsapp || customer?.phoneNumber || customer?.phone || "");
      setFieldValue("repairSenderNumber", customer?.phoneNumber || customer?.phone || "");
      renderRepairCustomerSuggestions();
    }
  });
  updateFinalTotalPreview();
  loadRepairs().catch((error) => {
    console.error("Failed to load repairs:", error);
    showToast("Repair list could not be loaded", "warning", "Repair");
  });
}

const repairModalEl = document.getElementById("newRepairModal");
if (repairModalEl) {
  repairModalEl.addEventListener("show.bs.modal", () => {
    const currentRepair = state.activeRepairRecord || (state.editId ? getRepairByIdFromState(state.editId) : null);
    const fields = collectRepairModalFields();
    if (state.formMode === "pay") {
      setRepairModalTitle("pay");
      setRepairPayModeUI(true, fields, currentRepair);
    } else if (state.formMode === "edit") {
      setRepairModalTitle("edit");
      setRepairPayModeUI(false, fields, currentRepair);
    } else {
      state.formMode = "create";
      setRepairModalTitle("create");
      setRepairPayModeUI(false, fields, null);
    }
    updateFinalTotalPreview();
  });
}
document.addEventListener("DOMContentLoaded", initRepairPage);

window.ShopRepair = {
  initRepairPage,
  loadRepairs,
  renderRepairs
};
