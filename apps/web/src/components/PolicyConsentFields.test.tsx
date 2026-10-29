import React, { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PolicyConsentFields, { emptyPolicyChoice } from "./PolicyConsentFields";

afterEach(cleanup);

test("Age and terms are separate unchecked choices with documents available without leaving the form", async () => {
  function Form() {
    const [choice, setChoice] = useState(emptyPolicyChoice);
    return <PolicyConsentFields value={choice} onChange={setChoice} />;
  }
  render(<Form />);
  const user = userEvent.setup();
  const age = screen.getByRole("checkbox", { name: "אני בן / בת 18 ומעלה." });
  const terms = screen.getByRole("checkbox", { name: /אני מסכים/ });
  expect(age).not.toBeChecked();
  expect(terms).not.toBeChecked();
  await user.click(age);
  expect(age).toBeChecked();
  expect(terms).not.toBeChecked();
  expect(screen.getByRole("link", { name: "תנאי השימוש" })).toHaveAttribute("href", "/terms");
  expect(screen.getByRole("link", { name: "הודעת הפרטיות" })).toHaveAttribute("target", "_blank");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
