import type { DesignInput } from "./types";

// Turns the design form's fields into a DesignInput. Shared by the upload
// and edit forms so both submit the same shape, and validated server-side
// afterwards; this only reads and trims.
export function readDesignInput(form: FormData): DesignInput {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const grade = text("problemGrade");
  return {
    title: text("title"),
    description: text("description"),
    type: text("type") as DesignInput["type"],
    size: text("size") as DesignInput["size"],
    mount: text("mount") as DesignInput["mount"],
    problemGrade: grade === "" ? null : Number(grade),
    recipes: [
      {
        material: text("material"),
        specialProcess: (text("specialProcess") ||
          null) as DesignInput["recipes"][number]["specialProcess"],
        notes: text("printNotes"),
        textureNotes: text("textureNotes"),
        postProcessing: text("postProcessing"),
      },
    ],
    tags: [
      ...new Set(
        text("tags")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ].slice(0, 12),
    license: text("license") as DesignInput["license"],
  };
}
