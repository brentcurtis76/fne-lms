// From the console logs, I can see this sequence:

// 1. File upload succeeds:
console.log("✅ File upload successful, updating item fields:", {
  itemId: "jofbg0373",
  url: "https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/course-materials/bibliography/...",
  filename: "Certificado de Participación _ RUTH YESSENIA INOSTROZA FLORES.pdf",
  filesize: 642321920
});

// 2. Items are updated in component:
console.log("📦 Updated item with all fields:", {
  id: "jofbg0373",
  url: "https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/course-materials/...",
  type: "pdf",
  year: "2025",
  title: "prueba pdf",
  author: "",
  category: "",
  description: "",
  filename: "Certificado de Participación _ RUTH YESSENIA INOSTROZA FLORES.pdf",
  filesize: 642321920
});

// 3. Parent onChange is called with correct data:
console.log("📚 Bibliography onChange in parent:", {
  blockId: "6e4962ec-2145-4492-be3f-4cceafc1b470",
  payloadItemsAnalysis: [{
    id: "jofbg0373",
    type: "pdf",
    title: "prueba pdf",
    url: "YES (https://sxlogxqzmarhqsblxmtj.supabase.co/stora...)",
    filename: "Certificado de Participación _ RUTH YESSENIA INOSTR...",
    filesize: 642321920
  }]
});

// 4. BUT THEN - Multiple warnings show data being overwritten:
console.log("⚠️ WARNING: PDF/Image items detected with NO URL - data was likely overwritten!");

// The pattern shows:
// - Data is set correctly
// - Parent is notified
// - But then something overwrites it with empty data
// - This happens MULTIPLE times (6+ warnings in the logs)

// HYPOTHESIS: The component is being re-rendered with stale props
// causing the file data to be lost