interface JointVibePannellumViewer {
  destroy: () => void;
  getYaw: () => number;
  getPitch: () => number;
  getHfov: () => number;
  mouseEventToCoords: (event: MouseEvent) => [number, number] | null;
  on: (event: string, callback: (event: MouseEvent) => void) => void;
}

interface JointVibePannellumApi {
  viewer: (element: HTMLElement, config: Record<string, unknown>) => JointVibePannellumViewer;
}

interface Window {
  pannellum?: JointVibePannellumApi;
}
