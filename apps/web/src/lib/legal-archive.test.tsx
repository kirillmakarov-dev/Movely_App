import { createHash } from "node:crypto";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import archive from "./legal-archive/draft-2026-10-29.json";
import { LEGAL_DRAFT_VERSION, privacyDocument, termsDocument } from "./legal-content";
import ArchivedLegalPage from "@/app/legal/versions/[version]/[document]/page";
import LegalVersionsPage from "@/app/legal/versions/page";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
afterEach(cleanup);

test("the previous legal bundle remains byte-equivalent after canonical JSON serialization", () => {
  expect(createHash("sha256").update(JSON.stringify(archive)).digest("hex")).toBe("ed9517ce59b5c9b8ba902c1b8da8538fcd75d0d55ce9cb201d706c6dc68f84ab");
  expect(archive.privacy.version).toBe(archive.version);
  expect(archive.terms.version).toBe(archive.version);
  expect(LEGAL_DRAFT_VERSION).not.toBe(archive.version);
  expect(privacyDocument.version).toBe(termsDocument.version);
  expect(privacyDocument.draft).toBe(true);
});

test.each(["privacy", "terms"])("historical %s identifies itself and offers the current document", async (document) => {
  render(await ArchivedLegalPage({ params: Promise.resolve({ version: archive.version, document }) }));
  expect(screen.getByRole("complementary", { name: "גרסה קודמת" })).toBeVisible();
  expect(screen.getByRole("link", { name: "מעבר לנוסח העדכני" })).toHaveAttribute("href", `/${document}`);
  expect(screen.getByText(archive.version)).toBeVisible();
  expect(screen.getByRole("link", { name: "גרסאות המסמכים" })).toHaveAttribute("href", "/legal/versions");
});

test.each([
  { version: "unknown", document: "privacy" },
  { version: archive.version, document: "__proto__" },
  { version: LEGAL_DRAFT_VERSION, document: "terms" },
])("unknown archive selection cannot substitute another document: %j", async (params) => {
  await expect(ArchivedLegalPage({ params: Promise.resolve(params) })).rejects.toThrow("NOT_FOUND");
});

test("archive navigation separates current documents from previous versions", () => {
  render(<LegalVersionsPage />);
  expect(screen.getByRole("link", { name: "מדיניות פרטיות עדכנית" })).toHaveAttribute("href", "/privacy");
  expect(screen.getByRole("link", { name: "מדיניות פרטיות קודמת" })).toHaveAttribute("href", `/legal/versions/${archive.version}/privacy`);
});
