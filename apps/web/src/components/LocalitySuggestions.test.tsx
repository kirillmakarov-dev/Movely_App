import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import LocalitySuggestions from "./LocalitySuggestions";
import type { Locality } from "@/lib/movely-api";

const getLocalities = vi.hoisted(() => vi.fn());
vi.mock("@/lib/movely-api", () => ({ getLocalities }));
const localities: Locality[] = [{ code: "7", name: "שחר" }, { code: "3000", name: "ירושלים" }];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => { getLocalities.mockReset(); getLocalities.mockResolvedValue(localities); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

test("one native datalist contains the server's names without selecting a value", async () => {
  const { container } = render(<><input aria-label="עיר איסוף" list="localities" defaultValue="מקום ישן" /><input aria-label="עיר יעד" list="localities" /><LocalitySuggestions id="localities" /></>);
  await waitFor(() => expect(container.querySelector('option[value="ירושלים"]')).toBeInTheDocument());
  expect(container.querySelectorAll("datalist")).toHaveLength(1);
  expect(container.querySelectorAll("option")).toHaveLength(2);
  expect(Array.from(container.querySelectorAll("option"), (option) => option.value)).toEqual(["ירושלים", "שחר"]);
  expect(localities.map((locality) => locality.name)).toEqual(["שחר", "ירושלים"]);
  expect(screen.getByRole("combobox", { name: "עיר איסוף" })).toHaveValue("מקום ישן");
  expect(screen.getByRole("combobox", { name: "עיר יעד" })).toHaveValue("");
  expect(getLocalities).toHaveBeenCalledWith(expect.any(AbortSignal));
  const source = screen.getByRole("link", { name: /מקור שמות היישובים.*נפתח בלשונית חדשה/ });
  expect(source).toHaveAttribute("href", "https://data.gov.il/he/datasets/population_authority/citiesandsettelments");
  expect(source).toHaveAttribute("target", "_blank");
  expect(source).toHaveAttribute("rel", "noopener noreferrer");
});

test("failure preserves manual entries and retries without showing provider errors or fake choices", async () => {
  getLocalities.mockRejectedValueOnce(new Error("private server URL and details"));
  const { container } = render(<><input aria-label="עיר" list="localities" defaultValue="שם חופשי" /><LocalitySuggestions id="localities" /></>);
  const retry = await screen.findByRole("button", { name: "טעינת ההצעות מחדש" });
  expect(screen.getByRole("status")).toHaveTextContent("אפשר להקליד");
  expect(screen.getByRole("status")).not.toHaveTextContent("private server");
  expect(container.querySelectorAll("option")).toHaveLength(0);
  fireEvent.change(screen.getByRole("combobox", { name: "עיר" }), { target: { value: "שם שהוקלד בזמן תקלה" } });
  fireEvent.click(retry);
  await waitFor(() => expect(container.querySelector('option[value="ירושלים"]')).toBeInTheDocument());
  expect(screen.getByRole("combobox", { name: "עיר" })).toHaveValue("שם שהוקלד בזמן תקלה");
  expect(getLocalities).toHaveBeenCalledTimes(2);
});

test("a stalled request aborts after ten seconds and cannot replace a newer retry", async () => {
  vi.useFakeTimers();
  const first = deferred<Locality[]>();
  getLocalities.mockReturnValueOnce(first.promise);
  const { container } = render(<LocalitySuggestions id="localities" />);
  const firstSignal = getLocalities.mock.calls[0][0] as AbortSignal;
  await act(async () => vi.advanceTimersByTime(9_999));
  expect(firstSignal.aborted).toBe(false);
  await act(async () => vi.advanceTimersByTime(1));
  expect(firstSignal.aborted).toBe(true);
  expect(screen.getByRole("button", { name: "טעינת ההצעות מחדש" })).toBeEnabled();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "טעינת ההצעות מחדש" })));
  expect(container.querySelectorAll("option")).toHaveLength(2);
  await act(async () => first.resolve([{ code: "9999", name: "תשובה ישנה" }]));
  expect(container.querySelectorAll("option")).toHaveLength(2);
  expect(container.querySelector('option[value="תשובה ישנה"]')).not.toBeInTheDocument();
  expect(vi.getTimerCount()).toBe(0);
});

test("unmount aborts the fetch and clears its deadline", async () => {
  vi.useFakeTimers();
  const pending = deferred<Locality[]>();
  getLocalities.mockReturnValue(pending.promise);
  const { unmount } = render(<LocalitySuggestions id="localities" />);
  const signal = getLocalities.mock.calls[0][0] as AbortSignal;
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(signal.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => pending.resolve(localities));
});
