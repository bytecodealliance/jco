/// <reference path="../generated/types/wit.d.ts"/>
import type { example as ExampleInterface } from "jco-examples:typegen-async-export/component";

export const example: typeof ExampleInterface = {
  async slowDouble(arg: number) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return arg * 2;
  },
};
