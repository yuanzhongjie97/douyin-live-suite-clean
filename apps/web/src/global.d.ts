export {};

declare global {
  interface Window {
    desktopShell?: {
      window?: {
        getSize(): Promise<{ width: number; height: number } | null>;
        setSize(size: {
          width: number;
          height: number;
        }): Promise<{ width: number; height: number } | null>;
        getAlwaysOnTop(): Promise<boolean>;
        setAlwaysOnTop(value: boolean): Promise<boolean>;
        onMoveStateChange?(callback: (payload: { moving: boolean }) => void): () => void;
      };
    };
  }
}
