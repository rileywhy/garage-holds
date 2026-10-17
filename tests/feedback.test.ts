import test from "node:test";
import assert from "node:assert/strict";
import { spamVerdict } from "../src/features/feedback/spam";
import { validateFeedback } from "../src/features/feedback/validation";

test("feedback needs a real message and bounded contact details", () => {
  assert.deepEqual(
    validateFeedback({
      body: "The STL preview is upside down on /holds/x.",
      contact: "",
      page: "/holds/x",
    }),
    [],
  );
  assert.equal(
    validateFeedback({ body: "broken", contact: "", page: "" }).length,
    1,
  );
  assert.equal(
    validateFeedback({
      body: "x".repeat(2001),
      contact: "y".repeat(121),
      page: "z".repeat(301),
    }).length,
    3,
  );
});

test("feedback posted without the widget is a bot, and pitches are flagged", () => {
  const message = (body: string, page = "/", contact = "") => ({
    body,
    contact,
    page,
  });
  // Shaped like the pitches the form received in October 2026, all of which
  // arrived with no page.
  const pitches = [
    "Dear Sir/Madam Submit garageholds.com in Google's Search Index and have it be visible in web search results!",
    "Hey team garageholds.com, I would like to discuss SEO! We help businesses rank higher on Google.",
    "I'd love to discuss how we can grow your online visibility on ChatGPT and Gemini.",
  ];
  for (const body of pitches) {
    assert.equal(spamVerdict(message(body, "")), "bot");
    assert.equal(spamVerdict(message(body)), "pitch");
  }
  assert.equal(
    spamVerdict(message("Want more traffic?", "/", "backlinks@example.com")),
    "pitch",
  );
  for (const body of [
    "The STL preview is upside down on this design.",
    "Search results on the pile ignore the grade filter.",
    "Seoul climbers would love metric bolt patterns.",
    "your site is totally busted",
  ])
    assert.equal(spamVerdict(message(body, "/holds/x")), null);
});
