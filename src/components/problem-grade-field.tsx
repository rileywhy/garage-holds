import { Field } from "./form-fields";
import {
  GRADE_BOARD_ANGLE,
  PROBLEM_GRADES,
  formatProblemGrade,
} from "@/features/holds/grades";

export function ProblemGradeField({
  defaultValue = null,
}: {
  defaultValue?: number | null;
}) {
  return (
    <Field
      label={`Suggested problem grade at ${GRADE_BOARD_ANGLE}° (optional)`}
      hint="For a problem using this hold on a 40° board."
    >
      <select name="problemGrade" defaultValue={defaultValue ?? ""}>
        <option value="">Not specified</option>
        {PROBLEM_GRADES.map((grade) => (
          <option key={grade} value={grade}>
            {formatProblemGrade(grade)}
          </option>
        ))}
      </select>
    </Field>
  );
}
