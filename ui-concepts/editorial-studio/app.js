const body = document.body;
const openEngineButtons = document.querySelectorAll("[data-open-engine]");
const closeEngineButtons = document.querySelectorAll("[data-close-engine]");
const commandButton = document.querySelector("[data-command]");
const toast = document.querySelector(".command-toast");
const modeButtons = document.querySelectorAll(".mode");
const layoutButton = document.querySelector("[data-toggle-columns]");

function openEngine() {
  body.classList.add("engine-open");
  document.querySelector(".engine-sheet").setAttribute("aria-hidden", "false");
}

function closeEngine() {
  body.classList.remove("engine-open");
  document.querySelector(".engine-sheet").setAttribute("aria-hidden", "true");
}

openEngineButtons.forEach((button) => button.addEventListener("click", openEngine));
closeEngineButtons.forEach((button) => button.addEventListener("click", closeEngine));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeEngine();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    showToast();
  }
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    modeButtons.forEach((mode) => {
      mode.classList.toggle("active", mode === button);
      mode.setAttribute("aria-selected", String(mode === button));
    });
  });
});

layoutButton?.addEventListener("click", () => {
  body.classList.toggle("compact-copy");
  layoutButton.textContent = body.classList.contains("compact-copy") ? "舒展" : "版面";
});

commandButton?.addEventListener("click", showToast);

let toastTimer;
function showToast() {
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
}
