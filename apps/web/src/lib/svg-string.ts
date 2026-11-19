import { Fragment, type ReactNode, isValidElement } from "react";

/**
 * Turns a tree of plain SVG elements (as the game art is written) into an
 * SVG string, for images served from a route. Handles intrinsic elements,
 * fragments, arrays, text and simple function components. Not a general
 * React renderer: no hooks, no context.
 */

// React prop names that SVG spells with a hyphen.
const KEEP = new Set(["viewBox", "preserveAspectRatio", "gradientUnits", "gradientTransform", "patternUnits", "textLength", "lengthAdjust"]);
const attr = (name: string) => (KEEP.has(name) ? name : name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`));
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function svgString(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return esc(String(node));
  if (Array.isArray(node)) return node.map(svgString).join("");
  if (!isValidElement(node)) return "";
  const { type } = node;
  const props = node.props as Record<string, unknown> & { children?: ReactNode };
  if (type === Fragment) return svgString(props.children);
  if (typeof type === "function") return svgString((type as (p: unknown) => ReactNode)(props));
  if (typeof type !== "string") return "";
  let attrs = "";
  for (const [key, value] of Object.entries(props)) {
    if (key === "children" || value === undefined || value === null || value === false) continue;
    if (key === "className") attrs += ` class="${esc(String(value))}"`;
    else attrs += ` ${attr(key)}="${esc(String(value))}"`;
  }
  const inner = svgString(props.children);
  return inner ? `<${type}${attrs}>${inner}</${type}>` : `<${type}${attrs}/>`;
}
