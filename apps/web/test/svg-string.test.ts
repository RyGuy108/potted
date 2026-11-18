import { createElement as h, Fragment } from "react";
import { describe, expect, it } from "vitest";
import { svgString } from "@/lib/svg-string";

describe("svgString", () => {
  it("writes SVG attributes and escapes text", () => {
    const Part = ({ n }: { n: string }) => h("text", { x: 1, fontSize: 12, textAnchor: "end" }, n);
    const out = svgString(
      h("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 10 10" }, h(Fragment, null, h("path", { d: "M0 0", strokeWidth: 3, fill: undefined }), [h(Part, { key: "a", n: "<Tom & Jo>" })])),
    );
    expect(out).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0" stroke-width="3"/><text x="1" font-size="12" text-anchor="end">&lt;Tom &amp; Jo&gt;</text></svg>');
  });
});
