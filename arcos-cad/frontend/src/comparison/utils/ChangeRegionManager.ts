import type { ComparisonChange, ComparisonEntityReference } from '../types/comparison-types';

export interface ChangeRegion {
    id: string;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    changes: ComparisonChange[];
    summary: {
        added: number;
        removed: number;
        modified: number;
    };
    space: string;
}

export class ChangeRegionManager {
    /**
     * Groups changes into spatial regions.
     * @param changes List of changes to group.
     * @param getBoundsFn A function that returns the world bounds for an entity reference.
     * @param threshold Expansion threshold to merge nearby bounds.
     */
    public static computeRegions(
        changes: ComparisonChange[],
        getBoundsFn: (ref: ComparisonEntityReference, side: 'OLD' | 'NEW') => { minX: number, minY: number, maxX: number, maxY: number } | null,
        threshold: number = 10.0
    ): ChangeRegion[] {
        const boxes: { bounds: { minX: number, minY: number, maxX: number, maxY: number }, change: ComparisonChange, space: string }[] = [];

        // 1. Gather all bounding boxes
        for (const change of changes) {
            let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
            let valid = false;

            if (change.oldEntity) {
                const b = getBoundsFn(change.oldEntity, 'OLD');
                if (b) {
                    bMinX = Math.min(bMinX, b.minX);
                    bMinY = Math.min(bMinY, b.minY);
                    bMaxX = Math.max(bMaxX, b.maxX);
                    bMaxY = Math.max(bMaxY, b.maxY);
                    valid = true;
                }
            }

            if (change.newEntity) {
                const b = getBoundsFn(change.newEntity, 'NEW');
                if (b) {
                    bMinX = Math.min(bMinX, b.minX);
                    bMinY = Math.min(bMinY, b.minY);
                    bMaxX = Math.max(bMaxX, b.maxX);
                    bMaxY = Math.max(bMaxY, b.maxY);
                    valid = true;
                }
            }

            if (valid) {
                const space = change.oldEntity?.space || change.newEntity?.space || 'model';
                boxes.push({
                    bounds: {
                        minX: bMinX - threshold,
                        minY: bMinY - threshold,
                        maxX: bMaxX + threshold,
                        maxY: bMaxY + threshold
                    },
                    change,
                    space
                });
            }
        }

        const regions: ChangeRegion[] = [];
        const merged = new Array(boxes.length).fill(false);

        for (let i = 0; i < boxes.length; i++) {
            if (merged[i]) continue;
            
            const currentRegion = {
                id: `region-${i}`,
                bounds: { ...boxes[i].bounds },
                changes: [boxes[i].change],
                summary: { added: 0, removed: 0, modified: 0 },
                space: boxes[i].space
            };
            
            merged[i] = true;
            let expanded = true;

            // Grow the region as long as we keep intersecting new boxes
            while (expanded) {
                expanded = false;
                for (let j = 0; j < boxes.length; j++) {
                    if (merged[j]) continue;
                    if (boxes[j].space !== currentRegion.space) continue;
                    
                    const b = boxes[j].bounds;
                    const r = currentRegion.bounds;
                    
                    // Check intersection
                    if (b.minX <= r.maxX && b.maxX >= r.minX && b.minY <= r.maxY && b.maxY >= r.minY) {
                        // Merge
                        r.minX = Math.min(r.minX, b.minX);
                        r.minY = Math.min(r.minY, b.minY);
                        r.maxX = Math.max(r.maxX, b.maxX);
                        r.maxY = Math.max(r.maxY, b.maxY);
                        
                        currentRegion.changes.push(boxes[j].change);
                        merged[j] = true;
                        expanded = true;
                    }
                }
            }
            
            regions.push(currentRegion as any);
        }

        // Calculate summaries
        for (const r of regions) {
            for (const c of r.changes) {
                if (c.changeType === 'ADDED') r.summary.added++;
                if (c.changeType === 'REMOVED') r.summary.removed++;
                if (c.changeType === 'MODIFIED') r.summary.modified++;
            }
        }

        return regions;
    }
}
