import print from "print";
import importPoint from "import-point";

export function run() {}

export function movePoint(pnt) {
    const mapPoint = importPoint(pnt);
    print(`x: ${mapPoint.x}, y: ${mapPoint.y}`);
}
