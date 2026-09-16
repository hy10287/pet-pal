import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { HitZone } from "../shared/types";
import { fallbackHitZone, refineVisibleZone } from "../interaction/hit-zones";
import type { LookState } from "../interaction/mouse-follow";
import type { ExpressionParams } from "./expression";
import type { PetActor } from "./actor";
import { lockFullBodyFitted, bottomPinFromLocalBottom } from "./display-crop";
import { visualScale } from "./fit-scale";

const FALLBACK_NATURAL = { width: 220, height: 340 };
/** Local Y of the bottom of the drawn character (shadow). */
const FALLBACK_LOCAL_BOTTOM = 170;

interface Spark {
  g: Graphics;
  life: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export class FallbackActor implements PetActor {
  readonly kind = "fallback" as const;
  readonly view = new Container();
  private readonly root = new Graphics();
  private readonly sparks: Spark[] = [];
  private readonly label: Text;
  private scaleValue = 1;
  private fitted: number | null = null;
  private baseline = { width: 420, height: 560 };
  private viewSize = { width: 0, height: 0 };
  private bounce = 0;
  private time = 0;
  private blink = 1;
  private nextBlink = 2.4;
  private bounds = { x: 0, y: 0, width: 220, height: 340 };

  constructor() {
    this.view.addChild(this.root);
    this.label = new Text(
      "NORI",
      new TextStyle({
        fontFamily: "Segoe UI, Microsoft YaHei, sans-serif",
        fontSize: 11,
        fill: 0xb7c4d6,
        letterSpacing: 2,
      }),
    );
    this.label.anchor.set(0.5, 0);
    this.view.addChild(this.label);
  }

  async playClips(): Promise<boolean> {
    return false;
  }

  isPlayingMotion(): boolean {
    return false;
  }

  lastMotionSource(): "file" | "params" {
    return "params";
  }

  setScale(scale: number): void {
    this.scaleValue = scale;
    this.applyLayout();
  }

  setBaseline(fullWidth: number, fullHeight: number): void {
    if (fullWidth > 0 && fullHeight > 0) {
      this.baseline = { width: fullWidth, height: fullHeight };
    }
    this.applyLayout();
  }

  layout(width: number, height: number): void {
    this.viewSize = { width, height };
    this.label.position.set(0, 168);
    this.applyLayout();
  }

  private applyLayout(): void {
    const { width } = this.viewSize;
    this.fitted = lockFullBodyFitted(
      this.fitted,
      FALLBACK_NATURAL.width,
      FALLBACK_NATURAL.height,
      this.baseline.width,
      this.baseline.height,
    );
    const fitted = this.fitted > 0 ? this.fitted : 1;
    this.view.scale.set(visualScale(fitted, this.scaleValue));
    if (width <= 0) return;
    const home = bottomPinFromLocalBottom(
      width,
      this.viewSize.height,
      FALLBACK_LOCAL_BOTTOM,
      fitted,
      this.scaleValue,
      this.baseline.height,
    );
    this.view.position.set(home.x, home.y);
  }

  hitTest(x: number, y: number): HitZone {
    const local = this.view.toLocal({ x, y });
    const localZone = fallbackHitZone(local.x, local.y);
    if (localZone === "empty") return "empty";
    return refineVisibleZone(localZone, x, y, this.root.getBounds());
  }

  contains(x: number, y: number): boolean {
    return this.hitTest(x, y) !== "empty";
  }

  getBounds() {
    return this.bounds;
  }

  update(
    dt: number,
    look: LookState,
    params: ExpressionParams,
    motion: { nod: number; tilt: number; bounce: number; sway: number; sparkle: number },
  ): void {
    this.time += dt;
    this.bounce = motion.bounce;
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blink = 0;
      this.nextBlink = 2.8 + Math.random() * 2.5;
    }
    this.blink = Math.min(1, this.blink + dt * 8);

    if (motion.sparkle > 0.5 && Math.random() < dt * 10) {
      this.spawnSpark();
    }
    try {
      this.draw(look, params, motion);
    } catch (error) {
      console.warn("[nori] fallback draw skipped", error);
    }
    this.updateSparks(dt);
  }

  private spawnSpark(): void {
    const g = new Graphics();
    g.beginFill(0xfff3a1);
    drawSpark(g, 0, 0, 6);
    g.endFill();
    const spark: Spark = {
      g,
      life: 0.7,
      x: (Math.random() - 0.5) * 90,
      y: -150 + Math.random() * 40,
      vx: (Math.random() - 0.5) * 40,
      vy: -30 - Math.random() * 40,
    };
    this.view.addChild(g);
    this.sparks.push(spark);
  }

  private updateSparks(dt: number): void {
    for (let i = this.sparks.length - 1; i >= 0; i -= 1) {
      const spark = this.sparks[i]!;
      spark.life -= dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.g.position.set(spark.x, spark.y);
      spark.g.alpha = Math.max(0, spark.life / 0.7);
      spark.g.scale.set(0.7 + spark.life);
      if (spark.life <= 0) {
        this.view.removeChild(spark.g);
        spark.g.destroy();
        this.sparks.splice(i, 1);
      }
    }
  }

  private draw(
    look: LookState,
    params: ExpressionParams,
    motion: { nod: number; tilt: number; bounce: number; sway: number; sparkle: number },
  ): void {
    const g = this.root;
    g.clear();

    const breath = 1 + Math.sin(this.time * 1.6) * 0.012 + (params.ParamBreath ?? 0) * 0.01;
    const tilt = look.angleZ + motion.tilt + (params.ParamAngleZ ?? 0);
    const nod = look.angleY + motion.nod + (params.ParamAngleY ?? 0);
    const sway = look.bodyX + motion.sway;
    const cheek = Math.min(1, (params.ParamCheek ?? 0) * 1.35);
    const smile = Math.max(params.ParamEyeLSmile ?? 0, params.ParamMouthForm ?? 0);
    const mouthOpen = params.ParamMouthOpenY ?? 0;
    const eyeOpen = Math.max(0.12, (params.ParamEyeLOpen ?? 1) * this.blink);

    this.view.rotation = (tilt * Math.PI) / 180;
    this.view.pivot.set(0, 20);

    const yOff = -motion.bounce - nod * 0.35;

    // shadow
    g.beginFill(0x000000, 0.18);
    g.drawEllipse(sway * 0.15, 156, 62 * breath, 14);
    g.endFill();

    // body
    g.beginFill(0xff8b7a);
    g.drawRoundedRect(-46 + sway * 0.15, 18 + yOff, 92, 118, 36);
    g.endFill();
    g.beginFill(0xffc7b8);
    g.drawRoundedRect(-28 + sway * 0.1, 38 + yOff, 56, 58, 20);
    g.endFill();

    // scarf knot
    g.beginFill(0xff6b7a);
    g.drawCircle(-6, 28 + yOff, 8);
    g.drawCircle(10, 30 + yOff, 7);
    g.endFill();

    // head
    const hx = look.angleX * 0.35 + sway * 0.08;
    const hy = -88 + yOff + nod * 0.2;
    g.beginFill(0x4fd6c0);
    g.drawEllipse(hx, hy - 18, 86, 78);
    g.endFill();
    g.beginFill(0xffe8d4);
    g.drawCircle(hx, hy + 8, 62);
    g.endFill();

    // hair bangs
    g.beginFill(0x3ec9b3);
    g.drawEllipse(hx - 28, hy - 18, 24, 18);
    g.drawEllipse(hx + 26, hy - 16, 22, 16);
    g.drawEllipse(hx, hy - 36, 38, 20);
    g.endFill();

    // ears / tufts
    g.beginFill(0x4fd6c0);
    g.drawEllipse(hx - 58, hy - 28, 16, 22);
    g.drawEllipse(hx + 58, hy - 28, 16, 22);
    g.endFill();
    g.beginFill(0xffc1d6);
    g.drawEllipse(hx - 58, hy - 24, 8, 12);
    g.drawEllipse(hx + 58, hy - 24, 8, 12);
    g.endFill();

    // blush
    if (cheek > 0.05) {
      g.beginFill(0xff7d8f, 0.28 + cheek * 0.55);
      g.drawEllipse(hx - 30, hy + 22, 14 + cheek * 4, 8);
      g.drawEllipse(hx + 30, hy + 22, 14 + cheek * 4, 8);
      g.endFill();
    }

    // eyes
    const eyeY = hy + 2;
    const eyeX = look.eyeX * 7;
    const eyeYOff = -look.eyeY * 5;
    const eyeH = 13 * eyeOpen;
    drawEye(g, hx - 22 + eyeX, eyeY + eyeYOff, 9, eyeH, smile);
    drawEye(g, hx + 22 + eyeX, eyeY + eyeYOff, 9, eyeH, smile);

    // mouth
    g.lineStyle(3, 0xc26a6a, 1);
    const mx = hx;
    const my = hy + 32;
    if (mouthOpen > 0.2) {
      g.beginFill(0xc26a6a, 0.85);
      g.drawEllipse(mx, my + 2, 8 + mouthOpen * 6, 5 + mouthOpen * 8);
      g.endFill();
    } else if (smile > 0.25) {
      g.moveTo(mx - 10, my);
      g.quadraticCurveTo(mx, my + 8 + smile * 4, mx + 10, my);
    } else {
      g.moveTo(mx - 6, my);
      g.quadraticCurveTo(mx, my + 2, mx + 6, my);
    }
    g.lineStyle(0);

    // sparkle marks
    if (motion.sparkle > 0.4) {
      g.beginFill(0xfff4b0);
      drawSpark(g, hx + 48, hy - 40, 8);
      drawSpark(g, hx - 50, hy - 20, 6);
      g.endFill();
    }
  }
}

function drawSpark(g: Graphics, x: number, y: number, radius: number): void {
  const points: number[] = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI / 2) * -1 + (i * Math.PI) / 4;
    const r = i % 2 === 0 ? radius : radius * 0.38;
    points.push(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  g.drawPolygon(points);
}

function drawEye(g: Graphics, x: number, y: number, w: number, h: number, smile: number): void {
  if (smile > 0.55) {
    g.lineStyle(3.4, 0x2a3140, 1);
    g.moveTo(x - w, y);
    g.quadraticCurveTo(x, y + 8, x + w, y);
    g.lineStyle(0);
    return;
  }
  g.beginFill(0x2a3140);
  g.drawEllipse(x, y, w, Math.max(2.2, h));
  g.endFill();
  g.beginFill(0xffffff);
  g.drawCircle(x - 2.5, y - 3, 2.4);
  g.endFill();
}
