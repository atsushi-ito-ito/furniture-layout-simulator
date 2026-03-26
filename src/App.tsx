import React, { useState } from "react";
import { RoomCanvas } from "./RoomCanvas";

/* ========== 家具画像のインポート ========== */

import sofa1pImg from "./assets/sofa_1p.svg";
import sofa2pImg from "./assets/sofa_2p.svg";
import sofa3pImg from "./assets/sofa_3p.svg";
import couchSofaImg from "./assets/couch_sofa.svg";
import diningChairImg from "./assets/dining_chair.svg";
import benchImg from "./assets/bench.svg";
import table1Img from "./assets/table_1.svg";
import table2Img from "./assets/table_2.svg";
import table3Img from "./assets/table_3.svg";
import table4Img from "./assets/table_4.svg";
import table5Img from "./assets/table_5.svg";
import diningSet1Img from "./assets/diningset_1.svg";
import diningSet2Img from "./assets/diningset_2.svg";
import deskSetImg from "./assets/deskset.svg";
import singleBedImg from "./assets/single_bed.svg";
import semiDoubleBedImg from "./assets/semi_double_bed.svg";
import doubleBedImg from "./assets/double_bed.svg";
import queenBedImg from "./assets/queen_bed.svg";
import kingBedImg from "./assets/king_bed.svg";
import tvBoardImg from "./assets/tv_board.svg";
import tv50Img from "./assets/tv.svg";

/* ======================
   型定義
====================== */

export type Room = {
  widthMm: number;
  heightMm: number;
};

/* ======================
   計測ツール型定義
====================== */
export type MeasureType = "h" | "v" | "free";

export type Measurement = {
  id: string;
  type: MeasureType;
  x1Mm: number;
  y1Mm: number;
  x2Mm: number;
  y2Mm: number;
};

export type ActiveTool = "select" | "measure-h" | "measure-v" | "measure-free";

export type FurnitureMaster = {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  category: "sofa" | "table" | "bed" | "other";
  img?: string;
  shape?: "rect" | "circle"; // img未使用時のカスタム形状
};

export type PlacedFurniture = {
  id: string;
  masterId: string;
  xMm: number;
  yMm: number;
  rotation: 0 | 90 | 180 | 270;

  // 家具ごとの個別サイズ（未設定ならマスタの値を使う）
  widthMm?: number;
  heightMm?: number;
};

type Floorplan = {
  id: string; // A〜H
  name: string;
  layout: string;
  area: string;
  widthMm: number;
  heightMm: number;
};

/* ======================
   スケール変換
====================== */

export const SCALE = 0.05; // 1mm = 0.05px

export function mmToPx(mm: number) {
  return mm * SCALE;
}

export function pxToMm(px: number) {
  return px / SCALE;
}

/* ======================
   間取りリスト（A〜H）
====================== */

const FLOORPLANS: Floorplan[] = [
  { id: "A", name: "Aタイプ", layout: "3LDK+2WIC", area: "81.84㎡", widthMm: 14849, heightMm: 20999 },
  { id: "B", name: "Bタイプ", layout: "3LDK+WIC",  area: "73.73㎡", widthMm: 14849, heightMm: 20999 },
  { id: "C", name: "Cタイプ", layout: "3LDK+2WIC", area: "73.73㎡", widthMm: 14849, heightMm: 20999 },
  { id: "D", name: "Dタイプ", layout: "3LDK+WIC",  area: "70.42㎡", widthMm: 14849, heightMm: 20999 },
  { id: "E", name: "Eタイプ", layout: "2LDK+WIC",  area: "62.32㎡", widthMm: 14849, heightMm: 20999 },
  { id: "F", name: "Fタイプ", layout: "3LDK+2WIC", area: "70.38㎡", widthMm: 14849, heightMm: 20999 },
  { id: "G", name: "Gタイプ", layout: "3LDK+2WIC", area: "80.58㎡", widthMm: 14849, heightMm: 20999 },
  { id: "H", name: "Hタイプ", layout: "4LDK+WIC",  area: "96.23㎡", widthMm: 14849, heightMm: 20999 },
];

/* ======================
   メイン App
====================== */

const App: React.FC = () => {
  // 現在選択中の間取り
  const [currentPlan, setCurrentPlan] = useState<Floorplan>(FLOORPLANS[0]);
  const [isPlanModalOpen, setPlanModalOpen] = useState(false);

  /* ========== 家具マスタ ========== */
  const [masters] = useState<FurnitureMaster[]>([
    // ソファ
    {
      id: "sofa-1p",
      name: "ソファ_1p",
      widthMm: 800,
      heightMm: 720,
      category: "sofa",
      img: sofa1pImg,
    },
    {
      id: "sofa-2p",
      name: "ソファ_2p",
      widthMm: 1300,
      heightMm: 720,
      category: "sofa",
      img: sofa2pImg,
    },
    {
      id: "sofa-3p",
      name: "ソファ_3p",
      widthMm: 2200,
      heightMm: 720,
      category: "sofa",
      img: sofa3pImg,
    },
    {
      id: "couch-sofa",
      name: "カウチソファ",
      widthMm: 2200,
      heightMm: 1280,
      category: "sofa",
      img: couchSofaImg,
    },

    // チェア・ベンチ
    {
      id: "dining-chair",
      name: "ダイニングチェア",
      widthMm: 560,
      heightMm: 560,
      category: "table",
      img: diningChairImg,
    },
    {
      id: "bench",
      name: "ベンチ",
      widthMm: 405,
      heightMm: 1000,
      category: "table",
      img: benchImg,
    },

    // 単体テーブル
    {
      id: "table-rect",
      name: "テーブル_長方形",
      widthMm: 500,
      heightMm: 1500,
      category: "table",
      img: table1Img,
    },
    {
      id: "table-round",
      name: "テーブル_丸",
      widthMm: 900,
      heightMm: 900,
      category: "table",
      img: table2Img,
    },
    {
      id: "table-oval",
      name: "テーブル_楕円",
      widthMm: 600,
      heightMm: 1700,
      category: "table",
      img: table3Img,
    },
    {
      id: "table-square",
      name: "テーブル_正方形",
      widthMm: 900,
      heightMm: 900,
      category: "table",
      img: table4Img,
    },
    {
      id: "table-fan",
      name: "テーブル_扇形",
      widthMm: 900,
      heightMm: 900,
      category: "table",
      img: table5Img,
    },

    // ダイニングセット & デスク
    {
      id: "diningset-2p",
      name: "ダイニングテーブルセット_2p",
      widthMm: 900,
      heightMm: 1600,
      category: "table",
      img: diningSet1Img,
    },
    {
      id: "diningset-4p",
      name: "ダイニングテーブルセット_4p",
      widthMm: 1200,
      heightMm: 1600,
      category: "table",
      img: diningSet2Img,
    },
    {
      id: "deskset",
      name: "デスクセット",
      widthMm: 1100,
      heightMm: 1300,
      category: "table",
      img: deskSetImg,
    },

    // ベッド
    {
      id: "bed-single",
      name: "シングルベッド",
      widthMm: 1000,
      heightMm: 1950,
      category: "bed",
      img: singleBedImg,
    },
    {
      id: "bed-semi-double",
      name: "セミダブルベッド",
      widthMm: 1200,
      heightMm: 1950,
      category: "bed",
      img: semiDoubleBedImg,
    },
    {
      id: "bed-double",
      name: "ダブルベッド",
      widthMm: 1400,
      heightMm: 1950,
      category: "bed",
      img: doubleBedImg,
    },
    {
      id: "bed-queen",
      name: "クイーンベッド",
      widthMm: 1600,
      heightMm: 1950,
      category: "bed",
      img: queenBedImg,
    },
    {
      id: "bed-king",
      name: "キングベッド",
      widthMm: 1800,
      heightMm: 1950,
      category: "bed",
      img: kingBedImg,
    },

    // TVまわり
    {
      id: "tv-board",
      name: "TVボード",
      widthMm: 400,
      heightMm: 1800,
      category: "other",
      img: tvBoardImg,
    },
    {
      id: "tv-50",
      name: "TV(50インチ)",
      widthMm: 310,
      heightMm: 1120,
      category: "other",
      img: tv50Img,
    },

    // フリーボックス（画像なし・任意サイズ変更用）
    {
      id: "free-rect",
      name: "フリーボックス（四角）",
      widthMm: 1000,
      heightMm: 1000,
      category: "other",
      shape: "rect",
    },
    {
      id: "free-circle",
      name: "フリーボックス（丸）",
      widthMm: 1000,
      heightMm: 1000,
      category: "other",
      shape: "circle",
    },
  ]);

  const [placed, setPlaced] = useState<PlacedFurniture[]>([]);

  // 計測ツール
  const [measurements,  setMeasurements] = useState<Measurement[]>([]);
  const [activeTool,      setActiveTool]     = useState<ActiveTool>("select");
  const [wallSnapEnabled, setWallSnapEnabled] = useState(true);
  const [fineMode,        setFineMode]        = useState(false);
  const [showTraffic,     setShowTraffic]     = useState(false);

  // ズーム
  const BASE_ZOOM = 3.0;
  const MIN_ZOOM = BASE_ZOOM * 0.2;  // 20%
const MAX_ZOOM = BASE_ZOOM * 5.0;  // 500%（必要なら調整）
const STEP = BASE_ZOOM * 0.05;     // 5%刻み
  const DEFAULT_PERCENT = 0.42;

  const [zoom, setZoom] = useState<number>(BASE_ZOOM * DEFAULT_PERCENT);

  const handleAddFurniture = (masterId: string) => {
    const master = masters.find((m) => m.id === masterId);
    if (!master) return;
    setPlaced((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        masterId,
        xMm: 500,
        yMm: 500,
        rotation: 0,
      },
    ]);
  };

  const handleMoveFurniture = (id: string, xMm: number, yMm: number) => {
    setPlaced((prev) =>
      prev.map((f) => (f.id === id ? { ...f, xMm, yMm } : f))
    );
  };

  const handleRotateFurniture = (id: string) => {
    setPlaced((prev) =>
      prev.map((f) =>
        f.id === id
          ? {
              ...f,
              rotation: ((f.rotation + 90) % 360) as 0 | 90 | 180 | 270,
            }
          : f
      )
    );
  };

  // ★ 個別家具のサイズ変更（mm）
  const handleResizeFurniture = (
    id: string,
    widthMm: number,
    heightMm: number
  ) => {
    setPlaced((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, widthMm, heightMm } : f
      )
    );
  };

  const handleRemoveFurniture = (id: string) => {
    setPlaced((prev) => prev.filter((f) => f.id !== id));
  };

  const handleAddMeasurement = (m: Measurement) => {
    setMeasurements((prev) => [...prev, m]);
  };
  const handleRemoveMeasurement = (id: string) => {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="layout-root">
      {/* 左：サイドバー */}
      <aside className="sidebar">
        {/* タイプ情報表示 */}
        <div className="plan-info">
          <div className="plan-type">{currentPlan.name}</div>
          <div className="plan-detail">
            <span className="plan-layout">{currentPlan.layout}</span>
            <span className="plan-area">{currentPlan.area}</span>
          </div>
        </div>

        {/* 間取り選択ボタン */}
        <button
          className="plan-select-btn"
          onClick={() => setPlanModalOpen(true)}
        >
          間取りを選択
        </button>

        {/* ─── 計測ツール ─── */}
        <div className="measure-section">
          <div className="measure-section-label">計測ツール</div>
          <div className="measure-tool-grid">
            <button
              className={`measure-tool-btn${activeTool === "select" ? " active" : ""}`}
              onClick={() => setActiveTool("select")}
              title="選択モード（家具の移動など）"
            >✦ 選択</button>
            <button
              className={`measure-tool-btn${activeTool === "measure-h" ? " active" : ""}`}
              onClick={() => setActiveTool("measure-h")}
              title="水平方向を計測"
            >↔ 水平</button>
            <button
              className={`measure-tool-btn${activeTool === "measure-v" ? " active" : ""}`}
              onClick={() => setActiveTool("measure-v")}
              title="垂直方向を計測"
            >↕ 垂直</button>
            <button
              className={`measure-tool-btn${activeTool === "measure-free" ? " active" : ""}`}
              onClick={() => setActiveTool("measure-free")}
              title="フリー方向（斜め含む）を計測"
            >⤡ フリー</button>
          </div>
          <label className="snap-toggle-label">
            <input
              type="checkbox"
              checked={wallSnapEnabled}
              onChange={(e) => setWallSnapEnabled(e.target.checked)}
            />
            <span>壁スナップ</span>
          </label>
          <label className="snap-toggle-label">
            <input
              type="checkbox"
              checked={fineMode}
              onChange={(e) => setFineMode(e.target.checked)}
            />
            <span>1mm単位計測</span>
          </label>
          {measurements.length > 0 && (
            <button
              className="clear-measure-btn"
              onClick={() => setMeasurements([])}
            >
              計測をすべて削除
            </button>
          )}
        </div>

        {/* ─── 動線表示 ─── */}
        <div className="measure-section">
          <div className="measure-section-label">動線チェック</div>
          <label className="snap-toggle-label">
            <input
              type="checkbox"
              checked={showTraffic}
              onChange={(e) => setShowTraffic(e.target.checked)}
            />
            動線表示
          </label>
          {showTraffic && (
            <div className="traffic-legend">
              <span className="traffic-legend-item green">●</span><span>余裕（900mm〜）</span>
              <span className="traffic-legend-item yellow">●</span><span>やや狭い（600〜900mm）</span>
              <span className="traffic-legend-item red">●</span><span>狭い（〜600mm）</span>
            </div>
          )}
        </div>

        <h2 className="sidebar-heading">家具リスト</h2>
        <ul className="furniture-list">
          {masters.map((m) => (
            <li key={m.id} className="furniture-list-item">
              <div className="furniture-list-item-main">
                <div className="furniture-thumb-wrap">
                  {m.img ? (
                    <img
                      src={m.img}
                      alt={m.name}
                      className="furniture-thumb"
                    />
                  ) : m.shape === "circle" ? (
                    <div className="thumb-circle" />
                  ) : (
                    <div className="thumb-rect" />
                  )}
                </div>

                <div className="furniture-list-text">
                  <span className="furniture-name">{m.name}</span>
                  <span className="furniture-size">
                    {m.widthMm} × {m.heightMm} mm
                  </span>
                </div>
              </div>

              <button
                className="btn-add"
                onClick={() => handleAddFurniture(m.id)}
              >
                部屋に追加
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* 右：間取りキャンバス */}
      <main className="canvas-panel">
        <RoomCanvas
          room={{
            widthMm: currentPlan.widthMm,
            heightMm: currentPlan.heightMm,
          }}
          planId={currentPlan.id}
          masters={masters}
          placed={placed}
          zoom={zoom}
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          step={STEP}
          onZoomChange={setZoom}
          onMove={handleMoveFurniture}
          onRotate={handleRotateFurniture}
          onRemove={handleRemoveFurniture}
          onResize={handleResizeFurniture}
          measurements={measurements}
          activeTool={activeTool}
          wallSnapEnabled={wallSnapEnabled}
          fineMode={fineMode}
          onMeasurementAdd={handleAddMeasurement}
          onMeasurementRemove={handleRemoveMeasurement}
          showTraffic={showTraffic}
        />

        {/* 間取り選択モーダル */}
        {isPlanModalOpen && (
          <div
            className="modal-backdrop"
            onClick={() => setPlanModalOpen(false)}
          >
            <div
              className="modal"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="modal-title">間取りを選択</h2>
              <ul className="plan-list">
                {FLOORPLANS.map((p) => (
                  <li
                    key={p.id}
                    className="plan-item"
                    onClick={() => {
                      setCurrentPlan(p);
                      setPlaced([]); // 必要なら家具リセット
                      setPlanModalOpen(false);
                    }}
                  >
                    <div className="plan-item-name">{p.name}</div>
                    <div className="plan-item-detail">
                      <span>{p.layout}</span>
                      <span>{p.area}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
