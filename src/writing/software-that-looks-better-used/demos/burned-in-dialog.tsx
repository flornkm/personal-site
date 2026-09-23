import { PatinaBurnIn } from "./patina-burn-in";

/* Same stage as the other figures in the post, with the screen standing in for the page the mark
   is left on. */
export function BurnedInDialog() {
  return (
    <figure className="not-prose mx-auto my-8 max-w-[520px] font-pretendard">
      <div className="flex min-h-[16rem] items-center justify-center rounded-sm p-3 outline -outline-offset-1 outline-black/5 md:p-12 dark:outline-white/8">
        <PatinaBurnIn />
      </div>
    </figure>
  );
}
