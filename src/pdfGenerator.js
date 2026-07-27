import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import QRCode from "qrcode";
import { categoryLabels } from "./productData.js";

pdfMake.vfs = pdfFonts.pdfMake?.vfs || pdfFonts;

const WEBSITE = "https://www.educorestationery-hygiene-ppe.co.za";
const PLACEHOLDER = "/images/placeholder.webp";

function blobToJpegDataUrl(blob, maximumWidth = 900, maximumHeight = 650) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      const scale = Math.min(
        maximumWidth / image.naturalWidth,
        maximumHeight / image.naturalHeight,
        1
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");

      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Image conversion canvas is unavailable."));
        return;
      }

      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Image could not be decoded."));
    };

    image.src = objectUrl;
  });
}

async function imageData(source, fallback = PLACEHOLDER) {
  try {
    const response = await fetch(source);
    if (!response.ok) throw new Error("Image unavailable");
    const blob = await response.blob();
    return await blobToJpegDataUrl(blob);
  } catch {
    if (source !== fallback) return imageData(fallback, fallback);
    return null;
  }
}

async function prepare(products, progress) {
  const output = new Array(products.length);
  let cursor = 0;
  let completed = 0;
  async function worker() {
    while (cursor < products.length) {
      const index = cursor++;
      output[index] = {
        ...products[index],
        pdfImage: await imageData(products[index].image || products[index].localImage)
      };
      completed += 1;
      progress?.(`Preparing images: ${completed} of ${products.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, products.length) }, worker));
  return output;
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
    { text: product.description || "Contact EDUCORE for full product specifications.", fontSize: 8, color: "#475569", margin: [0, 5, 0, 4] }
  );
  if (product.features.length) {
    content.push({ ul: product.features.slice(0, 4), fontSize: 7, color: "#64748B", margin: [0, 1, 0, 0] });
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

async function definition(products, progress) {
  const [prepared, logo, qr] = await Promise.all([
    prepare(products, progress),
    imageData("/images/branding/educore-logo.jpeg"),
    QRCode.toDataURL(WEBSITE, { width: 180, margin: 1, color: { dark: "#172A4A", light: "#FFFFFF" } })
  ]);

  const content = [{
    stack: [
      ...(logo ? [{ image: logo, fit: [120, 100], alignment: "center", margin: [0, 0, 0, 8] }] : []),
      { text: "EDUCORE", fontSize: 30, bold: true, color: "#172A4A" },
      { text: "CLIENT PRODUCT LIST 2026", fontSize: 21, bold: true, color: "#F05A28", margin: [0, 4, 0, 8] },
      { text: "PRODUCT IMAGES & SPECIFICATIONS • PRICING AVAILABLE ON REQUEST", fontSize: 9, bold: true, color: "#475569" },
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
      table: { widths: ["*", "*"], body: rows(categoryProducts), dontBreakRows: true },
      layout: { hLineColor: () => "#E2E8F0", vLineColor: () => "#E2E8F0" }
    });
  });

  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [30, 48, 30, 38],
    header: (page) => page === 1 ? null : ({
      columns: [
        { text: "EDUCORE CLIENT PRODUCT LIST", bold: true, color: "#172A4A" },
        { text: "NO PRICING", alignment: "right", bold: true, color: "#F05A28" }
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
      title: "EDUCORE Client Product List 2026 - No Pricing",
      author: "EDUCORE",
      subject: "Product images and specifications without pricing"
    }
  };
}

export async function createProductListPdf(products, action, progress) {
  const doc = pdfMake.createPdf(await definition(products, progress));
  if (action === "download") {
    doc.download("educore-client-product-list-2026-no-pricing.pdf");
    return;
  }
  const blob = await new Promise((resolve) => doc.getBlob(resolve));
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
