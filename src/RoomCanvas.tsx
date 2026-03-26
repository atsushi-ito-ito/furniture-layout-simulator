import React, { useRef, useState, useLayoutEffect, useEffect } from "react";
import type { FurnitureMaster, PlacedFurniture, Room, Measurement, ActiveTool, MeasureType } from "./App";
import { mmToPx, pxToMm } from "./App";

/* --------------------------------------------------
   間取り画像をまとめて読み込む
-------------------------------------------------- */
import floorplanA from "./assets/floorplan_A.svg";
import floorplanB from "./assets/floorplan_B.svg";
import floorplanC from "./assets/floorplan_C.svg";
import floorplanD from "./assets/floorplan_D.svg";
import floorplanE from "./assets/floorplan_E.svg";
import floorplanF from "./assets/floorplan_F.svg";
import floorplanG from "./assets/floorplan_G.svg";
import floorplanH from "./assets/floorplan_H.svg";

const FLOORPLAN_IMAGES: Record<string, string> = {
  A: floorplanA,
  B: floorplanB,
  C: floorplanC,
  D: floorplanD,
  E: floorplanE,
  F: floorplanF,
  G: floorplanG,
  H: floorplanH,
};

/* --------------------------------------------------
   Props
-------------------------------------------------- */
type Props = {
  room: Room;
  planId: string;
  masters: FurnitureMaster[];
  placed: PlacedFurniture[];
  zoom: number;
  minZoom: number;
  maxZoom: number;
  step: number;
  onZoomChange: (z: number) => void;
  onMove: (id: string, xMm: number, yMm: number) => void;
  onRotate: (id: string) => void;
  onRemove: (id: string) => void;

  // サイズ変更用
  onResize: (id: string, widthMm: number, heightMm: number) => void;

  // 計測ツール
  measurements: Measurement[];
  activeTool: ActiveTool;
  wallSnapEnabled: boolean;
  fineMode: boolean;
  onMeasurementAdd: (m: Measurement) => void;
  onMeasurementRemove: (id: string) => void;
  showTraffic: boolean;
};

type DragState =
  | {
      type: "pan";
      startMouseX: number;
      startMouseY: number;
      startPanX: number;
      startPanY: number;
    }
  | {
      type: "furniture";
      id: string;
      offsetX: number;
      offsetY: number;
    }
  | null;

type ControllerProps = {
  masters: FurnitureMaster[];
  placed: PlacedFurniture[];
  selectedId: string | null;
  onRotate: (id: string) => void;
  onRemove: (id: string) => void;
  onResize: (id: string, widthMm: number, heightMm: number) => void;
};

/* --------------------------------------------------
   メインコンポーネント
-------------------------------------------------- */
export const RoomCanvas: React.FC<Props> = ({
  room,
  planId,
  masters,
  placed,
  zoom,
  minZoom,
  maxZoom,
  step,
  onZoomChange,
  onMove,
  onRotate,
  onRemove,
  onResize,
  measurements,
  activeTool,
  wallSnapEnabled,
  fineMode,
  onMeasurementAdd,
  onMeasurementRemove,
  showTraffic,
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<DragState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hasInteractedRef = useRef(false);
  const pinchDistRef = useRef<number>(0);

  // 計測ツール ローカルステート
  const [placing, setPlacing]      = useState<{ x1Mm: number; y1Mm: number; snapped: boolean } | null>(null);
  const [previewEnd, setPreviewEnd] = useState<{ xMm: number; yMm: number; snapped: boolean } | null>(null);

  // 動線キャンバス
  const trafficCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // ─── 壁スナップ用 ───
  const wallPixelsRef  = useRef<Set<number>>(new Set());
  const wallCanvasWRef = useRef<number>(0);
  const wallCanvasHRef = useRef<number>(0);
  const WALL_CANVAS_SCALE = 2;   // 2倍精度でオフスクリーンレンダリング
  const SNAP_SCREEN_PX    = 20;  // スナップ検出半径（スクリーンpx）

  /** 壁ピクセルへのスナップを試みる（計測ツール用・1点） */
  const snapToWall = (xMm: number, yMm: number): { xMm: number; yMm: number; snapped: boolean } => {
    const canvasW    = wallCanvasWRef.current;
    const canvasH    = wallCanvasHRef.current;
    const wallPixels = wallPixelsRef.current;
    if (wallPixels.size === 0 || canvasW === 0) return { xMm, yMm, snapped: false };

    const threshPx = Math.ceil((SNAP_SCREEN_PX / zoom) * WALL_CANVAS_SCALE);
    const cx = Math.round(mmToPx(xMm) * WALL_CANVAS_SCALE);
    const cy = Math.round(mmToPx(yMm) * WALL_CANVAS_SCALE);

    let bestDist = threshPx + 1;
    let bestCx = cx, bestCy = cy;

    for (let dy = -threshPx; dy <= threshPx; dy++) {
      for (let dx = -threshPx; dx <= threshPx; dx++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= canvasW || ny >= canvasH) continue;
        if (!wallPixels.has(ny * canvasW + nx)) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) { bestDist = dist; bestCx = nx; bestCy = ny; }
      }
    }
    if (bestDist <= threshPx) {
      return { xMm: pxToMm(bestCx / WALL_CANVAS_SCALE), yMm: pxToMm(bestCy / WALL_CANVAS_SCALE), snapped: true };
    }
    return { xMm, yMm, snapped: false };
  };

  /** 配置済み家具へのスナップ（計測ツール用：4隅＋4辺中点） */
  const snapToFurniture = (xMm: number, yMm: number): { xMm: number; yMm: number; snapped: boolean } => {
    const threshMm = pxToMm(SNAP_SCREEN_PX / zoom);
    let bestDist = threshMm + 1;
    let bestX = xMm, bestY = yMm;

    for (const f of placed) {
      const m = masters.find((mm) => mm.id === f.masterId);
      const wMm = f.widthMm ?? m?.widthMm ?? 0;
      const hMm = f.heightMm ?? m?.heightMm ?? 0;
      const snapPts = [
        { x: f.xMm,           y: f.yMm },
        { x: f.xMm + wMm,     y: f.yMm },
        { x: f.xMm,           y: f.yMm + hMm },
        { x: f.xMm + wMm,     y: f.yMm + hMm },
        { x: f.xMm + wMm / 2, y: f.yMm },
        { x: f.xMm + wMm / 2, y: f.yMm + hMm },
        { x: f.xMm,           y: f.yMm + hMm / 2 },
        { x: f.xMm + wMm,     y: f.yMm + hMm / 2 },
      ];
      for (const pt of snapPts) {
        const dist = Math.sqrt((xMm - pt.x) ** 2 + (yMm - pt.y) ** 2);
        if (dist < bestDist) { bestDist = dist; bestX = pt.x; bestY = pt.y; }
      }
    }
    if (bestDist <= threshMm) return { xMm: bestX, yMm: bestY, snapped: true };
    return { xMm, yMm, snapped: false };
  };

  /**
   * 家具の壁スナップ
   * 4コーナー＋4辺中点を検査し、最も近い壁ピクセルへスナップ。
   * スナップした点が家具上の位置を保ちつつ、家具全体を移動させる。
   */
  const snapFurnitureToWall = (
    xMm: number, yMm: number,   // 家具の左上(top-left)位置
    wMm: number, hMm: number,   // 家具サイズ（軸合わせ）
  ): { xMm: number; yMm: number; snapped: boolean } => {
    const canvasW    = wallCanvasWRef.current;
    const canvasH    = wallCanvasHRef.current;
    const wallPixels = wallPixelsRef.current;
    if (wallPixels.size === 0 || canvasW === 0) return { xMm, yMm, snapped: false };

    // 検査点: [家具上の実座標, top-leftからのオフセット]
    // オフセット = 検査点 - top-left → スナップ後 top-left = snapPoint - offset
    const pts = [
      { px: xMm,          py: yMm,          ox: 0,        oy: 0 },        // 左上
      { px: xMm + wMm,    py: yMm,          ox: wMm,      oy: 0 },        // 右上
      { px: xMm,          py: yMm + hMm,    ox: 0,        oy: hMm },      // 左下
      { px: xMm + wMm,    py: yMm + hMm,    ox: wMm,      oy: hMm },      // 右下
      { px: xMm + wMm/2,  py: yMm,          ox: wMm/2,    oy: 0 },        // 上辺中点
      { px: xMm + wMm/2,  py: yMm + hMm,    ox: wMm/2,    oy: hMm },      // 下辺中点
      { px: xMm,          py: yMm + hMm/2,  ox: 0,        oy: hMm/2 },    // 左辺中点
      { px: xMm + wMm,    py: yMm + hMm/2,  ox: wMm,      oy: hMm/2 },    // 右辺中点
    ];

    const threshPx = Math.ceil((SNAP_SCREEN_PX / zoom) * WALL_CANVAS_SCALE);
    let bestDist = threshPx + 1;
    let bestNewX = xMm, bestNewY = yMm;

    for (const pt of pts) {
      const cx = Math.round(mmToPx(pt.px) * WALL_CANVAS_SCALE);
      const cy = Math.round(mmToPx(pt.py) * WALL_CANVAS_SCALE);
      for (let dy = -threshPx; dy <= threshPx; dy++) {
        for (let dx = -threshPx; dx <= threshPx; dx++) {
          const nx = cx + dx; const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= canvasW || ny >= canvasH) continue;
          if (!wallPixels.has(ny * canvasW + nx)) continue;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < bestDist) {
            bestDist = dist;
            // スナップ先 mm 座標 → top-left を逆算
            bestNewX = pxToMm(nx / WALL_CANVAS_SCALE) - pt.ox;
            bestNewY = pxToMm(ny / WALL_CANVAS_SCALE) - pt.oy;
          }
        }
      }
    }

    if (bestDist <= threshPx) return { xMm: bestNewX, yMm: bestNewY, snapped: true };
    return { xMm, yMm, snapped: false };
  };

  // スナップ（10mm グリッド）— fineMode の時はグリッドスナップしない
  const SNAP_MM = 10;
  const snapMm = (v: number) => !fineMode ? Math.round(v / SNAP_MM) * SNAP_MM : v;

  // 座標 → room mm 変換（マウス・タッチ共通）
  // 優先順位: 壁スナップ → 家具スナップ → 1mmモードならそのまま / それ以外は10mmグリッド
  const coordsToRoomMm = (clientX: number, clientY: number): { xMm: number; yMm: number; snapped: boolean } | null => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const localX = (clientX - rect.left - pan.x) / zoom;
    const localY = (clientY - rect.top  - pan.y) / zoom;
    const rawXMm = pxToMm(localX);
    const rawYMm = pxToMm(localY);

    if (wallSnapEnabled) {
      const wall = snapToWall(rawXMm, rawYMm);
      if (wall.snapped) return wall;
      const furn = snapToFurniture(rawXMm, rawYMm);
      if (furn.snapped) return furn;
    }
    return { xMm: snapMm(rawXMm), yMm: snapMm(rawYMm), snapped: false };
  };

  const toRoomMm = (e: React.MouseEvent): { xMm: number; yMm: number; snapped: boolean } | null => {
    return coordsToRoomMm(e.clientX, e.clientY);
  };

  // ツール切り替え時に途中計測をキャンセル
  useEffect(() => {
    setPlacing(null);
    setPreviewEnd(null);
  }, [activeTool]);

  // Escape でキャンセル
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPlacing(null); setPreviewEnd(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ★ 先に定義（useLayoutEffectで参照するため）
  const roomW = mmToPx(room.widthMm);
  const roomH = mmToPx(room.heightMm);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    // ユーザーがパン/ズーム等で触った後は、勝手にセンタリングしない
    if (hasInteractedRef.current) return;

    const rect = el.getBoundingClientRect();
    const vw = rect.width;
    const vh = rect.height;

    // roomW/roomH は「ズーム前」のpx、表示は roomW*zoom / roomH*zoom
    const nextX = (vw - roomW * zoom) / 2;
    const nextY = (vh - roomH * zoom) / 2;

    setPan({ x: nextX, y: nextY });
  }, [roomW, roomH, zoom]);

  // planId に応じて画像を選択
  const floorplanImg = FLOORPLAN_IMAGES[planId] ?? FLOORPLAN_IMAGES["A"];

  // ─── 動線ヒートマップ描画 ───
  useEffect(() => {
    const canvas = trafficCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!showTraffic) return;

    const GRID_MM = 100;
    const cellPx  = mmToPx(GRID_MM);
    const r       = cellPx * 0.40;

    const canvasW    = wallCanvasWRef.current;
    const canvasH    = wallCanvasHRef.current;
    const wallPixels = wallPixelsRef.current;

    for (let yMm = GRID_MM / 2; yMm < room.heightMm; yMm += GRID_MM) {
      for (let xMm = GRID_MM / 2; xMm < room.widthMm; xMm += GRID_MM) {
        if (canvasW > 0) {
          const wx = Math.round(mmToPx(xMm) * WALL_CANVAS_SCALE);
          const wy = Math.round(mmToPx(yMm) * WALL_CANVAS_SCALE);
          if (wx >= 0 && wy >= 0 && wx < canvasW && wy < canvasH &&
              wallPixels.has(wy * canvasW + wx)) continue;
        }
        let inside = false;
        for (const f of placed) {
          const m   = masters.find((mm) => mm.id === f.masterId);
          const wMm = f.widthMm  ?? m?.widthMm  ?? 0;
          const hMm = f.heightMm ?? m?.heightMm ?? 0;
          if (xMm >= f.xMm && xMm <= f.xMm + wMm &&
              yMm >= f.yMm && yMm <= f.yMm + hMm) { inside = true; break; }
        }
        if (inside) continue;

        let minDist = Math.min(xMm, yMm, room.widthMm - xMm, room.heightMm - yMm);
        for (const f of placed) {
          const m   = masters.find((mm) => mm.id === f.masterId);
          const wMm = f.widthMm  ?? m?.widthMm  ?? 0;
          const hMm = f.heightMm ?? m?.heightMm ?? 0;
          const dx  = Math.max(f.xMm - xMm, 0, xMm - (f.xMm + wMm));
          const dy  = Math.max(f.yMm - yMm, 0, yMm - (f.yMm + hMm));
          minDist   = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
        }

        let color: string;
        if      (minDist >= 900) color = "rgba(34,197,94,0.55)";
        else if (minDist >= 600) color = "rgba(251,191,36,0.60)";
        else                     color = "rgba(239,68,68,0.55)";

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(mmToPx(xMm), mmToPx(yMm), r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [showTraffic, placed, room, masters, roomW, roomH]);

  // 間取り画像が変わったらダークピクセル（壁）を抽出
  useEffect(() => {
    wallPixelsRef.current  = new Set();
    wallCanvasWRef.current = 0;
    wallCanvasHRef.current = 0;

    const canvasW = Math.round(roomW * WALL_CANVAS_SCALE);
    const canvasH = Math.round(roomH * WALL_CANVAS_SCALE);

    const canvas  = document.createElement("canvas");
    canvas.width  = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      ctx.drawImage(img, 0, 0, canvasW, canvasH);
      try {
        const { data } = ctx.getImageData(0, 0, canvasW, canvasH);
        const pixels = new Set<number>();
        for (let i = 0; i < data.length; i += 4) {
          // R,G,B が暗く、不透明なピクセル → 壁
          if (data[i] < 80 && data[i + 1] < 80 && data[i + 2] < 80 && data[i + 3] > 128) {
            pixels.add(i / 4);
          }
        }
        wallPixelsRef.current  = pixels;
        wallCanvasWRef.current = canvasW;
        wallCanvasHRef.current = canvasH;
      } catch {
        // CORS/taint エラー → グリッドスナップにフォールバック
      }
    };
    img.src = floorplanImg;
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorplanImg, roomW, roomH]);

  /* ズーム（ホイール） */
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    hasInteractedRef.current = true;

    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const oldZoom = zoom;
    let newZoom = zoom;

    if (e.deltaY < 0) {
      newZoom = Math.min(maxZoom, zoom + step);
    } else {
      newZoom = Math.max(minZoom, zoom - step);
    }

    if (newZoom === oldZoom) return;

    const scale = newZoom / oldZoom;

    setPan((prev) => {
      const newPanX = mouseX - (mouseX - prev.x) * scale;
      const newPanY = mouseY - (mouseY - prev.y) * scale;
      return { x: newPanX, y: newPanY };
    });

    onZoomChange(newZoom);
  };

  /* パン（背景ドラッグ） / 計測クリック */
  const handleViewportMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    hasInteractedRef.current = true;

    // ─── 計測モード ───
    if (activeTool !== "select") {
      const pos = toRoomMm(e);
      if (!pos) return;

      if (!placing) {
        // 1点目を置く
        setPlacing({ x1Mm: pos.xMm, y1Mm: pos.yMm, snapped: pos.snapped });
        setPreviewEnd(pos);
      } else {
        // 2点目で計測確定
        let x2Mm = pos.xMm;
        let y2Mm = pos.yMm;
        if (activeTool === "measure-h") y2Mm = placing.y1Mm; // 水平固定
        if (activeTool === "measure-v") x2Mm = placing.x1Mm; // 垂直固定

        const type: MeasureType =
          activeTool === "measure-h" ? "h" :
          activeTool === "measure-v" ? "v" : "free";

        onMeasurementAdd({
          id: crypto.randomUUID(),
          type,
          x1Mm: placing.x1Mm, y1Mm: placing.y1Mm,
          x2Mm, y2Mm,
        });
        setPlacing(null);
        setPreviewEnd(null);
      }
      return;
    }

    // ─── 通常：パン ───
    setSelectedId(null);
    setDrag({
      type: "pan",
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    });
  };

  /* 家具ドラッグ開始 */
  const handleFurnitureMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    id: string
  ) => {
    // 計測モード中は家具ドラッグ無効
    if (activeTool !== "select") return;
    e.stopPropagation();
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;

    const f = placed.find((p) => p.id === id);
    if (!f) return;

    const xPx = mmToPx(f.xMm) * zoom + pan.x;
    const yPx = mmToPx(f.yMm) * zoom + pan.y;

    setDrag({
      type: "furniture",
      id,
      offsetX: e.clientX - xPx,
      offsetY: e.clientY - yPx,
    });

    setSelectedId(id);
  };

  /* マウス移動 */
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // 計測プレビュー更新
    if (activeTool !== "select" && placing) {
      const pos = toRoomMm(e);
      if (pos) setPreviewEnd(pos);
      // dragはしないのでreturn（パンは行わない）
      return;
    }

    if (!drag) return;

    if (drag.type === "pan") {
      const dx = e.clientX - drag.startMouseX;
      const dy = e.clientY - drag.startMouseY;
      setPan({
        x: drag.startPanX + dx,
        y: drag.startPanY + dy,
      });
      return;
    }

    if (drag.type === "furniture") {
      const f = placed.find((p) => p.id === drag.id);
      if (!f) return;

      const screenX = e.clientX - drag.offsetX;
      const screenY = e.clientY - drag.offsetY;

      const localX = (screenX - pan.x) / zoom;
      const localY = (screenY - pan.y) / zoom;

      let xMm = pxToMm(localX);
      let yMm = pxToMm(localY);

      if (wallSnapEnabled) {
        const m = masters.find((mm) => mm.id === f.masterId);
        const wMm = f.widthMm ?? m?.widthMm ?? 0;
        const hMm = f.heightMm ?? m?.heightMm ?? 0;
        const wall = snapFurnitureToWall(xMm, yMm, wMm, hMm);
        if (wall.snapped) {
          xMm = wall.xMm;
          yMm = wall.yMm;
        } else {
          xMm = snapMm(xMm);
          yMm = snapMm(yMm);
        }
      } else {
        xMm = snapMm(xMm);
        yMm = snapMm(yMm);
      }

      onMove(f.id, xMm, yMm);
    }
  };

  const handleMouseUpLeave = () => setDrag(null);

  /* ─── タッチイベント（iPad 対応） ─── */

  /** タッチ開始：計測の1点目／2点目確定、パン開始、ピンチ開始 */
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    hasInteractedRef.current = true;
    const touches = Array.from(e.touches);

    if (touches.length === 2) {
      // ピンチズーム開始
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      pinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
      setDrag(null);
      return;
    }

    if (touches.length === 1) {
      const touch = touches[0];

      if (activeTool !== "select") {
        // 計測モード：タップで点を置く
        const pos = coordsToRoomMm(touch.clientX, touch.clientY);
        if (!pos) return;

        if (!placing) {
          setPlacing({ x1Mm: pos.xMm, y1Mm: pos.yMm, snapped: pos.snapped });
          setPreviewEnd(pos);
        } else {
          let x2Mm = pos.xMm;
          let y2Mm = pos.yMm;
          if (activeTool === "measure-h") y2Mm = placing.y1Mm;
          if (activeTool === "measure-v") x2Mm = placing.x1Mm;
          const type: MeasureType =
            activeTool === "measure-h" ? "h" :
            activeTool === "measure-v" ? "v" : "free";
          onMeasurementAdd({
            id: crypto.randomUUID(),
            type,
            x1Mm: placing.x1Mm, y1Mm: placing.y1Mm,
            x2Mm, y2Mm,
          });
          setPlacing(null);
          setPreviewEnd(null);
        }
        return;
      }

      // 選択モード：パン開始
      setSelectedId(null);
      setDrag({
        type: "pan",
        startMouseX: touch.clientX,
        startMouseY: touch.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      });
    }
  };

  /** タッチ移動：計測プレビュー、パン、ピンチズーム、家具ドラッグ */
  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const touches = Array.from(e.touches);

    if (touches.length === 2) {
      // ピンチズーム
      const dx = touches[1].clientX - touches[0].clientX;
      const dy = touches[1].clientY - touches[0].clientY;
      const newDist = Math.sqrt(dx * dx + dy * dy);
      const oldDist = pinchDistRef.current;
      if (oldDist > 0) {
        const rect = viewportRef.current?.getBoundingClientRect();
        if (rect) {
          const centerX = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
          const centerY = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
          const scaleFactor = newDist / oldDist;
          const newZoom = Math.min(maxZoom, Math.max(minZoom, zoom * scaleFactor));
          if (newZoom !== zoom) {
            const scale = newZoom / zoom;
            setPan((prev) => ({
              x: centerX - (centerX - prev.x) * scale,
              y: centerY - (centerY - prev.y) * scale,
            }));
            onZoomChange(newZoom);
          }
        }
      }
      pinchDistRef.current = newDist;
      return;
    }

    if (touches.length === 1) {
      const touch = touches[0];

      // 計測プレビュー
      if (activeTool !== "select" && placing) {
        const pos = coordsToRoomMm(touch.clientX, touch.clientY);
        if (pos) setPreviewEnd(pos);
        return;
      }

      if (!drag) return;

      if (drag.type === "pan") {
        const dx = touch.clientX - drag.startMouseX;
        const dy = touch.clientY - drag.startMouseY;
        setPan({ x: drag.startPanX + dx, y: drag.startPanY + dy });
        return;
      }

      if (drag.type === "furniture") {
        const f = placed.find((p) => p.id === drag.id);
        if (!f) return;
        const screenX = touch.clientX - drag.offsetX;
        const screenY = touch.clientY - drag.offsetY;
        const localX = (screenX - pan.x) / zoom;
        const localY = (screenY - pan.y) / zoom;
        let xMm = pxToMm(localX);
        let yMm = pxToMm(localY);
        if (wallSnapEnabled) {
          const m = masters.find((mm) => mm.id === f.masterId);
          const wMm = f.widthMm ?? m?.widthMm ?? 0;
          const hMm = f.heightMm ?? m?.heightMm ?? 0;
          const wall = snapFurnitureToWall(xMm, yMm, wMm, hMm);
          if (wall.snapped) { xMm = wall.xMm; yMm = wall.yMm; }
          else { xMm = snapMm(xMm); yMm = snapMm(yMm); }
        } else {
          xMm = snapMm(xMm);
          yMm = snapMm(yMm);
        }
        onMove(f.id, xMm, yMm);
      }
    }
  };

  /** タッチ終了：ドラッグ状態クリア */
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) pinchDistRef.current = 0;
    if (e.touches.length === 0) setDrag(null);
  };

  /** 家具タッチ開始：家具ドラッグ開始 */
  const handleFurnitureTouchStart = (
    e: React.TouchEvent<HTMLDivElement>,
    id: string
  ) => {
    if (activeTool !== "select") return;
    e.stopPropagation();
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const f = placed.find((p) => p.id === id);
    if (!f) return;
    const xPx = mmToPx(f.xMm) * zoom + pan.x;
    const yPx = mmToPx(f.yMm) * zoom + pan.y;
    setDrag({
      type: "furniture",
      id,
      offsetX: touch.clientX - xPx,
      offsetY: touch.clientY - yPx,
    });
    setSelectedId(id);
  };

  /* JSX */
  return (
    <div
      className="room-viewport"
      ref={viewportRef}
      onWheel={handleWheel}
      onMouseDown={handleViewportMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpLeave}
      onMouseLeave={handleMouseUpLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ cursor: activeTool !== "select" ? "crosshair" : undefined, touchAction: "none" }}
    >
      <div
        className="room-container"
        style={{
          width: roomW,
          height: roomH,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {/* 間取り画像 */}
        <img
          src={floorplanImg}
          alt={`floorplan-${planId}`}
          className="room-floorplan"
        />

        {/* ─── 動線ヒートマップ ─── */}
        <canvas
          ref={trafficCanvasRef}
          width={roomW}
          height={roomH}
          style={{
            position: "absolute",
            top: 0, left: 0,
            width: roomW,
            height: roomH,
            pointerEvents: "none",
            zIndex: 5,
          }}
        />

        {/* ─── 計測レイヤー（SVG） ─── */}
        <MeasurementLayer
          measurements={measurements}
          placing={placing}
          previewEnd={previewEnd}
          activeTool={activeTool}
          roomW={roomW}
          roomH={roomH}
          onRemove={onMeasurementRemove}
        />

        {placed.map((f) => {
          const m = masters.find((mm) => mm.id === f.masterId);
          if (!m) return null;

          const widthMm = f.widthMm ?? m.widthMm;
          const heightMm = f.heightMm ?? m.heightMm;

          const w = mmToPx(widthMm);
          const h = mmToPx(heightMm);

          const x = mmToPx(f.xMm);
          const y = mmToPx(f.yMm);

          return (
            <div
              key={f.id}
              className={`furniture-item${selectedId === f.id ? " selected" : ""}`}
              style={{
                width: w,
                height: h,
                // 中心を起点に回転：center へ移動 → 回転 → 元へ戻す
                transform: `translate(${x + w / 2}px, ${y + h / 2}px) rotate(${f.rotation}deg) translate(${-w / 2}px, ${-h / 2}px)`,
              }}
              onMouseDown={(e) => handleFurnitureMouseDown(e, f.id)}
              onTouchStart={(e) => handleFurnitureTouchStart(e, f.id)}
            >
              {m.img ? (
                <img
                  src={m.img}
                  alt={m.name}
                  className="furniture-img"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "fill",
                    pointerEvents: "none",
                  }}
                />
              ) : m.shape === "circle" ? (
                <div className="furniture-circle">
                  <span className="furniture-shape-label">
                    {widthMm} × {heightMm}
                  </span>
                </div>
              ) : (
                <div className="furniture-rect">
                  <span className="furniture-shape-label">
                    {widthMm} × {heightMm}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 右下コントローラ */}
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        <ControllerPanel
          masters={masters}
          placed={placed}
          selectedId={selectedId}
          onRotate={onRotate}
          onRemove={onRemove}
          onResize={onResize}
        />
      </div>
    </div>
  );
};

/* --------------------------------------------------
   Controller Panel
-------------------------------------------------- */
function ControllerPanel({
  masters,
  placed,
  selectedId,
  onRotate,
  onRemove,
  onResize,
}: ControllerProps) {
  const selectedFurniture = placed.find((p) => p.id === selectedId) || null;
  const selectedMaster =
    selectedFurniture && masters.find((m) => m.id === selectedFurniture.masterId);

  const disabled = !selectedFurniture || !selectedMaster;

  const masterWidthMm  = selectedMaster?.widthMm  ?? 0;
  const masterHeightMm = selectedMaster?.heightMm ?? 0;
  const currentWidthMm  = selectedFurniture?.widthMm  ?? masterWidthMm;
  const currentHeightMm = selectedFurniture?.heightMm ?? masterHeightMm;

  // ローカル入力値（タイプ中の中間値を保持）
  const [localWidth,  setLocalWidth]  = useState(currentWidthMm);
  const [localHeight, setLocalHeight] = useState(currentHeightMm);

  // 選択家具が変わったらローカル値を同期
  useEffect(() => {
    setLocalWidth(currentWidthMm);
    setLocalHeight(currentHeightMm);
  }, [selectedId, currentWidthMm, currentHeightMm]);

  const STEP = 10; // ±10mm ステップ

  /** 幅を確定して親に通知 */
  const commitWidth = (v: number) => {
    const clamped = Math.max(1, Math.round(v));
    setLocalWidth(clamped);
    if (selectedFurniture) onResize(selectedFurniture.id, clamped, localHeight || currentHeightMm);
  };

  /** 奥行を確定して親に通知 */
  const commitHeight = (v: number) => {
    const clamped = Math.max(1, Math.round(v));
    setLocalHeight(clamped);
    if (selectedFurniture) onResize(selectedFurniture.id, localWidth || currentWidthMm, clamped);
  };

  return (
    <div className="controller-panel">
      <div className="controller-header">
        <span className="controller-title">コントローラ</span>
        <span className="controller-status">
          {selectedMaster ? `選択中：${selectedMaster.name}` : "家具を選択してください"}
        </span>
      </div>

      {/* ─── サイズ編集 ─── */}
      <div className="controller-size-block">
        <div className="controller-size-label">サイズ（mm）</div>

        {/* 幅 */}
        <div className="controller-size-row">
          <span className="controller-size-row-label">幅</span>
          <div className="controller-size-input-group">
            <button
              className="size-step-btn"
              disabled={disabled}
              onClick={() => commitWidth(localWidth - STEP)}
              onMouseDown={(e) => e.stopPropagation()}
            >－</button>
            <input
              type="number"
              className="controller-size-input"
              value={localWidth}
              disabled={disabled}
              onChange={(e) => setLocalWidth(Number(e.target.value))}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v > 0) commitWidth(v);
                else setLocalWidth(currentWidthMm);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = Number((e.target as HTMLInputElement).value);
                  if (v > 0) commitWidth(v);
                  else setLocalWidth(currentWidthMm);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <button
              className="size-step-btn"
              disabled={disabled}
              onClick={() => commitWidth(localWidth + STEP)}
              onMouseDown={(e) => e.stopPropagation()}
            >＋</button>
          </div>
        </div>

        {/* 奥行 */}
        <div className="controller-size-row">
          <span className="controller-size-row-label">奥行</span>
          <div className="controller-size-input-group">
            <button
              className="size-step-btn"
              disabled={disabled}
              onClick={() => commitHeight(localHeight - STEP)}
              onMouseDown={(e) => e.stopPropagation()}
            >－</button>
            <input
              type="number"
              className="controller-size-input"
              value={localHeight}
              disabled={disabled}
              onChange={(e) => setLocalHeight(Number(e.target.value))}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v > 0) commitHeight(v);
                else setLocalHeight(currentHeightMm);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = Number((e.target as HTMLInputElement).value);
                  if (v > 0) commitHeight(v);
                  else setLocalHeight(currentHeightMm);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
            <button
              className="size-step-btn"
              disabled={disabled}
              onClick={() => commitHeight(localHeight + STEP)}
              onMouseDown={(e) => e.stopPropagation()}
            >＋</button>
          </div>
        </div>

        {/* 初期サイズに戻す */}
        <button
          className="controller-btn reset"
          disabled={disabled}
          style={{ marginTop: 4, fontSize: 10 }}
          onClick={() => {
            if (!selectedFurniture || !selectedMaster) return;
            setLocalWidth(masterWidthMm);
            setLocalHeight(masterHeightMm);
            onResize(selectedFurniture.id, masterWidthMm, masterHeightMm);
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          ↺ 初期サイズに戻す
        </button>
      </div>

      {/* ─── 回転 / 削除 ─── */}
      <div className="controller-buttons">
        <button
          className="controller-btn"
          disabled={disabled}
          onClick={() => {
            if (!selectedFurniture) return;
            onRotate(selectedFurniture.id);
          }}
        >
          ↻ 回転
        </button>
        <button
          className="controller-btn danger"
          disabled={disabled}
          onClick={() => {
            if (!selectedFurniture) return;
            onRemove(selectedFurniture.id);
          }}
        >
          ✕ 削除
        </button>
      </div>
    </div>
  );
}

/* ==================================================
   計測レイヤー（SVGオーバーレイ）
================================================== */

// SVG内の固定サイズ定数（room-px 単位）
const TICK_PX  = 10;  // 端点の垂直ティック半長
const FONT_PX  = 10;  // ラベルフォントサイズ
const BTN_R    = 7;   // 削除ボタン半径

type MeasurementLayerProps = {
  measurements: Measurement[];
  placing: { x1Mm: number; y1Mm: number; snapped: boolean } | null;
  previewEnd: { xMm: number; yMm: number; snapped: boolean } | null;
  activeTool: ActiveTool;
  roomW: number;
  roomH: number;
  onRemove: (id: string) => void;
};

function MeasurementLayer({
  measurements, placing, previewEnd, activeTool, roomW, roomH, onRemove,
}: MeasurementLayerProps) {
  // プレビューの終点（ツールに応じて水平/垂直固定）
  const px2Mm = placing && previewEnd
    ? (activeTool === "measure-v" ? placing.x1Mm : previewEnd.xMm)
    : 0;
  const py2Mm = placing && previewEnd
    ? (activeTool === "measure-h" ? placing.y1Mm : previewEnd.yMm)
    : 0;

  return (
    <svg
      style={{
        position: "absolute",
        top: 0, left: 0,
        width: roomW, height: roomH,
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {/* 確定済み計測線 */}
      {measurements.map((m) => (
        <MeasurementItem key={m.id} m={m} onRemove={onRemove} />
      ))}

      {/* 配置中のプレビュー */}
      {placing && previewEnd && (
        <MeasurementPreview
          x1Mm={placing.x1Mm} y1Mm={placing.y1Mm}
          x2Mm={px2Mm} y2Mm={py2Mm}
          startSnapped={placing.snapped}
          endSnapped={previewEnd.snapped}
        />
      )}
    </svg>
  );
}

/* --------------------------------------------------
   1本の確定計測線
-------------------------------------------------- */
function MeasurementItem({
  m, onRemove,
}: { m: Measurement; onRemove: (id: string) => void }) {
  const x1 = mmToPx(m.x1Mm);
  const y1 = mmToPx(m.y1Mm);
  const x2 = mmToPx(m.x2Mm);
  const y2 = mmToPx(m.y2Mm);

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);

  const distMm = Math.round(
    Math.sqrt((m.x2Mm - m.x1Mm) ** 2 + (m.y2Mm - m.y1Mm) ** 2)
  );

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  // 垂直方向単位ベクトル
  const perpX = len > 0 ? -dy / len : 0;
  const perpY = len > 0 ?  dx / len : 1;

  const label    = `${distMm} mm`;
  const labelW   = label.length * FONT_PX * 0.65 + 10;
  const labelH   = FONT_PX + 8;

  // 削除ボタン位置（終点の垂直方向オフセット）
  const btnX = x2 + perpX * (BTN_R * 2.2);
  const btnY = y2 + perpY * (BTN_R * 2.2);

  return (
    <g>
      {/* 寸法線（オレンジ破線） */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="#f97316" strokeWidth={1.5} strokeDasharray="6,3" />

      {/* 始点ティック */}
      <line
        x1={x1 + perpX * TICK_PX} y1={y1 + perpY * TICK_PX}
        x2={x1 - perpX * TICK_PX} y2={y1 - perpY * TICK_PX}
        stroke="#f97316" strokeWidth={1.5} />

      {/* 終点ティック */}
      <line
        x1={x2 + perpX * TICK_PX} y1={y2 + perpY * TICK_PX}
        x2={x2 - perpX * TICK_PX} y2={y2 - perpY * TICK_PX}
        stroke="#f97316" strokeWidth={1.5} />

      {/* 始点・終点マーカー */}
      <circle cx={x1} cy={y1} r={2.5} fill="#f97316" />
      <circle cx={x2} cy={y2} r={2.5} fill="#f97316" />

      {/* 距離ラベル背景 */}
      <rect
        x={midX - labelW / 2} y={midY - labelH / 2}
        width={labelW} height={labelH} rx={3}
        fill="rgba(255,255,255,0.93)" stroke="#f97316" strokeWidth={0.8}
      />

      {/* 距離ラベル文字 */}
      <text
        x={midX} y={midY + FONT_PX * 0.38}
        textAnchor="middle" fontSize={FONT_PX}
        fill="#c2410c" fontWeight="700"
        fontFamily="system-ui, -apple-system, sans-serif"
      >{label}</text>

      {/* 削除ボタン（ポインターイベント有効） */}
      <g style={{ pointerEvents: "all", cursor: "pointer" }}
        onClick={(e) => { e.stopPropagation(); onRemove(m.id); }}>
        <circle cx={btnX} cy={btnY} r={BTN_R}
          fill="white" stroke="#f97316" strokeWidth={1} />
        <text x={btnX} y={btnY + FONT_PX * 0.38}
          textAnchor="middle" fontSize={FONT_PX * 0.95}
          fill="#f97316" fontWeight="700"
          style={{ pointerEvents: "none" }}>×</text>
      </g>
    </g>
  );
}

/* --------------------------------------------------
   プレビュー（配置途中の仮表示）
-------------------------------------------------- */
function MeasurementPreview({
  x1Mm, y1Mm, x2Mm, y2Mm, startSnapped, endSnapped,
}: { x1Mm: number; y1Mm: number; x2Mm: number; y2Mm: number; startSnapped?: boolean; endSnapped?: boolean }) {
  const x1 = mmToPx(x1Mm);
  const y1 = mmToPx(y1Mm);
  const x2 = mmToPx(x2Mm);
  const y2 = mmToPx(y2Mm);

  const distMm = Math.round(
    Math.sqrt((x2Mm - x1Mm) ** 2 + (y2Mm - y1Mm) ** 2)
  );

  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  // スナップ時の色（緑）と通常色（オレンジ）
  const snapColor   = "#10b981";
  const normalColor = "#f97316";

  return (
    <g opacity={0.65}>
      {/* 仮計測線 */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={endSnapped ? snapColor : normalColor} strokeWidth={1.5} strokeDasharray="4,2" />

      {/* 始点（固定済み）*/}
      <circle cx={x1} cy={y1} r={4} fill={startSnapped ? snapColor : normalColor} />
      {startSnapped && (
        <circle cx={x1} cy={y1} r={9}
          fill="none" stroke={snapColor} strokeWidth={1.5} opacity={0.7} />
      )}

      {/* 終点（動的） */}
      <circle cx={x2} cy={y2} r={4}
        fill={endSnapped ? snapColor : "white"}
        stroke={endSnapped ? snapColor : normalColor} strokeWidth={1.5} />
      {endSnapped && (
        <circle cx={x2} cy={y2} r={9}
          fill="none" stroke={snapColor} strokeWidth={1.5} opacity={0.7} />
      )}

      {/* 仮距離ラベル */}
      {distMm > 0 && (
        <>
          <rect
            x={midX - 30} y={midY - (FONT_PX / 2 + 4)}
            width={60} height={FONT_PX + 8} rx={3}
            fill="rgba(255,255,255,0.9)" stroke="#f97316" strokeWidth={0.8}
          />
          <text x={midX} y={midY + FONT_PX * 0.38}
            textAnchor="middle" fontSize={FONT_PX}
            fill="#c2410c" fontWeight="700"
            fontFamily="system-ui, -apple-system, sans-serif"
          >{distMm} mm</text>
        </>
      )}
    </g>
  );
}
