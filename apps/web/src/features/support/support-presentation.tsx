import type { SupportTopic, SupportStatus } from "@/lib/support-api";
export const supportTopicLabels: Record<SupportTopic, string> = {
  General: "עזרה כללית", PrivacyAccess: "עיון במידע אישי", PrivacyCorrection: "תיקון מידע אישי", PrivacyDeletion: "בקשה למחיקת מידע אישי",
};
export const supportStatusLabels: Record<SupportStatus, string> = {
  Open: "הפנייה נרשמה", InReview: "בטיפול הצוות", WaitingForUser: "ממתינה לתשובה שלכם", Resolved: "נסגרה על ידי הצוות", Cancelled: "בוטלה על ידכם",
};
export const supportTopicHints: Record<SupportTopic, string> = {
  General: "תארו מה ניסיתם לעשות, מה קרה ובאיזה עמוד. הוסיפו רק פרטים הדרושים להבנת הבעיה.",
  PrivacyAccess: "ציינו לאיזה מידע אישי אתם מבקשים לעיין. שליחת הפנייה אינה מסירת עותק של המידע; הצוות צריך לבדוק את הבקשה.",
  PrivacyCorrection: "ציינו איזה פרט אינו נכון ומה צריך לתקן. שליחת הפנייה אינה משנה את הנתונים בחשבון באופן אוטומטי.",
  PrivacyDeletion: "ציינו איזה מידע אתם מבקשים למחוק. שליחת הפנייה אינה מוחקת מידע או סוגרת את החשבון. הצוות צריך לבדוק את הבקשה ואת האפשרות לבצע אותה.",
};
export function SupportSafetyNotice() {
  return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-base leading-7">אל תשלחו סיסמאות, קודי אימות ב־SMS, פרטי תשלום או מסמכי זהות. אין אפשרות לצרף קבצים. כתבו רק מידע שנחוץ לטיפול בפנייה.</p>;
}
export function SupportReceiptNotice() {
  return <p className="text-base leading-7 text-slate-600">הפנייה והודעות הצוות מוצגות כאן בחשבון. אין הבטחה למענה מיידי או להודעה בדוא״ל. מצב ״נסגרה״ אינו כשלעצמו אישור שמידע נמחק או שונה; קראו את תשובת הצוות.</p>;
}
export function SupportTime({ value }: { value: string }) {
  return <time dateTime={value}>{new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" }).format(new Date(value))}</time>;
}
