import { describe, it, expect, vi } from 'vitest';
import { ComparisonNavigationController } from '../navigation/ComparisonNavigationController';
import type { ComparisonChange } from '../types/comparison-types';

describe('Phase 5.20.6 Logic Tests', () => {
  it('Change ordering: Modified, Removed, Added', () => {
    const changes: ComparisonChange[] = [
      { changeType: 'ADDED', entityType: 'LINE' },
      { changeType: 'REMOVED', entityType: 'LINE' },
      { changeType: 'MODIFIED', entityType: 'LINE' },
      { changeType: 'UNCHANGED', entityType: 'LINE' }
    ];
    
    const order: Record<string, number> = { MODIFIED: 1, REMOVED: 2, ADDED: 3, UNCHANGED: 4 };
    const sorted = changes
      .filter(c => c.changeType !== 'UNCHANGED')
      .sort((a, b) => (order[a.changeType] || 9) - (order[b.changeType] || 9));

    expect(sorted.length).toBe(3);
    expect(sorted[0].changeType).toBe('MODIFIED');
    expect(sorted[1].changeType).toBe('REMOVED');
    expect(sorted[2].changeType).toBe('ADDED');
  });

  describe('Focus Targets', () => {
    it('focusOnChange: Added focuses New', () => {
      const controller = new ComparisonNavigationController();
      
      const mockOldRenderer = { setCurrentComparisonChange: vi.fn(), getEntityWorldBounds: vi.fn(), focusOnBounds: vi.fn(), getNavigationState: vi.fn() } as any;
      const mockNewRenderer = { setCurrentComparisonChange: vi.fn(), getEntityWorldBounds: vi.fn(), focusOnBounds: vi.fn(), getNavigationState: vi.fn() } as any;
      
      controller.registerOldViewer(mockOldRenderer);
      controller.registerNewViewer(mockNewRenderer);
      
      const change: ComparisonChange = {
        changeType: 'ADDED',
        entityType: 'LINE',
        newEntity: { entityId: 'new1', entityType: 'LINE', layer: '0', space: 'model', insertPath: [] }
      };

      mockNewRenderer.getEntityWorldBounds.mockReturnValue({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
      mockNewRenderer.getNavigationState.mockReturnValue({ space: 'model' });

      controller.focusOnChange(change, null, null);

      expect(mockOldRenderer.setCurrentComparisonChange).toHaveBeenCalledWith(undefined);
      expect(mockNewRenderer.setCurrentComparisonChange).toHaveBeenCalledWith(change.newEntity);
      expect(mockOldRenderer.focusOnBounds).not.toHaveBeenCalled();
      expect(mockNewRenderer.focusOnBounds).toHaveBeenCalled();
    });

    it('focusOnChange: Removed focuses Old', () => {
      const controller = new ComparisonNavigationController();
      
      const mockOldRenderer = { setCurrentComparisonChange: vi.fn(), getEntityWorldBounds: vi.fn(), focusOnBounds: vi.fn(), getNavigationState: vi.fn() } as any;
      const mockNewRenderer = { setCurrentComparisonChange: vi.fn(), getEntityWorldBounds: vi.fn(), focusOnBounds: vi.fn(), getNavigationState: vi.fn() } as any;
      
      controller.registerOldViewer(mockOldRenderer);
      controller.registerNewViewer(mockNewRenderer);
      
      const change: ComparisonChange = {
        changeType: 'REMOVED',
        entityType: 'LINE',
        oldEntity: { entityId: 'old1', entityType: 'LINE', layer: '0', space: 'model', insertPath: [] }
      };

      mockOldRenderer.getEntityWorldBounds.mockReturnValue({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
      mockOldRenderer.getNavigationState.mockReturnValue({ space: 'model' });

      controller.focusOnChange(change, null, null);

      expect(mockNewRenderer.setCurrentComparisonChange).toHaveBeenCalledWith(undefined);
      expect(mockOldRenderer.setCurrentComparisonChange).toHaveBeenCalledWith(change.oldEntity);
      expect(mockNewRenderer.focusOnBounds).not.toHaveBeenCalled();
      expect(mockOldRenderer.focusOnBounds).toHaveBeenCalled();
    });

    it('focusOnChange: Modified focuses Old + New', () => {
      const controller = new ComparisonNavigationController();
      
      const mockOldRenderer = { setCurrentComparisonChange: vi.fn(), getEntityWorldBounds: vi.fn(), focusOnBounds: vi.fn(), getNavigationState: vi.fn() } as any;
      const mockNewRenderer = { setCurrentComparisonChange: vi.fn(), getEntityWorldBounds: vi.fn(), focusOnBounds: vi.fn(), getNavigationState: vi.fn() } as any;
      
      controller.registerOldViewer(mockOldRenderer);
      controller.registerNewViewer(mockNewRenderer);
      
      const change: ComparisonChange = {
        changeType: 'MODIFIED',
        entityType: 'LINE',
        oldEntity: { entityId: 'old1', entityType: 'LINE', layer: '0', space: 'model', insertPath: [] },
        newEntity: { entityId: 'new1', entityType: 'LINE', layer: '0', space: 'model', insertPath: [] }
      };

      mockOldRenderer.getEntityWorldBounds.mockReturnValue({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
      mockNewRenderer.getEntityWorldBounds.mockReturnValue({ minX: 5, minY: 5, maxX: 15, maxY: 15 });
      mockOldRenderer.getNavigationState.mockReturnValue({ space: 'model' });
      mockNewRenderer.getNavigationState.mockReturnValue({ space: 'model' });

      controller.focusOnChange(change, null, null);

      expect(mockOldRenderer.setCurrentComparisonChange).toHaveBeenCalledWith(change.oldEntity);
      expect(mockNewRenderer.setCurrentComparisonChange).toHaveBeenCalledWith(change.newEntity);
      
      // Both should be focused on combined bounds plus padding
      // Combined bounds: minX: 0, minY: 0, maxX: 15, maxY: 15
      expect(mockOldRenderer.focusOnBounds).toHaveBeenCalled();
      expect(mockNewRenderer.focusOnBounds).toHaveBeenCalled();
      
      const calledBounds = mockOldRenderer.focusOnBounds.mock.calls[0][0];
      // Padding is 15% of width/height => 15 * 0.15 = 2.25
      expect(calledBounds.minX).toBeCloseTo(-2.25);
      expect(calledBounds.maxX).toBeCloseTo(17.25);
    });
  });
});
