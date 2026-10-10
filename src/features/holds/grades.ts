export const GRADE_BOARD_ANGLE = 40;
// Zero represents the combined V0–V1 option; the remaining grades stand alone.
export const PROBLEM_GRADES = [
  0,
  ...Array.from({ length: 16 }, (_, index) => index + 2),
];

export function formatProblemGrade(grade: number): string {
  return grade === 0 ? "V0–V1" : `V${grade}`;
}

export function isProblemGrade(grade: number | null): boolean {
  return grade === null || PROBLEM_GRADES.includes(grade);
}
