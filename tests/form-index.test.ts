// The forms' small index (src/data/form-index.ts, LP-133) is what the shell routes and lists by, so it
// must match the full forms. A change to a form's id, court, section or title fails here until the index
// is rewritten with `npx vitest run -u tests/form-index.test.ts`.

import { expect, test } from "vitest";
import { ALL_FORMS } from "@/data";

test("form-index.json is every form's id, court, section and title", async () => {
  const index = ALL_FORMS.map(({ id, court, section, title }) => ({ id, court, section, title }));
  await expect(JSON.stringify(index, null, 2) + "\n").toMatchFileSnapshot("../src/data/form-index.json");
});
