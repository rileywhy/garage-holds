import { GRADE_BOARD_ANGLE, isProblemGrade } from "../features/holds/grades";
import { SPECIAL_PROCESSES } from "../features/holds/types";

export function migratePrintingMetadata(
  record: Record<string, unknown>,
): Record<string, unknown> {
  if (!Array.isArray(record.recipes)) return { ...record };
  return {
    ...record,
    recipes: record.recipes.map((recipe: Record<string, unknown>) => {
      const { process, ...retained } = recipe;
      const specialProcess =
        process === "Resin"
          ? SPECIAL_PROCESSES[1]
          : process === "Mold master"
            ? SPECIAL_PROCESSES[2]
            : null;
      return { ...retained, specialProcess, textureNotes: "" };
    }),
  };
}

// Old ranges cannot reliably become one grade. Keep only unambiguous 40° suggestions.
export function migrateClimbingMetadata(
  record: Record<string, unknown>,
  kind: "hold" | "review",
): Record<string, unknown> {
  const migrated = { ...record };
  const angle = kind === "hold" ? record.gradeAngle : record.boardAngle;
  let problemGrade: number | null = null;
  if (angle === GRADE_BOARD_ANGLE) {
    if (record.gradeMin === 0 && record.gradeMax === 1) problemGrade = 0;
    else if (
      typeof record.gradeMin === "number" &&
      record.gradeMin === record.gradeMax &&
      isProblemGrade(record.gradeMin)
    )
      problemGrade = record.gradeMin;
    else if (record.gradeMin === 1 && record.gradeMax === 1) problemGrade = 0;
  }
  for (const key of [
    "dimensions",
    "incut",
    "angleMin",
    "angleMax",
    "gradeMin",
    "gradeMax",
    "gradeAngle",
    "boardAngle",
  ])
    delete migrated[key];
  migrated.problemGrade = problemGrade;
  return migrated;
}
