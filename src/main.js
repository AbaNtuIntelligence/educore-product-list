import "./style.css";
import "./progress.css";
import { categoryLabels, loadProducts } from "./productData.js";
import { createProductListPdf } from "./pdfGenerator.js";

const grid = document.querySelector("#productGrid");
const status = document.querySelector("#status");
const search = document.querySelector("#searchInput");
const category = document.querySelector("#categoryFilter");
const count = document.querySelector("#productCount");
const buttons = [document.querySelector("#downloadPdf"), document.querySelector("#printPdf")];
const progressPanel = document.querySelector("#generationProgress");
const progressBar = document.querySelector("#generationProgressBar");
const progressText = document.querySelector("#generationProgressText");
let products = [];
let generationInProgress = false;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function visibleProducts() {
  const term = search.value.trim().toLowerCase();
  return products.filter((product) => {
    const inCategory = category.value === "all" || product.category === category.value;
    const searchable = [product.name, product.sku, product.description, product.unit, ...product.features].join(" ").toLowerCase();
    return inCategory && (!term || searchable.includes(term));
  });
}

function render() {
  const visible = visibleProducts();
  status.textContent = `${visible.length} of ${products.length} products shown`;
  grid.innerHTML = visible.map((product) => `
    <article class="product-card">
      <div class="image-wrap">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}"
          onerror="this.onerror=null;this.src='/images/placeholder.webp'" loading="lazy" />
      </div>
      <div class="product-body">
        <span class="category">${escapeHtml(categoryLabels[product.category] || product.category)}</span>
        <h2>${escapeHtml(product.name)}</h2>
        <div class="meta"><span>SKU: ${escapeHtml(product.sku || "N/A")}</span><span>${escapeHtml(product.unit || "Each")}</span></div>
        <p>${escapeHtml(product.description || "Contact EDUCORE for product specifications.")}</p>
        ${product.features.length ? `<ul>${product.features.slice(0, 4).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
        <strong>Request a Quote</strong>
      </div>
    </article>
  `).join("") || `<div class="empty">No products match your search.</div>`;
}

async function generate(action, button) {
  if (!products.length || generationInProgress) return;
  generationInProgress = true;
  const original = button.textContent;
  const printWindow = action === "print" ? window.open("", "_blank") : null;
  if (action === "print" && !printWindow) {
    status.textContent = "Print was blocked. Allow pop-ups for this site and try again.";
    generationInProgress = false;
    return;
  }
  if (printWindow) {
    printWindow.document.write("<title>Preparing EDUCORE Product List</title><p style='font-family:Arial;padding:32px'>Preparing the print-ready PDF…</p>");
  }
  buttons.forEach((item) => { item.disabled = true; });
  button.textContent = "Preparing images…";
  progressPanel.hidden = false;
  progressBar.value = 0;
  try {
    const result = await createProductListPdf(products, action, (update) => {
      const percent = update.total ? Math.round((update.current / update.total) * 100) : 0;
      progressBar.value = percent;
      progressText.textContent = `${update.stage}${update.total ? `: ${update.current} of ${update.total}` : ""}${update.failures ? ` • ${update.failures} placeholders` : ""}`;
      status.textContent = progressText.textContent;
      if (update.current === 0 || update.current === update.total || update.current % 25 === 0) {
        console.info("[EDUCORE PDF]", update);
      }
    }, printWindow);
    const megabytes = (result.sizeBytes / (1024 * 1024)).toFixed(1);
    status.textContent = `Product list ready (${megabytes} MB)${result.failures ? ` • ${result.failures} images used placeholders` : ""}.`;
  } catch (error) {
    console.error(error);
    if (printWindow && !printWindow.closed) printWindow.close();
    status.textContent = `PDF generation failed: ${error.message}`;
  } finally {
    buttons.forEach((item) => { item.disabled = false; });
    button.textContent = original;
    progressPanel.hidden = true;
    generationInProgress = false;
  }
}

async function init() {
  try {
    products = await loadProducts();
    count.textContent = products.length;
    const categories = [...new Set(products.map((product) => product.category))];
    categories.forEach((key) => category.add(new Option(categoryLabels[key] || key, key)));
    render();
  } catch (error) {
    console.error(error);
    status.textContent = "Products could not be loaded. Check the published Google Sheet and internet connection.";
  }
}

search.addEventListener("input", render);
category.addEventListener("change", render);
document.querySelector("#downloadPdf").addEventListener("click", (event) => generate("download", event.currentTarget));
document.querySelector("#printPdf").addEventListener("click", (event) => generate("print", event.currentTarget));
init();
