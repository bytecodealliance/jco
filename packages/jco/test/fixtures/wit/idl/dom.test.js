import { getWindow } from "webidl:dom/dom@0.0.1";

export function test() {
    const window = getWindow();
    window.document().body().setInnerHtml("<h1>hello world</h1>");
    window.console().log(["HI"]);
}
