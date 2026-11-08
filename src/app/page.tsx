import { stamp } from "@/lib/changelog";
import AppLoader from "@/shell/AppLoader";

export default function Page() {
  // What's new's stamp is worked out on the server, so its entries stay out of the home screen's first load (LP-242).
  return <AppLoader changelogStamp={stamp()} />;
}
