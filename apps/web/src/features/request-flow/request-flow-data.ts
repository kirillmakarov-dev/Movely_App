import type {
  ApartmentInventoryItemType,
  MoveBudgetBand,
  MoveDateFlexibility,
  MoveItemKind,
  MoveRequestType,
  PreferredMoveTime,
  SmallMoveItemCategory,
  SpecialItemType,
} from "@/lib/movely-api";

export const MOVE_TYPE_OPTIONS: Array<{
  value: MoveRequestType;
  title: string;
  description: string;
}> = [
  {
    value: "ApartmentMove",
    title: "הובלת דירה",
    description: "הובלה מלאה של בית או דירה, כולל מסלול, גישה, תכולה ושירותים.",
  },
  {
    value: "SmallMove",
    title: "הובלה קטנה / פריטים בודדים",
    description: "ספה, מכשיר, ארגזים, אלקטרוניקה, ציוד או כמה פריטים יחד.",
  },
];

export const ROOM_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

export const BOX_TYPE_OPTIONS: Array<{ key: "small" | "medium" | "large"; label: string }> = [
  { key: "small", label: "ארגזים קטנים" },
  { key: "medium", label: "ארגזים בינוניים" },
  { key: "large", label: "ארגזים גדולים" },
];

export const PREFERRED_TIME_OPTIONS: Array<{ value: PreferredMoveTime; label: string }> = [
  { value: "Morning", label: "בוקר" },
  { value: "Afternoon", label: "אחר הצהריים" },
  { value: "Evening", label: "ערב" },
  { value: "Flexible", label: "גמיש" },
];

export const DATE_FLEXIBILITY_OPTIONS: Array<{ value: MoveDateFlexibility; label: string }> = [
  { value: "Exact", label: "תאריך מדויק" },
  { value: "PlusMinusOneDay", label: "± יום אחד" },
  { value: "PlusMinusThreeDays", label: "± 3 ימים" },
  { value: "WithinOneWeek", label: "תוך שבוע" },
];

export const BUDGET_OPTIONS: Array<{ value: MoveBudgetBand; label: string }> = [
  { value: "UpTo1000", label: "עד 1,000 ₪" },
  { value: "From1000To1500", label: "1,000 - 1,500 ₪" },
  { value: "From1500To2000", label: "1,500 - 2,000 ₪" },
  { value: "From2000To3000", label: "2,000 - 3,000 ₪" },
  { value: "From3000To5000", label: "3,000 - 5,000 ₪" },
  { value: "From5000Plus", label: "5,000 ₪+" },
  { value: "Unknown", label: "עדיין לא יודע" },
];

export const APARTMENT_INVENTORY_OPTIONS: Array<{
  value: ApartmentInventoryItemType;
  label: string;
  hint: string;
}> = [
  { value: "Sofa", label: "ספה", hint: "ספה פינתית, רגילה או נפתחת" },
  { value: "Bed", label: "מיטה", hint: "מסגרת, ראש מיטה ובסיס" },
  { value: "Mattress", label: "מזרן", hint: "יחיד, זוגי, קווין או קינג" },
  { value: "Wardrobe", label: "ארון", hint: "ארון עומד או יחידת ארון" },
  { value: "Dresser", label: "שידת מגירות", hint: "שידת מגירות לחדר שינה" },
  { value: "Table", label: "שולחן", hint: "שולחן אוכל, קפה או צד" },
  { value: "Chair", label: "כיסא", hint: "כיסאות אוכל, כיסאות משרדיים, שרפרפים" },
  { value: "Refrigerator", label: "מקרר", hint: "מקרר או מקפיא" },
  { value: "WashingMachine", label: "מכונת כביסה", hint: "מכונת כביסה ויחידת כביסה" },
  { value: "Dryer", label: "מייבש", hint: "מכונת ייבוש" },
  { value: "Oven", label: "תנור", hint: "תנור או מכשיר בישול" },
  { value: "Television", label: "טלוויזיה", hint: "טלוויזיה וציוד תצוגה" },
  { value: "Desk", label: "שולחן עבודה", hint: "שולחן עבודה, עמדת עבודה או גיימינג" },
  { value: "Bookshelf", label: "ספרייה", hint: "מדפים או כוננית" },
  { value: "Custom", label: "פריט מותאם", hint: "פריט ייחודי שצריך פירוט נוסף" },
];

export const SPECIAL_ITEM_OPTIONS: Array<{ value: SpecialItemType; label: string }> = [
  { value: "Piano", label: "פסנתר" },
  { value: "Safe", label: "כספת" },
  { value: "OversizedRefrigerator", label: "מקרר גדול במיוחד" },
  { value: "Glass", label: "זכוכית" },
  { value: "Artwork", label: "יצירת אמנות" },
  { value: "Antique", label: "עתיק" },
  { value: "HeavyObject", label: "חפץ כבד" },
  { value: "FragileEquipment", label: "ציוד שביר" },
  { value: "Other", label: "פריט מיוחד אחר" },
];

export const SMALL_MOVE_CATEGORIES: Array<{ value: SmallMoveItemCategory; label: string }> = [
  { value: "Furniture", label: "ריהוט" },
  { value: "Electronics", label: "אלקטרוניקה" },
  { value: "Appliance", label: "מכשיר חשמלי" },
  { value: "Boxes", label: "ארגזים" },
  { value: "Equipment", label: "ציוד" },
  { value: "Other", label: "אחר" },
];

export const SMALL_MOVE_ITEM_KIND: MoveItemKind = "SmallMoveItem";
export const APARTMENT_INVENTORY_KIND: MoveItemKind = "ApartmentInventory";
export const SPECIAL_ITEM_KIND: MoveItemKind = "SpecialItem";
