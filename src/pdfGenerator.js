import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import QRCode from "qrcode";
import { categoryLabels } from "./productData.js";

pdfMake.vfs = pdfFonts.pdfMake?.vfs || pdfFonts;

const WEBSITE = "https://www.educorestationery-hygiene-ppe.co.za";
const PLACEHOLDER = "/images/placeholder.webp";
const IMAGE_CONCURRENCY = 4;
const IMAGE_TIMEOUT_MS = 12000;
const IMAGE_DECODE_TIMEOUT_MS = 8000;
const IMAGE_RETRIES = 1;
const MAXIMUM_SOURCE_BYTES = 12 * 1024 * 1024;
const PDF_BUILD_TIMEOUT_MS = 180000;

function report(progress, stage, current = 0, total = 0, failures = 0) {
  progress?.({ stage, current, total, failures });
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function fetchBlob(source, attempt = 0) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(source, {
      cache: "force-cache",
      mode: "cors",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error(`Unexpected content type: ${blob.type || "unknown"}`);
    if (blob.size > MAXIMUM_SOURCE_BYTES) throw new Error("Image exceeds the 12 MB safety limit.");
    return blob;
  } catch (error) {
    if (attempt < IMAGE_RETRIES) {
      await wait(350 * (attempt + 1));
      return fetchBlob(source, attempt + 1);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function blobToJpegDataUrl(blob, maximumWidth = 360, maximumHeight = 240) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      image.src = "";
      reject(new Error("Image decoding timed out."));
    }, IMAGE_DECODE_TIMEOUT_MS);
    const finish = () => {
      window.clearTimeout(timeout);
      URL.revokeObjectURL(objectUrl);
    };

    image.onload = () => {
      if (settled) return;
      settled = true;
      const scale = Math.min(
        maximumWidth / Math.max(1, image.naturalWidth),
        maximumHeight / Math.max(1, image.naturalHeight),
        1
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        finish();
        reject(new Error("Image conversion canvas is unavailable."));
        return;
      }
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      finish();
      try {
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      } catch (error) {
        reject(error);
      } finally {
        canvas.width = 1;
        canvas.height = 1;
      }
    };
    image.onerror = () => {
      if (settled) return;
      settled = true;
      finish();
      reject(new Error("Image could not be decoded."));
    };
    image.src = objectUrl;
  });
}

async function loadFirstAvailableImage(sources) {
  const attempted = new Set();
  for (const source of [...sources, PLACEHOLDER]) {
    if (!source || attempted.has(source)) continue;
    attempted.add(source);
    try {
      return {
        dataUrl: await blobToJpegDataUrl(await fetchBlob(source)),
        fallbackUsed: source === PLACEHOLDER
      };
    } catch (error) {
      console.warn(`PDF image preparation failed for ${source}:`, error.message);
    }
  }
  return { dataUrl: null, fallbackUsed: true };
}

async function prepare(products, progress) {
  const output = new Array(products.length);
  let cursor = 0;
  let completed = 0;
  let failures = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= products.length) return;
      const product = products[index];
      const preparedImage = await loadFirstAvailableImage([
        product.thumbnailImage,
        product.image,
        product.localImage
      ]);
      if (preparedImage.fallbackUsed) failures += 1;
      output[index] = { ...product, pdfImage: preparedImage.dataUrl };
      completed += 1;
      report(progress, "Preparing product images", completed, products.length, failures);
      if (completed % 12 === 0) await wait(0);
    }
  }

  report(progress, "Preparing product images", 0, products.length, 0);
  await Promise.all(Array.from({ length: Math.min(IMAGE_CONCURRENCY, products.length) }, worker));
  return { products: output, failures };
}

function shorten(value, maximumLength) {
  const text = String(value || "").trim();
  return text.length <= maximumLength ? text : `${text.slice(0, maximumLength - 1).trimEnd()}…`;
}

function productCell(product) {
  const content = [];
  if (product.pdfImage) {
    content.push({ image: product.pdfImage, fit: [220, 118], alignment: "center", margin: [0, 0, 0, 7] });
  }
  content.push(
    { text: product.name, bold: true, fontSize: 11, color: "#172A4A", margin: [0, 0, 0, 4] },
    {
      columns: [
        { text: "REQUEST A QUOTE", bold: true, fontSize: 8.5, color: "#F05A28" },
        { text: `SKU: ${product.sku || "N/A"}`, alignment: "right", fontSize: 7.5, color: "#64748B" }
      ]
    },
    { text: shorten(product.description || "Contact EDUCORE for full product specifications.", 320), fontSize: 8, color: "#475569", margin: [0, 5, 0, 4] }
  );
  if (product.features?.length) {
    content.push({
      ul: product.features.slice(0, 4).map((feature) => shorten(feature, 180)),
      fontSize: 7,
      color: "#64748B",
      margin: [0, 1, 0, 0]
    });
  }
  content.push({ text: `Unit: ${product.unit || "Each"}`, bold: true, fontSize: 7.5, color: "#172A4A", margin: [0, 4, 0, 0] });
  return { stack: content, margin: 7 };
}

function rows(products) {
  const result = [];
  for (let index = 0; index < products.length; index += 2) {
    result.push([productCell(products[index]), products[index + 1] ? productCell(products[index + 1]) : { text: "" }]);
  }
  return result;
}

async function buildDefinition(products, progress) {
  const preparedResult = await prepare(products, progress);
  report(progress, "Preparing catalogue cover", 0, 1, preparedResult.failures);
  const [logoResult, qr] = await Promise.all([
    loadFirstAvailableImage(["/images/branding/educore-logo.jpeg"]),
    QRCode.toDataURL(WEBSITE, { width: 180, margin: 1, color: { dark: "#172A4A", light: "#FFFFFF" } })
  ]);
  const prepared = preparedResult.products;
  const logo = logoResult.dataUrl;
  const content = [{
    stack: [
      ...(logo ? [{ image: logo, fit: [120, 100], alignment: "center", margin: [0, 0, 0, 8] }] : []),
      { text: "EDUCORE", fontSize: 30, bold: true, color: "#172A4A" },
      { text: "CLIENT PRODUCT LIST 2026", fontSize: 21, bold: true, color: "#F05A28", margin: [0, 4, 0, 8] },
      { text: "LEVEL 1 B-BBEE CONTRIBUTOR • TENDER READY", fontSize: 10, bold: true, color: "#F05A28" },
      { text: `${prepared.length} products • Bulk supply • Nationwide delivery • Tender ready`, fontSize: 10, color: "#64748B", margin: [0, 8, 0, 14] },
      { text: "104 Donnelly Street, Turffontein, Johannesburg, 2190", fontSize: 9, margin: [0, 2] },
      { text: "info@educorestationery-hygiene-ppe.co.za", link: "mailto:info@educorestationery-hygiene-ppe.co.za", color: "#F05A28", fontSize: 9, margin: [0, 2] },
      { text: "WhatsApp: 071 945 0220", link: "https://wa.me/27719450220", color: "#22A45A", fontSize: 9, margin: [0, 2] },
      { text: "www.educorestationery-hygiene-ppe.co.za", link: WEBSITE, color: "#172A4A", fontSize: 9, margin: [0, 2, 0, 8] },
      { image: qr, width: 70, alignment: "center" },
      { text: "Scan to visit our website", fontSize: 7, color: "#64748B", margin: [0, 3] }
    ],
    alignment: "center",
    margin: [30, 8, 30, 0]
  }];

  Object.keys(categoryLabels).forEach((key) => {
    const categoryProducts = prepared.filter((product) => product.category === key);
    if (!categoryProducts.length) return;
    content.push({ text: categoryLabels[key], pageBreak: "before", fontSize: 21, bold: true, color: "#172A4A", margin: [0, 0, 0, 9] });
    content.push({
      table: { widths: ["*", "*"], body: rows(categoryProducts) },
      layout: { hLineColor: () => "#E2E8F0", vLineColor: () => "#E2E8F0" }
    });
  });

  return {
    failures: preparedResult.failures,
    definition: {
      pageSize: "A4",
      pageOrientation: "landscape",
      pageMargins: [30, 48, 30, 38],
      header: (page) => page === 1 ? null : ({
        columns: [
          { text: "EDUCORE CLIENT PRODUCT LIST", bold: true, color: "#172A4A" },
          { text: "LEVEL 1 B-BBEE CONTRIBUTOR", alignment: "right", bold: true, color: "#F05A28" }
        ],
        margin: [30, 16, 30, 0],
        fontSize: 8.5
      }),
      footer: (page, pages) => ({
        columns: [
          { text: "info@educorestationery-hygiene-ppe.co.za | 071 945 0220", color: "#64748B" },
          { text: `Page ${page} of ${pages}`, alignment: "right", color: "#64748B" }
        ],
        margin: [30, 8, 30, 0],
        fontSize: 7.5
      }),
      content,
      info: {
        title: "EDUCORE Client Product List 2026",
        author: "EDUCORE",
        subject: "Product images and specifications without pricing"
      }
    }
  };
}

function pdfBlob(documentDefinition) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("PDF assembly exceeded three minutes. Try one category at a time."));
    }, PDF_BUILD_TIMEOUT_MS);
    try {
      pdfMake.createPdf(documentDefinition).getBlob((blob) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(blob);
      });
    } catch (error) {
      settled = true;
      window.clearTimeout(timeout);
      reject(error);
    }
  });
}

function downloadBlob(blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "educore-client-product-list-2026.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function createProductListPdf(products, action, progress, printWindow = null) {
  const built = await buildDefinition(products, progress);
  report(progress, "Building PDF pages", 0, 1, built.failures);
  const blob = await pdfBlob(built.definition);
  report(progress, action === "download" ? "Starting download" : "Opening print document", 1, 1, built.failures);
  if (action === "download") {
    downloadBlob(blob);
  } else {
    const url = URL.createObjectURL(blob);
    if (!printWindow || printWindow.closed) {
      URL.revokeObjectURL(url);
      throw new Error("The print window was blocked. Allow pop-ups and try again.");
    }
    printWindow.location.replace(url);
    window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
  }
  return { failures: built.failures, sizeBytes: blob.size };
}
