import type { MoveRequestType } from "@/lib/movely-api";

export function flowStepsForType(type: MoveRequestType | null) {
  const route = { key: "route", title: "איסוף ויעד", description: "הוסיפו עיר וכתובת לאיסוף וליעד. פרטי גישה אפשר להשלים בהמשך." };
  const contents = type === "SmallMove"
    ? { key: "items", title: "פריטים", description: "מה מעבירים? הוסיפו פריטים וכמויות. מידות ומשקל אפשר לציין בקירוב." }
    : { key: "contents", title: "תכולת הדירה", description: "בחרו מספר חדרים, רהיטים וארגזים. שירותים נוספים אפשר לפתוח לפי הצורך." };
  return [
    { key: "move-type", title: "סוג הובלה", description: "דירה שלמה או כמה פריטים? בחרו את המסלול שמתאים לכם." },
    ...(type === "SmallMove" ? [contents, route] : [route, contents]),
    { key: "schedule", title: "תאריך ותקציב", description: "מתי עוברים? בחרו מועד ותקציב והוסיפו הערות לפי הצורך." },
    { key: "review", title: "בדיקה", description: "עברו על הפרטים. אפשר לחזור לכל שלב ולתקן לפני הפרסום." },
    { key: "account", title: "אימות ופרסום", description: "התחברו, אמתו טלפון ואשרו מי יקבל את הפרטים לפני הפרסום." },
    // Confirmation is a result screen, not a seventh form step.
    { key: "publish", title: "הבקשה פורסמה", description: "הבקשה נשמרה ופורסמה. פרסום בקשה אינו הזמנת הובלה." },
  ];
}

export function migrateLegacyDraftStep(type: MoveRequestType | null, step: number) {
  const positions = type === "SmallMove" ? [0, 1, 2, 2, 3, 4, 5, 5] : [0, 1, 2, 2, 2, 3, 3, 4, 5, 5];
  return positions[step] ?? 5;
}
