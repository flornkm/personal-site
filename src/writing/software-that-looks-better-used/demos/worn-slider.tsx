import { PatinaSlider } from "./patina-slider";

/* Same stage as the other figures in the post, with the control alone at its centre. */
export function WornSlider() {
  return (
    <figure className="not-prose max-lg:-mx-4 mx-auto my-8 max-w-[520px] font-pretendard">
      <div className="flex min-h-[16rem] items-center justify-center rounded-sm p-4 outline -outline-offset-1 outline-black/5 md:p-12 dark:outline-white/8">
        <PatinaSlider />
      </div>
    </figure>
  );
}
