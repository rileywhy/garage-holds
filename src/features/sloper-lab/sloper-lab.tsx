import { HoldLab } from "@/features/hold-lab/hold-lab";
export function SloperLab({ account = false }: { account?: boolean }) {
  return <HoldLab kind="sloper" account={account} />;
}
