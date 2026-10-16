import { OldalNaplo } from "@/components/oldal-naplo";

// Az /erkezes használatát is naplózzuk (a régi sofőrnézet kivezetésének
// mérése, docs/fuvarozas-1-hullam-terv.md D/8). A beacon a munkamenetből
// azonosít, névtelen kérést a /api/oldal-naplo eldob.
export default function ErkezesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <OldalNaplo />
    </>
  );
}
