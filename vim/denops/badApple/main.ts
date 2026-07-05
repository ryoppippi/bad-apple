import * as path from "https://deno.land/std@0.215.0/path/mod.ts";
import { Denops } from "https://deno.land/x/denops_std@v6.0.1/mod.ts";

const log = async (denops, content) => {
  try {
    const newContent = content.split(/\n/).filter((x, i) =>
      typeof x === "string" && i > 0
    )
      .map((x) => x.slice(0, -1));
    await denops.call("setline", 1, newContent);
  } catch (e) {
    console.error(e);
    return;
  }
};

export async function main(denops: Denops): Promise<void> {
  denops.dispatcher = {
    async badApple(): Promise<void> {
      const parent_dir = path.dirname(path.fromFileUrl(import.meta.url));
      const file = await Deno.open(parent_dir + "/frames.txt", { read: true });
      const decoder = new TextDecoder();
      const rawContent = Deno.readAllSync(file);
      const t = decoder.decode(rawContent);
      const e = t.split(/^\n$/gm);
      const o = Date.now();
      let l = 0;
      const c = async (t) => {
        let s = null;
        let a = t.split(/\d$/gm);
        let p = ++l * (1 / 30) * 1000;
        let d = Date.now() - o;
        await log(denops, a[2]),
          (s = Date.now()),
          setTimeout(async () => {
            // console.clear();
            e.length > 0 ? c(e.shift()) : console.log("ENDED");
          }, p - d);
      };
      await denops.cmd("enew");
      await denops.cmd("setlocal nowrap");
      await c(e.shift());
    },
  };

  await denops.cmd(
    `command! BadApple call denops#request('${denops.name}', 'badApple', [])`,
  );
}
