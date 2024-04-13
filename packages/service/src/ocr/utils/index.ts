import type { ClickPoint, DetermineClickPointOptions, Rectangles, RectReturn } from '../types.js'

export function getDprPositions(values: Rectangles, dpr: number): Rectangles {
    Object.keys({ ...values }).map((value: string) => {
    // @ts-ignore
        values[value] /= dpr
    })

    return values
}

/**
 * Determine the click point
 */
export function determineClickPoint(options: DetermineClickPointOptions): ClickPoint {
    const { rectangles: { left, right, top, bottom } } = options
    const x = Math.round( left + (right - left) / 2 )
    const y = Math.round( top + (bottom - top) / 2 )

    return { x, y }
}

/**
 * Adjust the Element Bbox
 */
export function adjustElementBbox(bbox: Rectangles, elementRect: RectReturn): Rectangles {
    return {
        left: Math.round(bbox.left + elementRect.x),
        top: Math.round(bbox.top + elementRect.y),
        right: Math.round(bbox.right + elementRect.x),
        bottom: Math.round(bbox.bottom + elementRect.y),
    }
}
