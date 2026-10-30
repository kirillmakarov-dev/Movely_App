"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "@/components/SafeLink";
import { getAuthCapabilities, getCurrentUser, MovelyApiError, type AuthCapabilities, type CurrentUser } from "@/lib/movely-api";
import { boundedBusinessRequest, getMyBusiness, saveBusiness, type BusinessProfile as Profile } from "@/lib/business-api";
import { BusinessError, BusinessSummary, denied, uncertain, useBusinessResource } from "./business-ui";
import ServiceAreas from "./ServiceAreas";

export default function BusinessProfile() {
  const load = useCallback(async (signal: AbortSignal) => {
    const [user, capabilities] = await Promise.all([getCurrentUser(signal), getAuthCapabilities(signal)]);
    const profile = user && ["Customer", "Mover"].includes(user.role) ? await getMyBusiness(signal) : null;
    return { user, capabilities, profile };
  }, []);
  const state = useBusinessResource(load, "my-business");
  if (state.kind === "loading") return <p role="status">טוענים את הפרופיל העסקי…</p>;
  if (state.kind === "error") return <BusinessError error={state.error} retry={state.retry} />;
  if (!state.data.user) return <section className="rounded-xl bg-white p-5"><h2 className="text-xl font-bold">התחברו כדי ליצור או לנהל פרופיל עסקי</h2><Link href="/auth" className="button button-primary mt-4">כניסה לחשבון</Link></section>;
  if (state.data.user.role === "Admin") return <section className="rounded-xl bg-white p-5"><p>חשבון ניהול מיועד לבדיקת עסקים ואינו יכול להגיש פרופיל עסקי.</p><Link href="/admin/businesses" className="button button-secondary mt-4">בדיקת עסקים</Link></section>;
  return <ProfileForm key={state.data.user.id} initialUser={state.data.user} initialCapabilities={state.data.capabilities} initialProfile={state.data.profile} />;
}
function fields(profile: Profile | null) { return { name: profile?.name ?? "", registrationNumber: profile?.registrationNumber ?? "", registeredAddress: profile?.registeredAddress ?? "", representativeName: profile?.representativeName ?? "" }; }
function loadAccount(signal: AbortSignal) { return boundedBusinessRequest((inner) => Promise.all([getCurrentUser(inner), getAuthCapabilities(inner)]), signal); }
function ProfileForm({ initialUser, initialCapabilities, initialProfile }: { initialUser: CurrentUser; initialCapabilities: AuthCapabilities; initialProfile: Profile | null }) {
  const [user, setUser] = useState(initialUser); const [capabilities, setCapabilities] = useState(initialCapabilities);
  const [profile, setProfile] = useState(initialProfile); const [draft, setDraft] = useState(fields(initialProfile));
  const [areas, setAreas] = useState(initialProfile?.serviceAreas ?? []);
  const [authorized, setAuthorized] = useState(false); const [reverify, setReverify] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null); const [notice, setNotice] = useState("");
  const [blocked, setBlocked] = useState(false); const [latest, setLatest] = useState<Profile | null>(null); const [accessLost, setAccessLost] = useState(false);
  const [accountAttempt, setAccountAttempt] = useState(0); const [accountChecking, setAccountChecking] = useState(false); const [accountError, setAccountError] = useState<unknown>(null);
  const loseAccess = useCallback(() => { setAccessLost(true); setDraft(fields(null)); setProfile(null); setAreas([]); setLatest(null); setAuthorized(false); setReverify(false); }, []);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);
  async function run(job: (signal: AbortSignal) => Promise<void>) {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError(null); setNotice("");
    try { await job(controller.signal); } catch (e) { if (!controller.signal.aborted) { setError(e); if (denied(e)) loseAccess(); } }
    finally { if (!controller.signal.aborted) { pending.current = null; setBusy(false); } }
  }
  const applyAccount = useCallback((fresh: CurrentUser | null, caps: AuthCapabilities, signal: AbortSignal) => {
    if (signal.aborted) return false;
    if (!fresh || fresh.id !== initialUser.id || !["Customer", "Mover"].includes(fresh.role)) { loseAccess(); return false; }
    setUser(fresh); setCapabilities(caps);
    return fresh.phoneVerified && fresh.hasCurrentPolicyAcceptance && caps.policyAcceptanceAvailable;
  }, [initialUser.id, loseAccess]);
  async function checkAccount(signal: AbortSignal) { const [fresh, caps] = await loadAccount(signal); return applyAccount(fresh, caps, signal); }
  useEffect(() => {
    let foreground = document.visibilityState === "visible" && document.hasFocus();
    const refresh = () => { if (document.visibilityState !== "visible" || foreground) return; foreground = true; setAccountChecking(true); setAccountAttempt((v) => v + 1); };
    const blur = () => { foreground = false; };
    const visibility = () => { if (document.visibilityState === "hidden") blur(); else refresh(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { blur(); refresh(); } };
    window.addEventListener("focus", refresh); window.addEventListener("blur", blur); window.addEventListener("pageshow", restored); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("focus", refresh); window.removeEventListener("blur", blur); window.removeEventListener("pageshow", restored); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    if (accountAttempt === 0) return;
    const controller = new AbortController();
    void loadAccount(controller.signal).then(([fresh, caps]) => { if (!controller.signal.aborted) { applyAccount(fresh, caps, controller.signal); setAccountError(null); setAccountChecking(false); } }).catch((e: unknown) => { if (!controller.signal.aborted) { setAccountError(e); setAccountChecking(false); if (denied(e)) loseAccess(); } });
    return () => controller.abort();
  }, [accountAttempt, applyAccount, loseAccess]);
  function adopt(value: Profile) { setProfile(value); setDraft(fields(value)); setAreas(value.serviceAreas); setAuthorized(false); setReverify(false); setBlocked(false); setLatest(null); setError(null); }
  function submit() {
    if (blocked || profile?.status === "Suspended") return;
    void run(async (signal) => {
      if (!authorized || areas.length < 1 || areas.length > 20 || (profile?.status === "Verified" && !reverify)) { setNotice("בחרו אזורי שירות ואשרו שאתם מורשים לייצג את העסק. בשינוי עסק מאומת נדרש גם אישור לבדיקה חוזרת."); return; }
      if (!await checkAccount(signal)) { if (!signal.aborted) setNotice("השלימו את אימות הטלפון ואת אישור התנאים בחשבון לפני שליחה. הפרטים שהזנתם נשמרו כאן."); return; }
      const input = { ...draft, name: draft.name.trim(), registeredAddress: draft.registeredAddress.trim(), representativeName: draft.representativeName.trim(), serviceAreaCodes: areas.map((a) => a.code), authorizedRepresentative: authorized };
      try {
        const updated = await saveBusiness(profile ? { ...input, expectedRevisionId: profile.revisionId, acknowledgeReverification: reverify } : input, profile?.id, signal);
        if (signal.aborted) return;
        adopt(updated); setNotice("הפרופיל נשלח לבדיקה ידנית. הגישה לקטלוג תיפתח רק לאחר אישור העסק.");
      } catch (e) {
        if (signal.aborted) return;
        if (e instanceof MovelyApiError && e.errorCode === "PHONE_NOT_VERIFIED") setUser((v) => ({ ...v, phoneVerified: false }));
        if (e instanceof MovelyApiError && e.errorCode === "POLICY_ACCEPTANCE_REQUIRED") setUser((v) => ({ ...v, hasCurrentPolicyAcceptance: false }));
        if (uncertain(e)) { setBlocked(true); setNotice("לא ידוע אם השמירה הושלמה. בדקו את המצב בשרת לפני ניסיון נוסף; לא נשלח את הפרטים שוב באופן אוטומטי."); }
        else if (e instanceof MovelyApiError && (e.status === 409 || e.errorCode === "BUSINESS_SUSPENDED")) setBlocked(true);
        throw e;
      }
    });
  }
  function refresh() {
    void run(async (signal) => {
      if (!await checkAccount(signal)) return;
      const value = await getMyBusiness(signal); if (signal.aborted) return;
      if (value) { setLatest(value); setNotice("המצב העדכני מוצג להלן. בדקו אותו לפני החלפת תוכן הטופס שלכם."); }
      else if (!profile) { setBlocked(false); setNotice("לא נמצא פרופיל שמור. אפשר לבדוק את הטופס ולשלוח שוב."); }
      else { setNotice("הפרופיל אינו זמין. אין לשלוח את הטופס הקודם; טענו מחדש את העמוד."); }
    });
  }
  if (accessLost) return <section role="alert" className="rounded-xl bg-white p-5"><p>החיבור או הרשאות החשבון השתנו. התחברו מחדש וטענו את העמוד כדי להמשיך בחשבון המתאים.</p><Link href="/auth" className="button button-primary mt-4">כניסה לחשבון</Link></section>;
  if (accountChecking) return <p role="status">בודקים את החשבון לפני הצגת פרטי העסק…</p>;
  if (accountError) return <BusinessError error={accountError} retry={() => { setAccountChecking(true); setAccountAttempt((v) => v + 1); }} />;
  if (!capabilities.policyAcceptanceAvailable) return <div className="max-w-3xl space-y-5">{profile ? <BusinessSummary profile={profile} /> : null}{error ? <BusinessError error={error} /> : null}<p role="status">שליחת פרופילים עסקיים עדיין אינה פתוחה. אפשר לבדוק שוב מאוחר יותר.</p><button type="button" className="button button-secondary" disabled={busy} onClick={() => void run(async (signal) => { await checkAccount(signal); })}>בדיקת זמינות מחדש</button></div>;
  return <div className="max-w-3xl space-y-6">
    {profile ? <BusinessSummary profile={profile} /> : null}
    <p className="leading-7 text-slate-700">פרטי העסק והנציג משמשים לבדיקה ידנית של צוות האתר ואינם מוצגים בקטלוג הבקשות. אין צורך להעלות תעודות או מסמכים כאן. מספר העסק נבדק בטופס מבחינת המבנה בלבד; שליחת הטופס אינה אישור שהעסק אומת.</p>
    {error ? <BusinessError error={error} /> : null}{notice ? <p role="status" className="rounded-xl border border-sky-200 bg-sky-50 p-4 leading-7">{notice}</p> : null}
    {blocked ? <button type="button" className="button button-secondary" disabled={busy} onClick={refresh}>בדיקת המצב העדכני</button> : null}
    {latest ? <section className="space-y-3 rounded-xl border-2 border-sky-700 p-4"><h2 className="text-xl font-bold">הגרסה העדכנית שנשמרה</h2><BusinessSummary profile={latest} /><p>טעינת הגרסה הזו תחליף את השינויים שטרם נשמרו בטופס.</p><button type="button" className="button button-primary" onClick={() => adopt(latest)}>החלפת הטופס בגרסה העדכנית</button></section> : null}
    {profile?.status === "Suspended" ? <p className="leading-7">לא ניתן לערוך עסק מושעה. הודעת צוות הבדיקה מופיעה למעלה. פתיחה מחדש דורשת בדיקה של צוות האתר.</p> : <>
      {(!user.phoneVerified || !user.hasCurrentPolicyAcceptance || !capabilities.policyAcceptanceAvailable) ? <section className="rounded-xl border border-amber-300 bg-amber-50 p-5"><h2 className="text-xl font-bold">השלמת פרטי החשבון לפני שליחה</h2><p className="mt-2 leading-7">יש לאמת טלפון ולאשר את התנאים המעודכנים. הטופס יישאר כאן בזמן שתעברו לחשבון בלשונית חדשה.</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/auth" target="_blank" rel="noopener noreferrer" className="button button-primary">אימות ואישור בחשבון (לשונית חדשה)</Link><button type="button" className="button button-secondary" disabled={busy} onClick={() => void run(async (signal) => { if (await checkAccount(signal)) setNotice("החשבון מוכן לשליחת הפרטים. הטופס שלכם נשמר."); })}>בדיקת החשבון מחדש</button></div></section> : null}
      <form className="space-y-5 rounded-xl border border-slate-200 bg-white p-5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <fieldset disabled={busy} className="space-y-5"><legend className="mb-4 text-xl font-bold">{profile ? "עדכון פרטי העסק" : "יצירת פרופיל עסקי"}</legend>
          {([ ["name", "שם העסק", 120], ["registrationNumber", "מספר עוסק / ח.פ.", 9], ["registeredAddress", "כתובת העסק הרשומה", 300], ["representativeName", "שם הנציג המורשה", 120] ] as const).map(([field, label, max]) => <label key={field} className="field-label">{label}<input className="field-control" name={field} required minLength={field === "registrationNumber" ? 9 : 2} maxLength={max} inputMode={field === "registrationNumber" ? "numeric" : "text"} pattern={field === "registrationNumber" ? "[0-9]{9}" : undefined} dir={field === "registrationNumber" ? "ltr" : undefined} value={draft[field]} onChange={(e) => setDraft({ ...draft, [field]: e.target.value })} />{field === "registrationNumber" ? <span className="text-sm font-normal">9 ספרות, כולל אפסים בתחילת המספר. אין להזין מספר נוסף של תעודת זהות.</span> : null}</label>)}
          <ServiceAreas value={areas} onChange={setAreas} disabled={busy} />
          <label className="flex min-h-11 items-start gap-3 leading-7"><input type="checkbox" className="mt-1.5 size-5 shrink-0" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} required />אני מורשה/ית לייצג את העסק ולאשר שהפרטים שנמסרו נכונים.</label>
          {profile?.status === "Verified" ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="font-bold">שמירת שינויים תעביר את העסק לבדיקה חוזרת ותעצור את הגישה לקטלוג עד לאישור.</p><label className="mt-3 flex min-h-11 items-start gap-3 leading-7"><input type="checkbox" className="mt-1.5 size-5 shrink-0" checked={reverify} onChange={(e) => setReverify(e.target.checked)} required />אני מבין/ה ומאשר/ת את המעבר לבדיקה חוזרת.</label></div> : null}
          <button type="submit" className="button button-primary" disabled={busy || blocked || !user.phoneVerified || !user.hasCurrentPolicyAcceptance || !capabilities.policyAcceptanceAvailable}>{busy ? "בודקים ושומרים…" : profile?.status === "Rejected" ? "שליחה חוזרת לבדיקה" : "שליחת הפרופיל לבדיקה"}</button>
        </fieldset>
      </form>
    </>}
  </div>;
}
