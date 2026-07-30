import Papa from "papaparse";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ-O3cDp2G6s-AIcSBO-rLdjscotzHFDwBXI0vAsrJbv8sL67TXFg4czvyavjgoaLUkd8dmA0SYalHm/pub?gid=0&single=true&output=csv";

const categoryMap = {
  stationery: "stationery",
  "office stationery": "stationery",
  furniture: "furniture",
  "office furniture": "furniture",
  ppe: "ppe",
  "ppe & safety": "ppe",
  "ppe and safety": "ppe",
  cleaning: "cleaning",
  hygiene: "cleaning",
  "cleaning & hygiene": "cleaning",
  hospital: "hospital",
  "hospital equipment": "hospital",
  "medical equipment": "hospital",
  healthcare: "hospital",
  fire: "fire",
  "fire & emergency safety": "fire",
  signs: "signage",
  signage: "signage",
  "safety signage": "signage",
  maps: "educational",
  educational: "educational",
  "educational resources": "educational",
  "office accessories": "office-accessories"
};

export const categoryLabels = {
  stationery: "Stationery",
  furniture: "Office Furniture",
  ppe: "PPE & Safety",
  cleaning: "Cleaning & Hygiene",
  hospital: "Hospital Equipment",
  fire: "Fire & Emergency Safety",
  signage: "Safety Signage",
  educational: "Educational Resources",
  "office-accessories": "Office Accessories"
};

function clean(value) {
  return String(value ?? "").trim();
}

function category(value) {
  const key = clean(value).toLowerCase();
  return categoryMap[key] || key || "other";
}

export async function loadProducts() {
  const response = await fetch(CSV_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Product feed returned ${response.status}.`);

  const parsed = Papa.parse(await response.text(), {
    header: true,
    skipEmptyLines: true
  });

  return parsed.data
    .map((row, index) => {
      const filename = clean(row["Image Filename"]);
      const cloudUrl = clean(row["Cloud URL"]);
      const largeImageUrl = clean(row["Large Image URL"]);
      return {
        id: clean(row.ID) || String(index + 1),
        name: clean(row["Product Name"]),
        category: category(row.Category),
        sku: clean(row.SKU),
        unit: clean(row.Unit),
        description: clean(row.Description),
        image: cloudUrl || (filename ? `/images/products/${filename}` : "/images/placeholder.webp"),
        thumbnailImage: cloudUrl || (filename ? `/images/products/${filename}` : "/images/placeholder.webp"),
        largeImage: largeImageUrl,
        localImage: filename ? `/images/products/${filename}` : "/images/placeholder.webp",
        features: ["Feature 1", "Feature 2", "Feature 3", "Feature 4"]
          .map((key) => clean(row[key]))
          .filter(Boolean)
      };
    })
    .filter((product) => product.name);
}
