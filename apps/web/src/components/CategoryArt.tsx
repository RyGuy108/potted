import fs from "node:fs";
import path from "node:path";
import { GameArt } from "./GameArt";

/**
 * The picture on a "Games and stream types" tile. Uses the tile image in
 * public/categories/<id>.webp when there is one, and the drawn art when
 * there isn't. Only the category grids use this; cards and stream
 * thumbnails keep the drawn art.
 */
export function CategoryArt({ id, name }: { id: string; name: string }) {
  if (!fs.existsSync(path.join(process.cwd(), "public", "categories", `${id}.webp`))) return <GameArt id={id} name={name} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="game-art category-photo" src={`/categories/${id}.webp`} alt={name} loading="lazy" draggable={false} />;
}
