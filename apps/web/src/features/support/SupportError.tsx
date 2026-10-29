import Link from "@/components/SafeLink";
import { MovelyApiError } from "@/lib/movely-api";
export function supportErrorCopy(error: unknown) {
  if (!(error instanceof MovelyApiError)) return "לא הצלחנו להשלים את הפעולה. בדקו את החיבור ונסו שוב.";
  if (error.status === 401) return "כדי לצפות בפניות שלכם, התחברו לחשבון המתאים.";
  if (error.status === 403) return "אין גישה לפניות האלה בחשבון הנוכחי. ודאו שאתם מחוברים לחשבון המתאים.";
  if (error.status === 404) return "הפנייה לא נמצאה או שאינה זמינה בחשבון הזה.";
  const copies: Record<string, string> = {
    SUPPORT_REQUESTS_DISABLED: "שליחת פניות והודעות חדשות אינה זמינה כעת. אפשר עדיין לקרוא פניות קודמות ולבטל פנייה פתוחה.",
    SUPPORT_REVISION_CONFLICT: "הפנייה השתנתה. קראו את המצב וההודעות העדכניים לפני שליחה נוספת. הטקסט שלכם נשאר בעמוד.",
    SUPPORT_IDEMPOTENCY_CONFLICT: "לא ניתן לאמת את השליחה הזאת. בדקו את היסטוריית הפנייה לפני פעולה נוספת; לא נשלח עותק אוטומטי.",
    INVALID_SUPPORT_STATE: "לא ניתן לבצע את הפעולה במצב הנוכחי. טענו את הפנייה העדכנית ובדקו את האפשרויות.",
    INVALID_SUPPORT_REQUEST: "בחרו נושא והזינו כותרת באורך 2 עד 160 תווים.",
    INVALID_SUPPORT_MESSAGE: "ההודעה צריכה להכיל 2 עד 4,000 תווים. אל תכללו תווים שאינם ניתנים להצגה.",
    INVALID_SUPPORT_QUERY: "פרטי הסינון או מספר העמוד אינם תקינים. אפשר לחזור לרשימת הפניות.",
    SUPPORT_PAYLOAD_TOO_LARGE: "תוכן הפנייה גדול מדי. קצרו את הטקסט לפני שליחה נוספת.",
    SUPPORT_READ_TIMEOUT: "טעינת הפניות נמשכת זמן רב מדי. בדקו את החיבור ונסו שוב.",
    SUPPORT_WRITE_TIMEOUT: "השליחה נמשכת זמן רב מדי. עדיין לא ידוע אם היא נרשמה.",
  };
  return copies[error.errorCode] ?? (error.status === 429 ? "בוצעו פעולות רבות בזמן קצר. המתינו מעט לפני ניסיון נוסף." : "לא הצלחנו להשלים את הפעולה. בדקו את החיבור ואת המצב העדכני.");
}
export default function SupportError({ error, retry }: { error: unknown; retry?: () => void }) {
  return <section role="alert" className="space-y-4 rounded-xl border border-amber-200 bg-white p-5 text-base leading-7"><p>{supportErrorCopy(error)}</p><div className="flex flex-wrap gap-3">
    {error instanceof MovelyApiError && [401, 403].includes(error.status) && <Link href="/auth" target="_blank" rel="noopener noreferrer" className="button button-secondary">כניסה לחשבון (בכרטיסייה חדשה)</Link>}
    {retry && <button type="button" onClick={retry} className="button button-secondary">בדיקה מחדש</button>}
  </div></section>;
}
