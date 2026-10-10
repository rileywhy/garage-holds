import type { Metadata } from "next";
import { UploadForm } from "@/features/uploads/upload-form";
export const metadata: Metadata = { title: "Upload a design" };
export default function UploadPage() {
  return <UploadForm />;
}
