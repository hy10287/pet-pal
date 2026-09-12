declare module "pixi-live2d-display/cubism4" {
  export class Live2DModel {
    static registerTicker(ticker: unknown): void;
    static from(source: string, options?: Record<string, unknown>): Promise<Live2DModel>;
  }
}
