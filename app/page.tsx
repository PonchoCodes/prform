import { LandingPage } from "@/components/LandingPage";
import { isEarlyAccessEnabled } from "@/lib/earlyAccess";

// Read the EARLY_ACCESS flag at request time, not at build time.
export const dynamic = "force-dynamic";

export default function Home() {
  return <LandingPage earlyAccess={isEarlyAccessEnabled()} />;
}
