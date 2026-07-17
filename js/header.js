// js/header.js
import { showToast } from "./main.js";

const THEME_KEY = "electronicShopTheme";
const CART_KEY = "electronicShopCartCount";
const NOTIF_KEY = "electronicShopNotificationCount";

function getStoredTheme() {
return localStorage.getItem(THEME_KEY) || "dark";
}

function applyTheme(theme) {
const nextTheme = theme === "light" ? "light" : "dark";
const isDark = nextTheme === "dark";
document.body.classList.toggle("dark-mode", isDark);
document.body.setAttribute("data-bs-theme", isDark ? "dark" : "light");
document.body.dataset.theme = nextTheme;
document.documentElement.setAttribute("data-bs-theme", isDark ? "dark" : "light");
document.documentElement.dataset.theme = nextTheme;
document.documentElement.classList.toggle("dark-mode", isDark);
const icon = document.getElementById("themeIcon");
if (icon) icon.className = isDark ? "bi bi-sun" : "bi bi-moon-stars";
localStorage.setItem(THEME_KEY, nextTheme);
}

function updateBadge(id, value) {
const badge = document.getElementById(id);
if (!badge) return;
const count = Math.max(0, Number(value) || 0);
badge.textContent = String(count);
badge.style.display = count > 0 ? "inline-flex" : "none";
}

export function setCartCount(value) {
localStorage.setItem(CART_KEY, String(Number(value) || 0));
updateBadge("cartBadge", value);
}

export function setNotificationCount(value) {
localStorage.setItem(NOTIF_KEY, String(Number(value) || 0));
updateBadge("notifBadge", value);
}

export function syncHeaderBadges() {
updateBadge("cartBadge", localStorage.getItem(CART_KEY) || 0);
updateBadge("notifBadge", localStorage.getItem(NOTIF_KEY) || 0);
}

export function initThemeToggle() {
const toggle = document.getElementById("themeToggle");
if (!toggle) return;

applyTheme(getStoredTheme());

toggle.addEventListener("click", () => {
const isDark = document.body.classList.contains("dark-mode");
applyTheme(isDark ? "light" : "dark");
showToast(isDark ? "Light mode enabled" : "Dark mode enabled", "info", "Theme");
});
}

export function initHeader() {
syncHeaderBadges();
initThemeToggle();

window.addEventListener("storage", (event) => {
if (event.key === CART_KEY || event.key === NOTIF_KEY) {
syncHeaderBadges();
}
if (event.key === THEME_KEY) {
applyTheme(event.newValue || "dark");
}
});

window.addEventListener("app:cart-changed", (event) => {
setCartCount(event.detail?.count ?? 0);
});

window.addEventListener("app:notif-changed", (event) => {
setNotificationCount(event.detail?.count ?? 0);
});
}

document.addEventListener("DOMContentLoaded", initHeader);

window.ShopHeader = {
initHeader,
initThemeToggle,
syncHeaderBadges,
setCartCount,
setNotificationCount,
applyTheme
};
