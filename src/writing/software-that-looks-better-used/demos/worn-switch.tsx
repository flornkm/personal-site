import { PatinaSwitch } from "./patina-switch";

/* Same stage as the figures in the tips article: a quiet outlined floor with the control alone at
   its centre, so the three patina figures sit at the same weight in the column. */
export function WornSwitch() {
  return (
    <figure className="not-prose max-lg:-mx-4 mx-auto my-8 max-w-[520px] font-pretendard">
      <div className="flex min-h-[16rem] items-center justify-center rounded-sm p-4 outline -outline-offset-1 outline-black/5 md:p-12 dark:outline-white/8">
        <PatinaSwitch />
      </div>
    </figure>
  );
}
