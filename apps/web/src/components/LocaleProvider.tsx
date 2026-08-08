"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Locale = "en" | "he";

const STORAGE_KEY = "movely-language";

const hebrew: Record<string, string> = {
  "Movely home": "דף הבית של Movely",
  "Primary navigation": "ניווט ראשי",
  "Footer navigation": "ניווט תחתון",
  "Open navigation menu": "פתיחת תפריט ניווט",
  Requests: "בקשות הובלה",
  "How it works": "איך זה עובד",
  "For Movers": "למובילים",
  "For movers": "למובילים",
  Login: "התחברות",
  "Create Request": "יצירת בקשה",
  About: "אודות",
  Terms: "תנאי שימוש",
  Privacy: "פרטיות",
  Contact: "יצירת קשר",
  "A clearer way to describe your move and connect with suitable moving businesses.": "דרך ברורה יותר לתאר את ההובלה ולהתחבר למובילים מתאימים.",
  "Moving, made clearer": "הובלה, בצורה ברורה יותר",
  "Need something moved?": "צריכים להעביר משהו?",
  "Describe your move once and let suitable movers find the job, without calling dozens of companies.": "תארו את ההובלה פעם אחת ותנו למובילים מתאימים למצוא את העבודה, בלי להתקשר לעשרות חברות.",
  "Browse Requests": "צפייה בבקשות",
  "Free to create. Your contact details stay protected.": "הפרסום בחינם. פרטי הקשר שלכם נשארים מוגנים.",
  "New request": "בקשה חדשה",
  "Apartment Move": "הובלת דירה",
  Pickup: "איסוף",
  Destination: "יעד",
  rooms: "חדרים",
  boxes: "ארגזים",
  Rooms: "חדרים",
  Boxes: "ארגזים",
  "move date": "תאריך הובלה",
  "Choose your move": "בחרו את סוג ההובלה",
  "What needs moving?": "מה צריך להעביר?",
  "Start with the route that fits your job. You can save a draft and finish later.": "התחילו במסלול שמתאים לכם. אפשר לשמור טיוטה ולהמשיך מאוחר יותר.",
  "Full apartment or home relocation including furniture, boxes and appliances.": "הובלת דירה או בית מלאים, כולל ריהוט, ארגזים ומכשירי חשמל.",
  "Create Apartment Move": "יצירת הובלת דירה",
  "Small Move / Item Transportation": "הובלה קטנה / העברת פריטים",
  "Sofa, furniture, appliances, electronics, equipment, boxes and individual items.": "ספה, ריהוט, מכשירי חשמל, אלקטרוניקה, ציוד, ארגזים ופריטים בודדים.",
  "Create Small Move": "יצירת הובלה קטנה",
  "Fresh opportunities": "הזדמנויות חדשות",
  "Latest Move Requests": "בקשות ההובלה האחרונות",
  "Marketplace-safe previews. Personal customer details are never shown here.": "תצוגה מקדימה בטוחה. פרטי הלקוחות האישיים אינם מוצגים כאן.",
  "View All Requests": "צפייה בכל הבקשות",
  "Simple by design": "פשוט, בכוונה",
  "How Movely Works": "איך Movely עובד",
  "Describe your move": "תארו את ההובלה",
  "Add the route, access details, inventory, date and budget.": "הוסיפו מסלול, פרטי גישה, תכולה, תאריך ותקציב.",
  "Movers find relevant requests": "מובילים מוצאים בקשות מתאימות",
  "Your marketplace-safe request helps the right businesses spot a good fit.": "הבקשה המוגנת עוזרת למובילים המתאימים לזהות עבודה רלוונטית.",
  "Choose the right mover": "בחרו את המוביל המתאים",
  "Compare interest and connect with the moving business that works for you.": "השוו בין האפשרויות והתחברו לחברת ההובלה שמתאימה לכם.",
  "For moving businesses": "לעסקי הובלה",
  "Are you a mover?": "אתם מובילים?",
  "Find jobs that match your service area. Purchase only the leads that interest you. Premium movers will be able to submit offers before purchasing contact information.": "מצאו עבודות שמתאימות לאזור השירות שלכם. רכשו רק לידים שמעניינים אתכם. מובילי פרימיום יוכלו להגיש הצעה לפני רכישת פרטי הקשר.",
  "Movely marketplace": "השוק של Movely",
  "Moving Requests": "בקשות הובלה",
  "Browse apartment moves and individual item transport requests. Customer contact details remain protected.": "עיינו בבקשות להובלת דירות ופריטים בודדים. פרטי הקשר של הלקוחות נשארים מוגנים.",
  "Preview marketplace data is shown while the Phase 5 discovery API is being prepared.": "נתוני הדגמה מוצגים בזמן שמערכת החיפוש של השוק נמצאת בהכנה.",
  "Request categories": "קטגוריות בקשות",
  All: "הכול",
  "Apartment Moves": "הובלות דירה",
  "Small Moves": "הובלות קטנות",
  "Pickup city": "עיר איסוף",
  "Destination city": "עיר יעד",
  "Any city": "כל עיר",
  Date: "תאריך",
  "Move date": "תאריך הובלה",
  Budget: "תקציב",
  "Budget range": "טווח תקציב",
  "Any budget": "כל תקציב",
  "Up to NIS 1,000": "עד 1,000 ₪",
  "NIS 1,000-2,000": "1,000–2,000 ₪",
  "NIS 2,000+": "2,000 ₪ ומעלה",
  Sort: "מיון",
  Newest: "החדשות ביותר",
  "Move Date": "תאריך ההובלה",
  "No matching requests": "לא נמצאו בקשות מתאימות",
  "Try another city or request category.": "נסו עיר או קטגוריית בקשה אחרת.",
  "View Request": "צפייה בבקשה",
  Item: "פריט",
  Quantity: "כמות",
  Photos: "תמונות",
  "Built for moving businesses": "נבנה עבור עסקי הובלה",
  "Spend less time chasing the wrong jobs.": "פחות זמן על עבודות לא מתאימות.",
  "Browse detailed moving requests and focus your time on jobs that match your team, service area and schedule.": "עיינו בבקשות מפורטות והתמקדו בעבודות שמתאימות לצוות, לאזור השירות וללוח הזמנים שלכם.",
  "Create Mover Account": "פתיחת חשבון מוביל",
  "Login as Mover": "התחברות כמוביל",
  "Product boundary": "מצב המוצר",
  "The workflow": "תהליך העבודה",
  "How Movely works for movers": "איך Movely עובד עבור מובילים",
  "Browse relevant requests": "עיון בבקשות רלוונטיות",
  "Review move details": "בדיקת פרטי ההובלה",
  "Buy the lead if it fits": "רכישת ליד מתאים",
  "Contact the customer": "יצירת קשר עם הלקוח",
  "Premium preview": "תצוגת פרימיום",
  "Show interest before purchasing a lead.": "הביעו עניין לפני רכישת ליד.",
  "← Back to home": "→ חזרה לדף הבית",
  "Create a request": "יצירת בקשה",
  "Request a move in minutes.": "יוצרים בקשת הובלה תוך דקות.",
  "Tell movers what needs moving, where it is going and when. Your draft is saved as you progress after sign-in.": "ספרו למובילים מה צריך להעביר, לאן ומתי. לאחר ההתחברות הטיוטה תישמר לאורך התהליך.",
  "Move type": "סוג הובלה",
  "Confirm the request category.": "אשרו את קטגוריית הבקשה.",
  "Pickup and destination": "איסוף ויעד",
  "Apartment details": "פרטי הדירה",
  "Boxes and inventory": "ארגזים ותכולה",
  "Services and special items": "שירותים ופריטים מיוחדים",
  "Date and budget": "תאריך ותקציב",
  "Photos and comments": "תמונות והערות",
  Review: "בדיקה",
  "Account / phone verification": "חשבון / אימות טלפון",
  Publish: "פרסום",
  Items: "פריטים",
  Access: "גישה",
  "Full home or apartment relocation with route, access, inventory, and services.": "הובלת בית או דירה מלאה, כולל מסלול, גישה, תכולה ושירותים.",
  "Small Move / Individual Items": "הובלה קטנה / פריטים בודדים",
  "A sofa, appliance, boxes, electronics, equipment, or a few items together.": "ספה, מכשיר חשמלי, ארגזים, אלקטרוניקה, ציוד או כמה פריטים יחד.",
  "Small move selected": "נבחרה הובלה קטנה",
  "Apartment move selected": "נבחרה הובלת דירה",
  "Start your request": "התחילו את הבקשה",
  "You can fill in the details now. Sign in when you are ready to save your draft.": "אפשר למלא את הפרטים עכשיו. התחברו כשתרצו לשמור את הטיוטה.",
  "You can choose a move type now and keep shaping the request locally. Sign in when you are ready to save the draft to the server.": "אפשר לבחור עכשיו סוג הובלה ולהמשיך לערוך את הבקשה. התחברו כשתרצו לשמור את הטיוטה.",
  Back: "חזרה",
  Continue: "המשך",
  "Ready to start.": "מוכנים להתחיל.",
  "Using the request wizard in local mode until the API is reachable.": "האשף פועל במצב מקומי עד שהשרת יהיה זמין.",
  "Continue request": "המשך בקשה",
  "Pick up a saved draft where you left off.": "המשיכו טיוטה שמורה מהמקום שבו עצרתם.",
  "No saved request yet. Start above and your draft will appear here after the first save.": "עדיין אין בקשה שמורה. התחילו למעלה והטיוטה תופיע כאן לאחר השמירה הראשונה.",
  "Your Request": "הבקשה שלכם",
  "New move": "הובלה חדשה",
  Route: "מסלול",
  Progress: "התקדמות",
  "Save status": "מצב שמירה",
  "Add your route": "הוסיפו מסלול",
  "Add a budget": "הוסיפו תקציב",
  "Sign in to save": "התחברו כדי לשמור",
  "Publish request": "פרסום הבקשה",
  "Start new request": "בקשה חדשה",
  "Get started": "בואו נתחיל",
};

function translateText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;

  let translated = hebrew[trimmed];
  if (!translated) {
    const patterns: Array<[RegExp, string]> = [
      [/^Step (\d+) of (\d+)$/, "שלב $1 מתוך $2"],
      [/^(\d+)% complete$/, "$1% הושלמו"],
      [/^(\d+) requests$/, "$1 בקשות"],
      [/^(\d+) saved$/, "$1 נשמרו"],
      [/^(\d+) minutes ago$/, "לפני $1 דקות"],
      [/^1 hour ago$/, "לפני שעה"],
      [/^(\d+) hours ago$/, "לפני $1 שעות"],
      [/^(\d+) August$/, "$1 באוגוסט"],
      [/^(\d+) September$/, "$1 בספטמבר"],
    ];
    const pattern = patterns.find(([expression]) => expression.test(trimmed));
    if (pattern) translated = trimmed.replace(pattern[0], pattern[1]);
  }

  if (!translated || translated === trimmed) return value;
  return value.replace(trimmed, translated);
}

function translateElement(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();

  while (node) {
    const parent = node.parentElement;
    if (parent && !["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName) && !parent.closest("[data-no-translate]")) {
      nodes.push(node as Text);
    }
    node = walker.nextNode();
  }

  nodes.forEach((textNode) => {
    const next = translateText(textNode.data);
    if (next !== textNode.data) textNode.data = next;
  });

  root.querySelectorAll<HTMLElement>("[aria-label], [placeholder], [title]").forEach((element) => {
    ["aria-label", "placeholder", "title"].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, translateText(value));
    });
  });
}

type LocaleContextValue = { locale: Locale; setLocale: (locale: Locale) => void };

const LocaleContext = createContext<LocaleContextValue>({ locale: "en", setLocale: () => undefined });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>("en");

  useEffect(() => {
    if (window.localStorage.getItem(STORAGE_KEY) === "he") updateLocale("he");
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
    if (locale !== "he") return;

    translateElement(document.body);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "characterData" && mutation.target.parentNode) {
          translateElement(mutation.target.parentNode);
        }
        mutation.addedNodes.forEach((addedNode) => {
          if (addedNode.nodeType === Node.ELEMENT_NODE) translateElement(addedNode as Element);
          if (addedNode.nodeType === Node.TEXT_NODE && addedNode.parentNode) translateElement(addedNode.parentNode);
        });
      });
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, [locale]);

  const setLocale = (nextLocale: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
    document.cookie = `movely-language=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    if (nextLocale === "en" && locale === "he") {
      window.location.reload();
      return;
    }
    updateLocale(nextLocale);
  };

  return <LocaleContext.Provider value={{ locale, setLocale }}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
