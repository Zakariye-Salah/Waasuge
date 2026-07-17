import { auth } from "./firebase.js";
import { showToast } from "./main.js";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

const LOGIN_LOCK_KEYS = {
  until: "electronicShopLoginLockUntil",
  stage: "electronicShopLoginLockStage",
  count: "electronicShopLoginFailCount"
};

const LOGIN_LOCK_STEPS = [
  { attempts: 5, durationMs: 30_000, label: "30 seconds" },
  { attempts: 3, durationMs: 5 * 60_000, label: "5 minutes" },
  { attempts: 3, durationMs: 24 * 60 * 60_000, label: "24 hours" }
];

function safeRedirect(url) {
  window.location.assign(url);
}

function setButtonBusy(button, busy, label = "Login") {
  if (!button) return;
  button.disabled = busy;
  button.dataset.originalHtml = button.dataset.originalHtml || button.innerHTML;
  button.innerHTML = busy
    ? '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span> Signing in...'
    : button.dataset.originalHtml;
  if (!busy && label && !button.dataset.originalHtml) button.innerHTML = label;
}

function getFriendlyUserName(user, email) {
  const raw = user?.displayName || email?.split("@")[0] || "User";
  return String(raw)
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function mapLoginError(error) {
  const code = String(error?.code || "");
  if (code.includes("network-request-failed") || code.includes("unavailable")) {
    return "Network error. Please check your internet connection and try again.";
  }
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Username or password are incorrect.";
  }
  if (code.includes("invalid-email")) {
    return "Please enter a valid email address.";
  }
  if (code.includes("too-many-requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (code.includes("user-disabled")) {
    return "This account has been disabled.";
  }
  if (code.includes("operation-not-allowed")) {
    return "Login is not available right now.";
  }
  return "Something went wrong. Please try again.";
}

function getIntegerFromStorage(key) {
  const value = Number.parseInt(localStorage.getItem(key) || "0", 10);
  return Number.isFinite(value) ? value : 0;
}

function getLoginLockState() {
  const until = Number.parseInt(localStorage.getItem(LOGIN_LOCK_KEYS.until) || "0", 10) || 0;
  const stage = Math.max(0, Math.min(LOGIN_LOCK_STEPS.length - 1, getIntegerFromStorage(LOGIN_LOCK_KEYS.stage)));
  const count = Math.max(0, getIntegerFromStorage(LOGIN_LOCK_KEYS.count));
  return { until, stage, count };
}

function saveLoginLockState({ until = 0, stage = 0, count = 0 } = {}) {
  if (until > 0) localStorage.setItem(LOGIN_LOCK_KEYS.until, String(until));
  else localStorage.removeItem(LOGIN_LOCK_KEYS.until);
  localStorage.setItem(LOGIN_LOCK_KEYS.stage, String(stage));
  localStorage.setItem(LOGIN_LOCK_KEYS.count, String(count));
}

function clearLoginLockState() {
  localStorage.removeItem(LOGIN_LOCK_KEYS.until);
  localStorage.removeItem(LOGIN_LOCK_KEYS.stage);
  localStorage.removeItem(LOGIN_LOCK_KEYS.count);
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

function getLockCopy(remainingMs, stage) {
  const tier = LOGIN_LOCK_STEPS[Math.max(0, Math.min(stage, LOGIN_LOCK_STEPS.length - 1))];
  return `Too many wrong attempts. Please wait ${formatCountdown(remainingMs)} before trying again. Next lockout: ${tier.label}.`;
}

function setInputsDisabled(elements, disabled) {
  elements.filter(Boolean).forEach((element) => {
    element.disabled = disabled;
  });
}

function updateLockoutUI({ form, emailInput, passwordInput, rememberInput, togglePassword, submitButton, messageEl } = {}) {
  const state = getLoginLockState();
  const now = Date.now();
  const remaining = state.until - now;
  const locked = remaining > 0;

  if (!locked && state.until) {
    clearLoginLockState();
  }

  const controls = [emailInput, passwordInput, rememberInput, togglePassword, submitButton];
  setInputsDisabled(controls, locked);

  if (submitButton) {
    if (locked) {
      submitButton.dataset.lockedHtml = submitButton.dataset.lockedHtml || submitButton.innerHTML;
      submitButton.innerHTML = `<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span> Wait ${formatCountdown(remaining)}`;
    } else if (submitButton.dataset.originalHtml) {
      submitButton.innerHTML = submitButton.dataset.originalHtml;
    }
  }

  if (messageEl) {
    if (locked) {
      messageEl.textContent = getLockCopy(remaining, state.stage);
      messageEl.classList.remove("text-danger");
      messageEl.classList.add("text-warning-emphasis");
    } else {
      const failCount = getIntegerFromStorage(LOGIN_LOCK_KEYS.count);
      messageEl.textContent = failCount > 0 ? `Wrong attempts: ${failCount}.` : "";
      messageEl.classList.remove("text-warning-emphasis");
    }
  }

  if (form) form.dataset.locked = locked ? "true" : "false";
  return { locked, remaining, state };
}

function triggerLoginLockout(messageEl, submitButton, form, emailInput, passwordInput, rememberInput, togglePassword) {
  const state = getLoginLockState();
  const tier = LOGIN_LOCK_STEPS[Math.max(0, Math.min(state.stage, LOGIN_LOCK_STEPS.length - 1))];
  const until = Date.now() + tier.durationMs;
  const nextStage = Math.min(state.stage + 1, LOGIN_LOCK_STEPS.length - 1);
  saveLoginLockState({ until, stage: nextStage, count: 0 });
  updateLockoutUI({ form, emailInput, passwordInput, rememberInput, togglePassword, submitButton, messageEl });
  showToast(`Too many wrong attempts. Please wait ${tier.label}.`, "warning", "Login locked");
}

export async function loginWithEmailPassword({ email, password, rememberMe = false }) {
  const persistence = rememberMe ? browserLocalPersistence : browserSessionPersistence;
  await setPersistence(auth, persistence);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logout(redirectUrl = "login.html") {
  await signOut(auth);
  localStorage.removeItem("electronicShopAdminEmail");
  localStorage.removeItem("electronicShopAdminUid");
  localStorage.removeItem("electronicShopAuthReady");
  safeRedirect(redirectUrl);
}

export function bindLogoutButtons(selector = ".logout-btn", redirectUrl = "login.html") {
  document.querySelectorAll(selector).forEach((button) => {
    if (button.dataset.logoutBound === "true") return;
    button.dataset.logoutBound = "true";
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      const originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span> Logging out...';
      try {
        await logout(redirectUrl);
      } catch (error) {
        console.error("Logout failed:", error);
        button.disabled = false;
        button.innerHTML = originalHtml;
        showToast(mapLoginError(error), "error", "Logout");
      }
    });
  });
}

export function requireAuth({ redirectUrl = "login.html" } = {}) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      localStorage.setItem("electronicShopAuthReady", "1");
      if (!user) {
        safeRedirect(redirectUrl);
        resolve(null);
        return;
      }
      localStorage.setItem("electronicShopAdminEmail", user.email || "");
      localStorage.setItem("electronicShopAdminUid", user.uid || "");
      bindLogoutButtons();
      resolve(user);
    });
  });
}

export function initLoginPage({
  formId = "loginForm",
  emailId = "email",
  passwordId = "password",
  rememberId = "rememberMe",
  togglePasswordId = "togglePassword",
  toggleIconId = "toggleIcon",
  forgotPasswordBtnId = "forgotPasswordBtn",
  forgotPasswordModalId = "forgotPasswordModal",
  forgotPasswordFormId = "forgotPasswordForm",
  successRedirect = "dashboard.html"
} = {}) {
  const form = document.getElementById(formId);
  const emailInput = document.getElementById(emailId);
  const passwordInput = document.getElementById(passwordId);
  const rememberInput = document.getElementById(rememberId);
  const togglePassword = document.getElementById(togglePasswordId);
  const toggleIcon = document.getElementById(toggleIconId);
  const submitButton = form?.querySelector('button[type="submit"]');
  const lockMessage = document.getElementById("loginLockMessage");
  const forgotPasswordBtn = document.getElementById(forgotPasswordBtnId);
  const forgotPasswordModalEl = document.getElementById(forgotPasswordModalId);
  const forgotPasswordForm = document.getElementById(forgotPasswordFormId);
  const forgotPasswordEmail = document.getElementById("forgotPasswordEmail");
  const forgotPasswordNote = document.getElementById("forgotPasswordNote");

  const savedEmail = localStorage.getItem("electronicShopAdminEmail");
  if (savedEmail && emailInput) emailInput.value = savedEmail;
  if (rememberInput && savedEmail) rememberInput.checked = true;

  onAuthStateChanged(auth, (user) => {
    if (user) safeRedirect(successRedirect);
  });

  if (togglePassword && passwordInput && toggleIcon) {
    togglePassword.addEventListener("click", () => {
      const isPassword = passwordInput.type === "password";
      passwordInput.type = isPassword ? "text" : "password";
      toggleIcon.className = isPassword ? "bi bi-eye-slash" : "bi bi-eye";
    });
  }

  if (forgotPasswordBtn && forgotPasswordModalEl) {
    const modal = window.bootstrap?.Modal ? window.bootstrap.Modal.getOrCreateInstance(forgotPasswordModalEl, {
      backdrop: true,
      keyboard: true,
      focus: true
    }) : null;
    forgotPasswordBtn.addEventListener("click", () => {
      if (forgotPasswordEmail && emailInput?.value) forgotPasswordEmail.value = emailInput.value;
      if (forgotPasswordNote) forgotPasswordNote.value = "";
      if (forgotPasswordModalEl) forgotPasswordModalEl.dataset.reminderSent = "false";
      modal?.show();
    });
  }

  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = forgotPasswordEmail?.value?.trim() || emailInput?.value?.trim() || "your email";
      const note = forgotPasswordNote?.value?.trim();
      const playfulLines = [
        "Your password is on a tiny vacation. Please ask the admin to bring it back 😄",
        `We sent a funny reminder to ${email}. No real email was sent, but the mood was saved ✨`,
        note ? `Note received: “${note}” — that password story was legendary 😂` : "The password is hiding somewhere in the shop drawer. Please check with the admin."
      ];
      showToast(playfulLines.join(" "), "info", "Password rescue");
      const modalEl = document.getElementById(forgotPasswordModalId);
      if (modalEl) modalEl.dataset.reminderSent = "true";
    });
  }

  const lockoutTicker = window.setInterval(() => {
    const state = updateLockoutUI({ form, emailInput, passwordInput, rememberInput, togglePassword, submitButton, messageEl: lockMessage });
    if (!state.locked) {
      window.clearInterval(lockoutTicker);
      updateLockoutUI({ form, emailInput, passwordInput, rememberInput, togglePassword, submitButton, messageEl: lockMessage });
    }
  }, 250);

  updateLockoutUI({ form, emailInput, passwordInput, rememberInput, togglePassword, submitButton, messageEl: lockMessage });

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const lockState = updateLockoutUI({ form, emailInput, passwordInput, rememberInput, togglePassword, submitButton, messageEl: lockMessage });
    if (lockState.locked) {
      showToast(`Please wait ${formatCountdown(lockState.remaining)} before trying again.`, "warning", "Login locked");
      return;
    }

    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value || "";
    const rememberMe = Boolean(rememberInput?.checked);

    if (!email || !password) {
      showToast("Enter email and password.", "warning", "Login");
      return;
    }

    try {
      setButtonBusy(submitButton, true);
      const user = await loginWithEmailPassword({ email, password, rememberMe });
      clearLoginLockState();
      if (lockMessage) lockMessage.textContent = "";
      localStorage.setItem("electronicShopAdminEmail", email);
      localStorage.setItem("electronicShopAdminUid", user?.uid || "");
      const displayName = getFriendlyUserName(user, email);
      showToast(`Login successful, ${displayName}.`, "success", "Welcome back");
      setTimeout(() => safeRedirect(successRedirect), 300);
    } catch (error) {
      console.error("Login failed:", error);
      const code = String(error?.code || "");
      const isCredentialError = code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found");

      if (isCredentialError) {
        const state = getLoginLockState();
        const nextCount = state.count + 1;
        const tier = LOGIN_LOCK_STEPS[Math.max(0, Math.min(state.stage, LOGIN_LOCK_STEPS.length - 1))];
        if (nextCount >= tier.attempts) {
          triggerLoginLockout(lockMessage, submitButton, form, emailInput, passwordInput, rememberInput, togglePassword);
        } else {
          saveLoginLockState({ until: 0, stage: state.stage, count: nextCount });
          updateLockoutUI({ form, emailInput, passwordInput, rememberInput, togglePassword, submitButton, messageEl: lockMessage });
          showToast(mapLoginError(error), "error", "Login");
        }
      } else {
        showToast(mapLoginError(error), "error", "Login");
      }
    } finally {
      setButtonBusy(submitButton, false);
      updateLockoutUI({ form, emailInput, passwordInput, rememberInput, togglePassword, submitButton, messageEl: lockMessage });
    }
  });
}

window.ShopAuth = {
  loginWithEmailPassword,
  logout,
  bindLogoutButtons,
  requireAuth,
  initLoginPage
};
