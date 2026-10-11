// Shared by the form and the server action. Limits match the feedback
// table's constraints.

export interface FeedbackInput {
  body: string;
  contact: string;
  page: string;
}

export const MIN_BODY = 10;
export const MAX_BODY = 2000;

export function validateFeedback(input: FeedbackInput): string[] {
  const errors: string[] = [];
  if (input.body.length < MIN_BODY)
    errors.push("Tell us a little more; at least 10 characters.");
  if (input.body.length > MAX_BODY)
    errors.push("Keep it under 2000 characters.");
  if (input.contact.length > 120)
    errors.push("Keep the contact under 120 characters.");
  if (input.page.length > 300) errors.push("The page address is too long.");
  return errors;
}
