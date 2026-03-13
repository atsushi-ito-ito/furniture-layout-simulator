import React, { useRef, useState, useLayoutEffect } from "react";
import type { FurnitureMaster, PlacedFurniture, Room } from "./App";
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
}) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<DragState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hasInteractedRef = useRef(false);

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

  /* パン（背景ドラッグ） */
  const handleViewportMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    hasInteractedRef.current = true;

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

      const xMm = pxToMm(localX);
      const yMm = pxToMm(localY);

      onMove(f.id, xMm, yMm);
    }
  };

  const handleMouseUpLeave = () => setDrag(null);

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
              className="furniture-item"
              style={{
                width: w,
                height: h,
                transform: `translate(${x}px, ${y}px) rotate(${f.rotation}deg)`,
              }}
              onMouseDown={(e) => handleFurnitureMouseDown(e, f.id)}
            >
              {m.img ? (
                <img
                  src={m.img}
                  alt={m.name}
                  className="furniture-img"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "fill", // 枠いっぱいに表示
                    pointerEvents: "none",
                  }}
                />
              ) : (
                <div className="furniture-rect">
                  <span className="furniture-rect-label">
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

  const currentWidthMm =
    (selectedFurniture?.widthMm ?? selectedMaster?.widthMm) ?? 0;
  const currentHeightMm =
    (selectedFurniture?.heightMm ?? selectedMaster?.heightMm) ?? 0;

  return (
    <div className="controller-panel">
      <div className="controller-header">
        <span className="controller-title">コントローラ</span>
        <span className="controller-status">
          {selectedMaster ? `選択中：${selectedMaster.name}` : "家具を選択してください"}
        </span>
      </div>

      {/* サイズ編集 */}
      <div className="controller-size-block">
        <div
          style={{
            fontSize: 11,
            marginBottom: 4,
            color: "#6b7280",
          }}
        >
          サイズ（mm）
        </div>
        <div
          style={{
            display: "flex",
            gap: 4,
            marginBottom: 4,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, marginBottom: 2 }}>幅</div>
            <input
              type="number"
              value={currentWidthMm}
              disabled={disabled}
              style={{ width: "100%", fontSize: 11, padding: "2px 4px" }}
              onChange={(e) => {
                if (!selectedFurniture || !selectedMaster) return;
                const v = Number(e.target.value) || 0;
                if (v <= 0) return;
                onResize(selectedFurniture.id, v, currentHeightMm);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, marginBottom: 2 }}>奥行</div>
            <input
              type="number"
              value={currentHeightMm}
              disabled={disabled}
              style={{ width: "100%", fontSize: 11, padding: "2px 4px" }}
              onChange={(e) => {
                if (!selectedFurniture || !selectedMaster) return;
                const v = Number(e.target.value) || 0;
                if (v <= 0) return;
                onResize(selectedFurniture.id, currentWidthMm, v);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      </div>

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
