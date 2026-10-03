import type { CadRenderer } from '../../cad/renderer/CadRenderer';

export interface CadNavigationState {
  cameraX: number;
  cameraY: number;
  unitsPerPixel: number;
  space: string;
  layoutName?: string;
}

export class ComparisonNavigationController {
  private oldRenderer: CadRenderer | null = null;
  private newRenderer: CadRenderer | null = null;
  private isSyncing = false;

  public registerOldViewer(renderer: CadRenderer) {
    this.oldRenderer = renderer;
    renderer.onNavigationChanged = (state) => this.handleNavigationChange('OLD', state);
  }

  public registerNewViewer(renderer: CadRenderer) {
    this.newRenderer = renderer;
    renderer.onNavigationChanged = (state) => this.handleNavigationChange('NEW', state);
  }

  public unregisterOldViewer() {
    if (this.oldRenderer) {
      this.oldRenderer.onNavigationChanged = undefined;
      this.oldRenderer = null;
    }
  }

  public unregisterNewViewer() {
    if (this.newRenderer) {
      this.newRenderer.onNavigationChanged = undefined;
      this.newRenderer = null;
    }
  }

  private handleNavigationChange(source: 'OLD' | 'NEW', state: CadNavigationState) {
    if (this.isSyncing) return;
    
    if (!isFinite(state.unitsPerPixel) || state.unitsPerPixel <= 0) return;
    if (!isFinite(state.cameraX) || !isFinite(state.cameraY)) return;

    const targetRenderer = source === 'OLD' ? this.newRenderer : this.oldRenderer;
    if (!targetRenderer) return;

    // Do not synchronize if they are viewing different spaces/layouts
    const targetState = targetRenderer.getNavigationState();
    if (!targetState) return;
    
    if (targetState.space !== state.space || targetState.layoutName !== state.layoutName) {
      return;
    }

    this.isSyncing = true;
    
    try {
      targetRenderer.setNavigationState(state);
    } finally {
      this.isSyncing = false;
    }
  }

  public getOldRenderer(): CadRenderer | null {
    return this.oldRenderer;
  }

  public getNewRenderer(): CadRenderer | null {
    return this.newRenderer;
  }

  public fitToCombinedBounds() {
    if (!this.oldRenderer || !this.newRenderer) return;
    
    const oldBounds = this.oldRenderer.getDocumentBounds();
    const newBounds = this.newRenderer.getDocumentBounds();
    
    if (!oldBounds && !newBounds) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    if (oldBounds) {
      minX = Math.min(minX, oldBounds.minX);
      minY = Math.min(minY, oldBounds.minY);
      maxX = Math.max(maxX, oldBounds.maxX);
      maxY = Math.max(maxY, oldBounds.maxY);
    }
    if (newBounds) {
      minX = Math.min(minX, newBounds.minX);
      minY = Math.min(minY, newBounds.minY);
      maxX = Math.max(maxX, newBounds.maxX);
      maxY = Math.max(maxY, newBounds.maxY);
    }
    
    const combinedBounds = { min: [minX, minY, 0], max: [maxX, maxY, 0] };
    
    // Fit old renderer to combined bounds. The navigation change will sync the new renderer.
    this.oldRenderer.fitToDrawing(combinedBounds);
    
    // Explicitly set new renderer to identical state to ensure they match perfectly
    const oldState = this.oldRenderer.getNavigationState();
    if (oldState) {
        this.isSyncing = true;
        try {
            this.newRenderer.setNavigationState(oldState);
        } finally {
            this.isSyncing = false;
        }
    }
  }

  public focusOnChange(change: import('../types/comparison-types').ComparisonChange, oldDoc: any, newDoc: any) {
    if (this.oldRenderer) this.oldRenderer.setCurrentComparisonChange(change.oldEntity);
    if (this.newRenderer) this.newRenderer.setCurrentComparisonChange(change.newEntity);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let foundBounds = false;
    let space = 'model';
    let layoutName: string | undefined;

    const mergeBounds = (b: {minX: number, minY: number, maxX: number, maxY: number}, s: string, lName?: string) => {
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
      foundBounds = true;
      space = s;
      layoutName = lName;
    };

    if (change.oldEntity && this.oldRenderer) {
      const b = this.oldRenderer.getEntityWorldBounds(change.oldEntity);
      if (b) mergeBounds(b, change.oldEntity.space, change.oldEntity.layoutName);
    }
    
    if (change.newEntity && this.newRenderer) {
      const b = this.newRenderer.getEntityWorldBounds(change.newEntity);
      if (b) mergeBounds(b, change.newEntity.space, change.newEntity.layoutName);
    }

    if (foundBounds) {
      const width = maxX - minX;
      const height = maxY - minY;
      const padX = width === 0 ? 10 : width * 0.15;
      const padY = height === 0 ? 10 : height * 0.15;
      
      const targetBounds = {
        minX: minX - padX,
        minY: minY - padY,
        maxX: maxX + padX,
        maxY: maxY + padY,
      };

      if (this.oldRenderer && change.oldEntity) {
        const state = this.oldRenderer.getNavigationState();
        if (state && (state.space !== space || state.layoutName !== layoutName)) {
          this.oldRenderer.renderSpace(space as any, layoutName);
        }
        this.oldRenderer.focusOnBounds(targetBounds);
      }

      if (this.newRenderer && change.newEntity) {
        const state = this.newRenderer.getNavigationState();
        if (state && (state.space !== space || state.layoutName !== layoutName)) {
          this.newRenderer.renderSpace(space as any, layoutName);
        }
        this.newRenderer.focusOnBounds(targetBounds);
      }
    }
  }

  public clearChangeFocus() {
    if (this.oldRenderer) this.oldRenderer.setCurrentComparisonChange(undefined);
    if (this.newRenderer) this.newRenderer.setCurrentComparisonChange(undefined);
  }
}
