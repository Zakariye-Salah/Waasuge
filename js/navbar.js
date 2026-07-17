import { showToast } from "./main.js";
import { auth } from "./firebase.js";
import { PATHS, editRecord, getOnce } from "./database.js";
import { updateProfile, updatePassword } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { DEFAULT_SETTINGS, getGeneralSettings } from "./settings-config.js";

// js/navbar.js
const SIDEBAR_KEY = "waasugeSidebarCollapsed";

function currentFileName() {
  const path = window.location.pathname;
  const file = path.split("/").pop() || "login.html";
  return file.toLowerCase();
}

function isMatch(href, current) {
  const linkFile = String(href || "").split("/").pop().toLowerCase();
  if (!linkFile) return false;
  if (linkFile === current) return true;
  if (current === "" && linkFile === "login.html") return true;
  return false;
}

function setActiveLinks() {
  const current = currentFileName();

  const links = document.querySelectorAll(
    ".sidebar .nav-link, .mobile-nav .nav-link, .mobile-bottom-nav a, .offcanvas .nav-link"
  );

  links.forEach((link) => {
    const href = link.getAttribute("href");
    const active = href ? isMatch(href, current) : false;
    link.classList.toggle("active", active);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function applySidebarState(collapsed) {
  const isDesktop = window.matchMedia("(min-width: 992px)").matches;
  document.body.classList.toggle("sidebar-collapsed", Boolean(collapsed) && isDesktop);

  const toggleBtns = document.querySelectorAll("[data-sidebar-toggle]");
  toggleBtns.forEach((toggleBtn) => {
    toggleBtn.setAttribute("aria-expanded", String(!collapsed));
    const icon = toggleBtn.querySelector("i");
    if (!icon) return;
    icon.className = isDesktop && collapsed ? "bi bi-layout-sidebar-inset" : "bi bi-list";
  });
}


function syncSidebarUser() {
  const nameEl = document.getElementById("sidebarCurrentUser");
  const emailEl = document.getElementById("sidebarCurrentUserEmail");
  const phoneEl = document.getElementById("sidebarCurrentUserPhone");
  const email = localStorage.getItem("electronicShopAdminEmail") || localStorage.getItem("electronicShopAdminUid") || "";
  const name = localStorage.getItem("electronicShopAdminName") || "";
  const phone = localStorage.getItem("electronicShopAdminPhone") || "";
  const value = name || (email ? email.split("@")[0] : "Current user");
  if (nameEl) {
    nameEl.textContent = value;
    nameEl.title = email || value;
  }
  if (emailEl) emailEl.textContent = email || "user@example.com";
  if (phoneEl) phoneEl.textContent = phone || "No phone";
}


async function hydrateAdminProfileFromDatabase() {
  const uid = auth.currentUser?.uid || localStorage.getItem("electronicShopAdminUid") || "";
  if (!uid) return;
  try {
    const record = await getOnce(`${PATHS.users}/${uid}`);
    if (record && typeof record === "object") {
      const storedName = String(record.displayName || record.name || "").trim();
      const storedPhone = String(record.phone || record.phoneNumber || "").trim();
      const storedEmail = String(record.email || "").trim();
      if (storedName) localStorage.setItem("electronicShopAdminName", storedName);
      if (storedPhone) localStorage.setItem("electronicShopAdminPhone", storedPhone);
      if (storedEmail && !localStorage.getItem("electronicShopAdminEmail")) {
        localStorage.setItem("electronicShopAdminEmail", storedEmail);
      }
    }
  } catch (error) {
    console.warn("Could not hydrate profile from database:", error);
  }
  syncSidebarUser();
}

function initSidebarToggle() {
  const toggleBtns = document.querySelectorAll("[data-sidebar-toggle]");
  if (!toggleBtns.length) return;

  const saved = localStorage.getItem(SIDEBAR_KEY);
  applySidebarState(saved === "1");

  toggleBtns.forEach((toggleBtn) => {
    toggleBtn.addEventListener("click", () => {
      const isDesktop = window.matchMedia("(min-width: 992px)").matches;
      if (!isDesktop) {
        const offcanvasEl = document.getElementById("mobileNav");
        const offcanvas = offcanvasEl && window.bootstrap?.Offcanvas.getOrCreateInstance(offcanvasEl);
        if (offcanvas) offcanvas.show();
        return;
      }
      const collapsed = !document.body.classList.contains("sidebar-collapsed");
      localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
      applySidebarState(collapsed);
    });
  });

  window.addEventListener("resize", () => {
    const savedNow = localStorage.getItem(SIDEBAR_KEY) === "1";
    applySidebarState(savedNow);
  });
}

function closeOffcanvasAfterClick() {
  const offcanvasEl = document.getElementById("mobileNav");
  if (!offcanvasEl) return;

  const links = offcanvasEl.querySelectorAll("a.nav-link");
  links.forEach((link) => {
    link.addEventListener("click", () => {
      const instance = window.bootstrap?.Offcanvas.getInstance(offcanvasEl);
      if (instance) instance.hide();
    });
  });
}


function ensureSidebarUserCard() {
  const nav = document.querySelector(".sidebar .nav-pills, .sidebar-nav .nav-pills");
  if (!nav || document.getElementById("sidebarUserPanel")) return;

  const wrapper = document.createElement("li");
  wrapper.className = "nav-item mt-2";
  wrapper.id = "sidebarUserPanel";
  wrapper.innerHTML = `
    <button type="button" class="sidebar-user-box sidebar-footer-box d-flex align-items-center gap-2 p-3 rounded-4 bg-light border w-100 text-start" data-bs-toggle="modal" data-bs-target="#headerProfileModal">
      <div class="rounded-circle d-flex align-items-center justify-content-center bg-primary text-white flex-shrink-0" style="width:42px;height:42px;">
        <i class="bi bi-person-badge"></i>
      </div>
      <div class="min-w-0 flex-grow-1">
        <div class="small text-muted">Current user</div>
        <div class="fw-semibold text-truncate" id="sidebarCurrentUser">Current user</div>
        <div class="small text-muted text-truncate" id="sidebarCurrentUserEmail">user@example.com</div>
        <div class="small text-muted text-truncate" id="sidebarCurrentUserPhone">No phone</div>
      </div>
    </button>`;
  nav.insertAdjacentElement("afterend", wrapper);
}

function welcomeModalHtml() {
  return `
  <div class="modal fade welcome-modal" id="welcomeModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content rounded-4 border-0 shadow-lg overflow-hidden">
        <div class="modal-header border-0 pb-0">
          <div>
            <div class="small text-uppercase fw-bold text-primary mb-1">Welcome back</div>
            <h5 class="modal-title fw-bold mb-1">${getGeneralSettings().shopName || DEFAULT_SETTINGS.general.shopName}</h5>
            <div class="modal-subtitle small text-muted">Your shop dashboard is ready.</div>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body pt-3">
          <div class="d-flex align-items-center gap-3 p-3 rounded-4 border bg-body-tertiary">
            <div class="rounded-circle d-flex align-items-center justify-content-center bg-primary text-white flex-shrink-0" style="width:56px;height:56px;">
              <i class="bi bi-stars fs-4"></i>
            </div>
            <div class="min-w-0">
              <div class="fw-bold fs-5" id="welcomeUserName">Admin</div>
              <div class="text-muted" id="welcomeUserEmail">user@example.com</div>
              <div class="small text-muted mt-1">Mobile repairing, electronics sales, invoices, reports, and fast service management.</div>
            </div>
          </div>
        </div>
        <div class="modal-footer border-0 pt-0">
          <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Get started</button>
        </div>
      </div>
    </div>
  </div>`;
}

function ensureWelcomeModal() {
  const email = localStorage.getItem("electronicShopAdminEmail") || localStorage.getItem("electronicShopAdminUid") || "";
  if (!email || sessionStorage.getItem("electronicShopWelcomeShown") === email) return;
  if (!document.getElementById("welcomeModal")) {
    const wrap = document.createElement("div");
    wrap.id = "welcomeModalWrap";
    wrap.innerHTML = welcomeModalHtml();
    document.body.appendChild(wrap);
  }
  const name = localStorage.getItem("electronicShopAdminName") || (email ? email.split("@")[0] : "Admin");
  const emailEl = document.getElementById("welcomeUserEmail");
  const nameEl = document.getElementById("welcomeUserName");
  if (emailEl) emailEl.textContent = email;
  if (nameEl) nameEl.textContent = name;
  sessionStorage.setItem("electronicShopWelcomeShown", email);
  setTimeout(() => {
    const modalEl = document.getElementById("welcomeModal");
    if (modalEl) window.bootstrap?.Modal.getOrCreateInstance(modalEl)?.show();
  }, 650);
}

const HEADER_MORE_MODAL_FLAG = "headerMoreModalsReady";
let headerMoreDropdownShouldReopen = false;
const ADMIN_NAME_KEY = "electronicShopAdminName";
const ADMIN_PHONE_KEY = "electronicShopAdminPhone";

function getHeaderActionGroup() {
  return document.querySelector(".app-header .d-flex.align-items-center.gap-2.gap-md-3") || document.querySelector("header .d-flex.align-items-center.gap-2.gap-md-3");
}

function headerMoreButtonHtml() {
  return `
    <div class="dropdown header-more-dropdown">
      <button class="btn btn-light border rounded-circle position-relative header-more-btn" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" aria-label="More options" data-header-more-toggle="">
        <i class="bi bi-three-dots-vertical"></i>
      </button>
      <ul class="dropdown-menu dropdown-menu-end shadow border-0 header-more-menu">
        <li><button class="dropdown-item" type="button" data-more-modal="headerProfileModal"><i class="bi bi-person-gear text-primary"></i><span>Edit Profile</span></button></li>
        <li><button class="dropdown-item" type="button" data-more-modal="headerAboutModal"><i class="bi bi-info-circle text-info"></i><span>About Us</span></button></li>
        <li><button class="dropdown-item" type="button" data-more-modal="headerDeveloperModal"><i class="bi bi-code-slash text-success"></i><span>Developer</span></button></li>
        <li><hr class="dropdown-divider"></li>
        <li><button class="dropdown-item text-danger" type="button" data-more-modal="headerLogoutModal"><i class="bi bi-box-arrow-right"></i><span>Logout</span></button></li>
      </ul>
    </div>`;
}

function headerMoreModalsHtml() {
  return `
  <div class="modal fade" id="headerProfileModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content rounded-4 border-0 shadow-lg">
        <div class="modal-header border-0 pb-0">
          <div>
            <h5 class="modal-title fw-bold mb-1">Edit Profile</h5>
            <div class="modal-subtitle small text-muted">Update your account details.</div>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body pt-3">
          <form id="headerProfileForm" class="row g-3">
            <div class="col-12">
              <label class="form-label">Email</label>
              <input class="form-control" id="headerProfileEmail" type="email" readonly>
            </div>
            <div class="col-md-6">
              <label class="form-label">Name</label>
              <input class="form-control" id="headerProfileName" type="text" placeholder="Your full name">
            </div>
            <div class="col-md-6">
              <label class="form-label">Phone</label>
              <input class="form-control" id="headerProfilePhone" type="tel" placeholder="Phone number">
            </div>
            <div class="col-md-6">
              <label class="form-label">New Password</label>
              <div class="input-group">
                <input class="form-control" id="headerProfilePassword" type="password" placeholder="New password">
                <button class="btn btn-outline-secondary" type="button" id="headerProfilePasswordToggle" aria-label="Show password"><i class="bi bi-eye" id="headerProfilePasswordIcon"></i></button>
              </div>
            </div>
            <div class="col-md-6">
              <label class="form-label">Confirm Password</label>
              <div class="input-group">
                <input class="form-control" id="headerProfilePasswordConfirm" type="password" placeholder="Confirm password">
                <button class="btn btn-outline-secondary" type="button" id="headerProfilePasswordConfirmToggle" aria-label="Show password"><i class="bi bi-eye" id="headerProfilePasswordConfirmIcon"></i></button>
              </div>
            </div>
            <div class="col-12 d-flex justify-content-end gap-2 pt-2">
              <button type="button" class="btn btn-light border" data-bs-dismiss="modal">Cancel</button>
              <button type="submit" class="btn btn-primary"><i class="bi bi-check2-circle me-1"></i>Save Changes</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>

  <div class="modal fade" id="headerAboutModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content rounded-4 border-0 shadow-lg">
        <div class="modal-header border-0 pb-0">
          <div>
            <h5 class="modal-title fw-bold mb-1">About Us</h5>
            <div class="modal-subtitle small text-muted">Waasuge Electronics</div>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body pt-3">
          <p class="mb-2">Waasuge Electronics helps customers with mobile repairing, electrical work, sales, and service management in one clean system.</p>
          <p class="mb-0 text-muted">The dashboard keeps invoices, products, repairs, expenses, reports, and notifications in sync so the shop can move faster and stay organized.</p>
        </div>
      </div>
    </div>
  </div>

  <div class="modal fade" id="headerDeveloperModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content rounded-4 border-0 shadow-lg overflow-hidden">
        <div class="modal-header border-0 pb-0">
          <div>
            <h5 class="modal-title fw-bold mb-1">Developer</h5>
            <div class="modal-subtitle small text-muted">Project creator</div>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body pt-3 text-center">
          <div class="d-flex justify-content-center mb-3">
            <div class="developer-avatar-wrap position-relative">
              <img src="assets/eng-zaki.png" alt="Eng Sakariya Salah" class="rounded-circle border shadow-sm developer-avatar" onerror="this.style.display='none'">
            </div>
          </div>
          <div class="fw-bold fs-4 mb-1">Eng Sakariya Salah</div>
          <div class="text-muted mb-3">Waasuge Electronics & mobile repairing system developer</div>
          <div class="d-grid gap-2 text-start">
            <div class="d-flex align-items-center gap-2 p-2 rounded-3 border bg-body-tertiary"><i class="bi bi-code-slash text-primary"></i><span class="small">Web developer and system builder</span></div>
            <div class="d-flex align-items-center gap-2 p-2 rounded-3 border bg-body-tertiary"><i class="bi bi-phone text-success"></i><span class="small">Mobile repairing and electronics workflows</span></div>
            <div class="d-flex align-items-center gap-2 p-2 rounded-3 border bg-body-tertiary"><i class="bi bi-geo-alt text-danger"></i><span class="small">Waasuge Electronics shop management</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="modal fade" id="headerLogoutModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content rounded-4 border-0 shadow-lg">
        <div class="modal-header border-0 pb-0">
          <div>
            <h5 class="modal-title fw-bold mb-1">Logout</h5>
            <div class="modal-subtitle small text-muted">Confirm to sign out.</div>
          </div>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body pt-3">
          <div class="small text-muted mb-2">Account</div>
          <div class="rounded-4 border p-3 mb-3 bg-body-secondary bg-opacity-25">
            <div class="fw-semibold" id="headerLogoutName">Admin</div>
            <div class="small text-muted" id="headerLogoutEmail">user@example.com</div>
          </div>
          <p class="mb-0">You can log out safely from this device whenever you are ready.</p>
        </div>
        <div class="modal-footer border-0 pt-0">
          <button type="button" class="btn btn-light border" data-bs-dismiss="modal">Cancel</button>
          <button type="button" class="btn btn-danger logout-btn" id="headerLogoutConfirmBtn"><i class="bi bi-box-arrow-right me-1"></i>Logout</button>
        </div>
      </div>
    </div>
  </div>`;
}

function ensureHeaderMoreUI() {
  const group = getHeaderActionGroup();
  if (!group) return;

  group.querySelectorAll(".logout-btn").forEach((btn) => btn.remove());

  if (!group.querySelector("[data-header-more-toggle]")) {
    const insertBeforeEl = group.querySelector('button[aria-label="Cart"], a[aria-label="Back to dashboard"]');
    const wrapper = document.createElement("div");
    wrapper.innerHTML = headerMoreButtonHtml().trim();
    const more = wrapper.firstElementChild;
    if (insertBeforeEl) {
      group.insertBefore(more, insertBeforeEl);
    } else {
      group.appendChild(more);
    }
  }

  if (!document.getElementById(HEADER_MORE_MODAL_FLAG)) {
    const wrapper = document.createElement("div");
    wrapper.id = HEADER_MORE_MODAL_FLAG;
    wrapper.innerHTML = headerMoreModalsHtml();
    document.body.appendChild(wrapper);
  }

  const email = localStorage.getItem("electronicShopAdminEmail") || localStorage.getItem("electronicShopAdminUid") || "";
  const name = localStorage.getItem("electronicShopAdminName") || (email ? email.split("@")[0] : "Admin");
  const profileEmail = document.getElementById("headerProfileEmail");
  const profileName = document.getElementById("headerProfileName");
  const profilePhone = document.getElementById("headerProfilePhone");
  const logoutName = document.getElementById("headerLogoutName");
  const logoutEmail = document.getElementById("headerLogoutEmail");
  if (profileEmail) profileEmail.value = email;
  if (profileName) profileName.value = localStorage.getItem("electronicShopAdminName") || name;
  if (profilePhone) profilePhone.value = localStorage.getItem("electronicShopAdminPhone") || "";
  if (logoutName) logoutName.textContent = name;
  if (logoutEmail) logoutEmail.textContent = email || "user@example.com";

  const passwordPairs = [
    [document.getElementById("headerProfilePasswordToggle"), document.getElementById("headerProfilePassword"), document.getElementById("headerProfilePasswordIcon")],
    [document.getElementById("headerProfilePasswordConfirmToggle"), document.getElementById("headerProfilePasswordConfirm"), document.getElementById("headerProfilePasswordConfirmIcon")],
  ];
  passwordPairs.forEach(([toggle, input, icon]) => {
    if (!toggle || !input || !icon || toggle.dataset.bound === "true") return;
    toggle.dataset.bound = "true";
    toggle.addEventListener("click", () => {
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      icon.className = isPassword ? "bi bi-eye-slash" : "bi bi-eye";
    });
  });

  const profileForm = document.getElementById("headerProfileForm");

  const moreButtons = document.querySelectorAll("[data-more-modal]");
  moreButtons.forEach((btn) => {
    if (btn.dataset.bound === "true") return;
    btn.dataset.bound = "true";
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const targetId = btn.getAttribute("data-more-modal");
      if (!targetId) return;
      headerMoreDropdownShouldReopen = true;
      window.bootstrap?.Modal.getOrCreateInstance(document.getElementById(targetId))?.show();
    });
  });

  if (profileForm && profileForm.dataset.bound !== "true") {
    profileForm.dataset.bound = "true";
    profileForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const nextName = String(document.getElementById("headerProfileName")?.value || "").trim();
      const nextPhone = String(document.getElementById("headerProfilePhone")?.value || "").trim();
      const newPassword = String(document.getElementById("headerProfilePassword")?.value || "");
      const confirmPassword = String(document.getElementById("headerProfilePasswordConfirm")?.value || "");

      if ((newPassword || confirmPassword) && newPassword !== confirmPassword) {
        showToast("Password fields must match.", "warning", "Profile");
        return;
      }

      localStorage.setItem("electronicShopAdminName", nextName || name);
      localStorage.setItem("electronicShopAdminPhone", nextPhone);

      try {
        const user = auth.currentUser;
        if (user && nextName) {
          await updateProfile(user, { displayName: nextName });
        }
        if (user && newPassword) {
          await updatePassword(user, newPassword);
        }
        if (user) {
          await editRecord(PATHS.users, user.uid, {
            uid: user.uid,
            email: user.email || localStorage.getItem("electronicShopAdminEmail") || "",
            displayName: nextName || name || user.displayName || "",
            name: nextName || name || user.displayName || "",
            phone: nextPhone,
            updatedAt: Date.now()
          });
        }
        syncSidebarUser();
        showToast("Profile updated.", "success", "Profile");
        window.bootstrap?.Modal.getOrCreateInstance(document.getElementById("headerProfileModal"))?.hide();
        document.getElementById("headerProfilePassword").value = "";
        document.getElementById("headerProfilePasswordConfirm").value = "";
      } catch (error) {
        console.error("Profile update failed:", error);
        showToast(error?.message || "Profile could not be updated right now.", "warning", "Profile");
      }
    });
  }

  window.ShopAuth?.bindLogoutButtons?.("#headerLogoutConfirmBtn");
}

export function initNavbar() {
  setActiveLinks();
  closeOffcanvasAfterClick();
  initSidebarToggle();
  ensureSidebarUserCard();
  syncSidebarUser();
  hydrateAdminProfileFromDatabase();
  ensureHeaderMoreUI();
  ensureWelcomeModal();

  window.addEventListener("shown.bs.modal", (event) => {
    if (event.target?.id === "headerProfileModal") {
      const email = localStorage.getItem("electronicShopAdminEmail") || localStorage.getItem("electronicShopAdminUid") || "";
      const name = localStorage.getItem("electronicShopAdminName") || (email ? email.split("@")[0] : "Admin");
      const phone = localStorage.getItem("electronicShopAdminPhone") || "";
      const profileEmail = document.getElementById("headerProfileEmail");
      const profileName = document.getElementById("headerProfileName");
      const profilePhone = document.getElementById("headerProfilePhone");
      if (profileEmail) profileEmail.value = email;
      if (profileName) profileName.value = name;
      if (profilePhone) profilePhone.value = phone;
    }
    if (event.target?.id === "headerLogoutModal") {
      const email = localStorage.getItem("electronicShopAdminEmail") || localStorage.getItem("electronicShopAdminUid") || "";
      const name = localStorage.getItem("electronicShopAdminName") || (email ? email.split("@")[0] : "Admin");
      const logoutName = document.getElementById("headerLogoutName");
      const logoutEmail = document.getElementById("headerLogoutEmail");
      if (logoutName) logoutName.textContent = name;
      if (logoutEmail) logoutEmail.textContent = email || "user@example.com";
    }
  });

  window.addEventListener("hidden.bs.modal", (event) => {
    if (!headerMoreDropdownShouldReopen) return;
    if (!["headerProfileModal", "headerAboutModal", "headerDeveloperModal", "headerLogoutModal"].includes(event.target?.id || "")) return;
    const trigger = document.querySelector('[data-header-more-toggle]');
    if (!trigger) return;
    setTimeout(() => {
      window.bootstrap?.Dropdown.getOrCreateInstance(trigger)?.show();
    }, 0);
    headerMoreDropdownShouldReopen = false;
  });

  window.ShopAuth?.bindLogoutButtons?.("#headerLogoutConfirmBtn");
}

window.addEventListener("storage", (event) => {
  if (event.key === "electronicShopAdminEmail" || event.key === "electronicShopAdminUid" || event.key === "electronicShopAdminPhone" || event.key === "electronicShopAdminName") syncSidebarUser();
});

document.addEventListener("DOMContentLoaded", initNavbar);

window.ShopNavbar = {
  initNavbar,
  setActiveLinks,
  applySidebarState
};
