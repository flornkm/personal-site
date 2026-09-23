import { PatinaSticker } from "./patina-sticker";

/* Same stage as the figures in the tips article: a quiet outlined floor with the control alone at
   its centre, so the three patina figures sit at the same weight in the column. */
export function PeelingSticker() {
  return (
    <figure className="not-prose mx-auto my-8 max-w-[520px] font-pretendard">
      <div className="flex min-h-[16rem] items-center justify-center rounded-sm p-4 outline -outline-offset-1 outline-black/5 md:p-12 dark:outline-white/8">
        <PatinaSticker />
      </div>
    </figure>
  );
}
